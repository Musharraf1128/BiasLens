import {
  ClaimBatchSchema,
  ConsensusBatchSchema,
  FramingSchema,
  RelevanceSchema,
  type Claim,
  type EventAnchor,
  type Relevance,
} from "@/lib/analysis/schemas";
import {
  checkExcerpt,
  maskOutlet,
  normalizeWhitespace,
  selectArticleWindow,
} from "@/lib/analysis/evidence";
import {
  PROMPT_VERSIONS,
  claimsPrompt,
  consensusPrompt,
  framingPrompt,
  relevancePrompt,
} from "@/lib/analysis/prompts";
import type { ConsensusFactDetail, FactEvidence, FramingReport } from "@/lib/analysis/types";
import { cacheKey } from "@/lib/cache";
import { thresholds } from "@/lib/config";
import { chatJson } from "@/lib/llm";

export type StageResult<T> =
  | { ok: true; value: T; cached: boolean }
  | { ok: false; reason: string };

type ArticleForStage = {
  url: string;
  text: string;
  publishedAt?: string | null;
};

function articleCacheParts(anchor: EventAnchor, article: ArticleForStage) {
  return [anchor.canonical_title, anchor.query, article.url];
}

function contentDigest(text: string): string {
  return cacheKey(["content", text]);
}

/** Relevance: is this the same specific event, not just the same topic? */
export async function judgeRelevance(
  anchor: EventAnchor,
  article: ArticleForStage,
): Promise<StageResult<Relevance>> {
  const window = selectArticleWindow(
    article.text,
    anchor.query,
    thresholds.max_article_chars,
  );
  const prompt = relevancePrompt({
    canonicalTitle: anchor.canonical_title,
    query: anchor.query,
    article: { url: article.url, text: window, publishedAt: article.publishedAt },
  });

  const result = await chatJson({
    stage: "relevance",
    system: prompt.system,
    user: prompt.user,
    schema: RelevanceSchema,
    schemaText: "RelevanceSchema",
    promptVersion: PROMPT_VERSIONS.relevance,
    cacheParts: [
      ...articleCacheParts(anchor, article),
      contentDigest(window),
    ],
    maxOutputTokens: 400,
    timeoutMs: thresholds.llm_timeout_ms,
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, value: result.value, cached: result.cached };
}

/**
 * Claims. Every claim must quote the article exactly; a claim with a quote that
 * cannot be found is dropped, not repaired.
 */
export async function extractClaims(
  anchor: EventAnchor,
  outlet: { id: string; name: string },
  article: ArticleForStage,
): Promise<StageResult<Claim[]>> {
  const window = selectArticleWindow(
    article.text,
    anchor.query,
    thresholds.max_article_chars,
  );
  const prompt = claimsPrompt({
    canonicalTitle: anchor.canonical_title,
    query: anchor.query,
    outletName: outlet.name,
    article: { url: article.url, text: window, publishedAt: article.publishedAt },
  });

  const result = await chatJson({
    stage: "claims",
    system: prompt.system,
    user: prompt.user,
    schema: ClaimBatchSchema,
    schemaText: "ClaimBatchSchema",
    promptVersion: PROMPT_VERSIONS.claims,
    cacheParts: [...articleCacheParts(anchor, article), contentDigest(window)],
    maxOutputTokens: 2200,
    timeoutMs: thresholds.llm_timeout_ms,
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  const seen = new Set<string>();
  const claims: Claim[] = [];

  for (const raw of result.value.claims) {
    // The model does not get to set provenance; the pipeline does.
    const claim: Claim = {
      ...raw,
      claim_id: `${outlet.id}:${raw.claim_id}`,
      outlet: outlet.name,
      source_url: article.url,
    };

    const check = checkExcerpt(claim.excerpt, window);
    if (!check.ok) continue;

    const fingerprint = normalizeWhitespace(claim.text).toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    claims.push(claim);
  }

  return { ok: true, value: claims, cached: result.cached };
}

/**
 * Framing. The frame, persuasion hits, and entity roles each need a verified
 * quote, so they are filtered one by one. Slant is a model estimate with a
 * rationale and no quote requirement.
 */
export async function analyseFraming(
  anchor: EventAnchor,
  outlet: { id: string; name: string; domain: string },
  article: ArticleForStage,
): Promise<StageResult<FramingReport>> {
  const window = selectArticleWindow(
    article.text,
    anchor.query,
    thresholds.max_article_chars,
  );
  const masked = maskOutlet(window, {
    name: outlet.name,
    domain: outlet.domain,
  });

  const prompt = framingPrompt({
    canonicalTitle: anchor.canonical_title,
    article: { url: article.url, text: masked, publishedAt: article.publishedAt },
  });

  const result = await chatJson({
    stage: "framing",
    system: prompt.system,
    user: prompt.user,
    schema: FramingSchema,
    schemaText: "FramingSchema",
    promptVersion: PROMPT_VERSIONS.framing,
    cacheParts: [...articleCacheParts(anchor, article), contentDigest(masked)],
    maxOutputTokens: 1800,
    timeoutMs: thresholds.llm_timeout_ms,
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  const framing = result.value;

  const frameOk = checkExcerpt(framing.frame_evidence, window).ok;
  const persuasion = framing.persuasion.filter((hit) =>
    checkExcerpt(hit.excerpt, window).ok,
  );
  const entityRoles = framing.entity_roles.filter((hit) =>
    checkExcerpt(hit.excerpt, window).ok,
  );

  const report: FramingReport = {
    dominant_frame: frameOk ? framing.dominant_frame : null,
    frame_evidence: frameOk ? framing.frame_evidence : null,
    persuasion,
    entity_roles: entityRoles,
    slant_score: Number(framing.slant_score.toFixed(2)),
    slant_rationale: framing.slant_rationale,
  };

  return { ok: true, value: report, cached: result.cached };
}

export type ConsensusOutcome = {
  facts: ConsensusFactDetail[];
  totalClaims: number;
  note: string | null;
};

/**
 * Consensus. The model proposes groups; code recomputes every support count
 * from the claims, so "N of M" can never be inflated by the model.
 */
export async function buildConsensus(options: {
  anchor: EventAnchor;
  articles: Array<{ outletName: string; outletId: string; url: string; claims: Claim[] }>;
  coveringOutlets: number;
}): Promise<ConsensusOutcome> {
  const { anchor, articles, coveringOutlets } = options;
  const allClaims = articles.flatMap((article) => article.claims);

  const distinctTexts = new Set(
    allClaims.map((claim) => normalizeWhitespace(claim.text).toLowerCase()),
  );
  const totalClaims = distinctTexts.size;

  if (coveringOutlets < 2) {
    return {
      facts: [],
      totalClaims,
      note: "Fewer than two outlets covered this event, so there is no cross-outlet consensus to report.",
    };
  }
  if (allClaims.length === 0) {
    return {
      facts: [],
      totalClaims: 0,
      note: "No verified claims were extracted, so there is no consensus core.",
    };
  }

  const prompt = consensusPrompt({
    canonicalTitle: anchor.canonical_title,
    claims: allClaims.map((claim) => ({
      claim_id: claim.claim_id,
      outlet: claim.outlet,
      source_url: claim.source_url,
      text: claim.text,
      excerpt: claim.excerpt,
    })),
  });

  const result = await chatJson({
    stage: "consensus",
    system: prompt.system,
    user: prompt.user,
    schema: ConsensusBatchSchema,
    schemaText: "ConsensusBatchSchema",
    promptVersion: PROMPT_VERSIONS.consensus,
    cacheParts: [
      anchor.canonical_title,
      cacheKey(["claims", allClaims.map((claim) => [claim.claim_id, claim.text])]),
    ],
    maxOutputTokens: 2600,
    timeoutMs: thresholds.llm_timeout_ms,
  });

  if (!result.ok) {
    return { facts: [], totalClaims, note: `Consensus grouping unavailable: ${result.reason}` };
  }

  const byId = new Map(allClaims.map((claim) => [claim.claim_id, claim]));
  const requiredSupport = Math.max(
    2,
    Math.ceil(thresholds.consensus_share * coveringOutlets),
  );
  const seenFacts = new Set<string>();
  const facts: ConsensusFactDetail[] = [];
  let dropped = 0;

  for (const proposed of result.value.facts) {
    const claims = proposed.claim_ids
      .map((id) => byId.get(id))
      .filter((claim): claim is Claim => Boolean(claim));

    const evidenceByOutlet = new Map<string, FactEvidence>();
    for (const claim of claims) {
      if (evidenceByOutlet.has(claim.outlet)) continue;
      evidenceByOutlet.set(claim.outlet, {
        outlet: claim.outlet,
        url: claim.source_url,
        excerpt: claim.excerpt,
      });
    }

    const evidence = [...evidenceByOutlet.values()];
    const support = evidence.length;
    if (support < requiredSupport) {
      dropped += 1;
      continue;
    }

    const text = normalizeWhitespace(proposed.text);
    const fingerprint = text.toLowerCase();
    if (seenFacts.has(fingerprint)) continue;
    seenFacts.add(fingerprint);

    facts.push({
      fact_id: proposed.fact_id,
      text,
      source_urls: [...new Set(evidence.map((item) => item.url))],
      outlets: evidence.map((item) => item.outlet),
      excerpt: evidence[0].excerpt,
      support,
      claim_ids: claims.map((claim) => claim.claim_id),
      covering_outlets: coveringOutlets,
      evidence,
    });
  }

  facts.sort((a, b) => b.support - a.support);

  return {
    facts,
    totalClaims,
    note:
      dropped > 0
        ? `${dropped} proposed group(s) fell below the ${Math.round(
            thresholds.consensus_share * 100,
          )}% support threshold and were left out.`
        : null,
  };
}
