import { anchorFromTopic, anchorFromUrl, isUrl } from "@/lib/analysis/anchor";
import {
  computeCoverage,
  gateBlindSpots,
  verifyBlindSpot,
} from "@/lib/analysis/blindspot";
import {
  analyseFraming,
  buildConsensus,
  extractClaims,
  judgeRelevance,
} from "@/lib/analysis/stages";
import type {
  ActivityEvent,
  AnalyzeResult,
  ArticleReport,
  BlindSpotFinding,
  FramingReport,
  OutletPhase,
  OutletReport,
} from "@/lib/analysis/types";
import type { EventAnchorPayload, SpectrumDetail } from "@/lib/analysis/schemas";
import { getLlmConfig } from "@/lib/env";
import {
  groupLabels,
  outlets,
  outletsByGroup,
  thresholds,
  type Outlet,
} from "@/lib/config";
import {
  fetchArticles,
  searchOutletCoverage,
  type SearchResult,
} from "@/lib/tinyfish";

type Emit = (event: ActivityEvent) => void;

type SearchAttempt = {
  outlet: Outlet;
  results: SearchResult[];
  cached: boolean;
  error?: string;
};

const now = () => new Date().toISOString();

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function outletEvent(
  outlet: Outlet,
  phase: OutletPhase,
  extra: {
    detail?: string;
    count?: number;
    source?: "live" | "cached";
  } = {},
): ActivityEvent {
  return {
    type: "outlet",
    outletId: outlet.id,
    name: outlet.name,
    domain: outlet.domain,
    group: outlet.group,
    phase,
    at: now(),
    ...extra,
  };
}

function outletOf(id: string): Outlet {
  const found = outlets.find((outlet) => outlet.id === id);
  if (!found) throw new Error(`Unknown outlet id: ${id}`);
  return found;
}

function mostCommon(values: Array<string | null>): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return "Other";

  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best[0];
}

function spectrumDetail(reports: OutletReport[]): SpectrumDetail {
  const relevant = reports.flatMap((report) =>
    report.articles.filter((article) => article.status === "relevant"),
  );
  const framed = relevant.filter(
    (article): article is ArticleReport & { framing: FramingReport } =>
      Boolean(article.framing),
  );

  const slant =
    framed.length === 0
      ? 0
      : framed.reduce((sum, article) => sum + article.framing.slant_score, 0) /
        framed.length;
  const dominant = mostCommon(
    framed.map((article) => article.framing.dominant_frame),
  );

  const techniqueCounts = new Map<string, number>();
  for (const article of framed) {
    for (const hit of article.framing.persuasion) {
      techniqueCounts.set(hit.technique, (techniqueCounts.get(hit.technique) ?? 0) + 1);
    }
  }
  const techniques = [...techniqueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([technique]) => technique);

  const roleMap = new Map<string, string>();
  for (const article of framed) {
    for (const role of article.framing.entity_roles) {
      if (!roleMap.has(role.entity_name)) {
        roleMap.set(role.entity_name, role.assigned_role);
      }
    }
  }
  const entityRoles = [...roleMap.entries()]
    .slice(0, 5)
    .map(([entity_name, assigned_role]) => ({ entity_name, assigned_role }));

  const aligned = framed.filter(
    (article) => article.framing.slant_score >= thresholds.slant_label_threshold,
  ).length;
  const critical = framed.filter(
    (article) => article.framing.slant_score <= -thresholds.slant_label_threshold,
  ).length;

  const summary =
    relevant.length === 0
      ? ""
      : `${relevant.length} relevant article${relevant.length === 1 ? "" : "s"}. Most common frame: ${dominant}. ${
          framed.length === 0
            ? "Framing analysis unavailable."
            : `${critical} scored government-critical, ${aligned} government-aligned, and ${
                framed.length - critical - aligned
              } mixed or neutral. ${techniques.length} persuasion technique${
                techniques.length === 1 ? "" : "s"
              } detected across this group.`
        }`;

  return {
    article_count: relevant.length,
    average_slant_score: Number(slant.toFixed(2)),
    dominant_mfc_frame: dominant,
    perspective_summary: summary,
    detected_persuasion_techniques: techniques,
    key_entity_roles: entityRoles,
  };
}

function buildPayload(options: {
  eventId: string;
  canonicalTitle: string;
  timestamp: string;
  facts: string[];
  reports: OutletReport[];
  findings: BlindSpotFinding[];
}): EventAnchorPayload {
  const of = (group: Outlet["group"]) =>
    spectrumDetail(options.reports.filter((report) => report.group === group));

  const alerts = options.findings
    .filter((finding) => finding.status === "notice")
    .map((finding) => ({
      omitted_spectrum:
        finding.group === "left"
          ? ("Left" as const)
          : finding.group === "right"
            ? ("Right" as const)
            : ("Center" as const),
      omission_index: Math.min(1, Math.max(0, finding.omission_index)),
      description: finding.description,
    }));

  return {
    event_id: options.eventId,
    canonical_title: options.canonicalTitle,
    timestamp_updated: options.timestamp,
    consensus_fact_core: options.facts,
    blind_spot_alerts: alerts,
    spectrum_breakdown: {
      left: of("left"),
      center: of("center"),
      right: of("right"),
    },
  };
}

function buildCaveats(options: {
  llmMode: "live" | "mock";
  covering: number;
  facts: number;
}): string[] {
  const caveats = [
    `Results hold only for this event, these ${outlets.length} outlets, and a ${Math.round(
      thresholds.search_window_minutes / 1440,
    )}-day search window.`,
    `"Consensus" means reported by at least ${Math.round(
      thresholds.consensus_share * 100,
    )}% of the outlets that covered the event. It is not a claim of objectivity.`,
    "Frame, persuasion, and slant labels are model estimates; every label links to a quoted excerpt.",
    `Group sizes: ${groupLabels.left.toLowerCase()} ${outletsByGroup.left.length}, ${groupLabels.right.toLowerCase()} ${outletsByGroup.right.length}, ${groupLabels.center.toLowerCase()} ${outletsByGroup.center.length}. With ${outletsByGroup.left.length} outlets, the smallest group's coverage moves in discrete steps.`,
  ];

  if (options.llmMode === "mock") {
    caveats.push(
      "LLM stages ran in mock mode: labels come from deterministic fixtures, not live analysis.",
    );
  }
  if (options.covering < 2) {
    caveats.push(
      "Fewer than two outlets covered this event, so no cross-outlet consensus is shown.",
    );
  }
  if (options.facts === 0) {
    caveats.push("No consensus facts reached the support threshold for this run.");
  }

  return caveats;
}

export async function runAnalysis(
  rawInput: string,
  emit: Emit,
): Promise<AnalyzeResult> {
  const startedAt = Date.now();
  const deadline = startedAt + thresholds.pipeline_deadline_ms;
  const llm = getLlmConfig();

  const log = (message: string) =>
    emit({ type: "log", message, at: now() });

  const stage = async <T>(
    name: string,
    message: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    const start = Date.now();
    emit({ type: "stage", stage: name, status: "start", message, at: now() });
    try {
      const value = await run();
      emit({
        type: "stage",
        stage: name,
        status: "done",
        message,
        at: now(),
        duration_ms: Date.now() - start,
      });
      return value;
    } catch (error) {
      emit({
        type: "stage",
        stage: name,
        status: "skip",
        message: error instanceof Error ? error.message.slice(0, 200) : "failed",
        at: now(),
        duration_ms: Date.now() - start,
      });
      throw error;
    }
  };

  const input = rawInput.trim();
  if (input.length < 3) {
    throw new Error("Enter a topic or a news URL with at least 3 characters.");
  }

  // 1. Anchor the event once, so every outlet is searched for the same thing.
  const anchored = await stage("anchor", "Anchoring the event", async () => {
    if (isUrl(input)) return anchorFromUrl(input);
    return { anchor: anchorFromTopic(input), note: null as string | null };
  });
  const { anchor } = anchored;
  if (anchored.note) log(anchored.note);

  // 2. One scoped TinyFish Search per outlet.
  const attempts = await stage(
    "search",
    `Searching ${outlets.length} outlet domains`,
    async () =>
      mapLimit(outlets, thresholds.outlet_search_concurrency, async (outlet) => {
        emit(outletEvent(outlet, "searching", { detail: anchor.query }));

        try {
          const response = await searchOutletCoverage({
            outlet,
            query: anchor.query,
            recencyMinutes: thresholds.search_window_minutes,
            cacheTtlSeconds: thresholds.cache_ttl_seconds,
          });

          const results = [...response.results]
            .sort((a, b) => a.position - b.position)
            .slice(0, thresholds.max_search_results_per_outlet);

          emit(
            outletEvent(
              outlet,
              results.length === 0 ? "no_results" : "search_done",
              {
                count: results.length,
                source: response.cached ? "cached" : "live",
              },
            ),
          );

          return {
            outlet,
            results,
            cached: response.cached,
          } satisfies SearchAttempt;
        } catch (error) {
          const detail =
            error instanceof Error ? error.message.slice(0, 200) : "search failed";
          emit(outletEvent(outlet, "no_results", { detail, count: 0 }));
          return {
            outlet,
            results: [],
            cached: false,
            error: detail,
          } satisfies SearchAttempt;
        }
      }),
  );

  const reports: OutletReport[] = attempts.map((attempt) => ({
    outletId: attempt.outlet.id,
    name: attempt.outlet.name,
    domain: attempt.outlet.domain,
    homepage: attempt.outlet.homepage,
    group: attempt.outlet.group,
    rating_source: attempt.outlet.rating_source,
    rating_url: attempt.outlet.rating_url,
    searched: attempt.error === undefined,
    search_source:
      attempt.error !== undefined ? "none" : attempt.cached ? "cached" : "live",
    search_results: attempt.results.length,
    articles: [],
    covered: false,
    error: attempt.error,
  }));

  const candidates = attempts
    .flatMap((attempt) =>
      attempt.results
        .slice(0, thresholds.max_articles_per_outlet)
        .map((result) => ({ outlet: attempt.outlet, result })),
    )
    .slice(0, thresholds.max_articles_total);

  const uniqueUrls = [...new Set(candidates.map(({ result }) => result.url))];

  if (candidates.length === 0) {
    log("No article URLs were returned by any outlet search.");
  }

  // 3. TinyFish Fetch, batched (the API accepts at most 10 URLs per request).
  type Fetched = Awaited<ReturnType<typeof fetchArticles>>;
  let fetched: Fetched = { results: [], errors: [], cached: 0 };

  if (uniqueUrls.length > 0) {
    await stage(
      "fetch",
      `Reading ${uniqueUrls.length} article URL${uniqueUrls.length === 1 ? "" : "s"} with TinyFish Fetch`,
      async () => {
        for (const attempt of attempts) {
          if (attempt.results.length > 0) {
            emit(outletEvent(attempt.outlet, "reading"));
          }
        }
        try {
          fetched = await fetchArticles({
            urls: uniqueUrls,
            purpose:
              "Read one event's coverage across a fixed outlet set for claim and framing analysis",
            cacheTtlSeconds: thresholds.cache_ttl_seconds,
          });
        } catch (error) {
          log(
            `Fetch failed: ${
              error instanceof Error ? error.message.slice(0, 160) : "unknown error"
            }. Articles are marked not accessible, not omitted.`,
          );
        }
      },
    );
  }

  const pageByUrl = new Map(
    fetched.results.flatMap((page) => [
      [page.url, page] as const,
      [page.final_url, page] as const,
    ]),
  );
  const errorByUrl = new Map(fetched.errors.map((error) => [error.url, error]));

  for (const attempt of attempts) {
    const report = reports.find((item) => item.outletId === attempt.outlet.id);
    if (!report) continue;

    for (const result of attempt.results.slice(0, thresholds.max_articles_per_outlet)) {
      const page = pageByUrl.get(result.url);
      const failure = errorByUrl.get(result.url);

      report.articles.push({
        url: result.url,
        title: page?.title ?? result.title,
        outletId: report.outletId,
        outletName: report.name,
        group: report.group,
        published_at: page?.published_date ?? result.date ?? null,
        status: failure || !page ? "not_accessible" : "relevant",
        fetch: page ? "ok" : "failed",
        error: failure?.error,
        claims: [],
        notes: [],
      });
    }

    if (
      report.articles.length > 0 &&
      report.articles.every((article) => article.fetch === "failed")
    ) {
      emit(
        outletEvent(attempt.outlet, "read_failed", {
          detail:
            attempt.error ??
            "Article could not be read. A failed fetch is not evidence of omission.",
        }),
      );
    }
  }

  // 4. Relevance, claims, and framing for every accessible candidate. Looking
  // at both configured results per outlet prevents an unrelated top result
  // from hiding a relevant second result.
  const analyzable = reports.flatMap((report) =>
    report.articles
      .filter((article) => article.fetch !== "failed")
      .map((article) => ({ report, article })),
  );

  await stage(
    "analysis",
    `Checking relevance, claims, and framing for ${analyzable.length} article${analyzable.length === 1 ? "" : "s"}`,
    async () => {
      await mapLimit(
        analyzable,
        thresholds.llm_concurrency,
        async ({ report, article }) => {
          const outlet = outletOf(report.outletId);
          const page = pageByUrl.get(article.url);

          try {
            if (!page) {
              article.status = "not_accessible";
              return;
            }
            if (Date.now() > deadline) {
              article.status = "unavailable";
              article.notes.push("Pipeline time budget exhausted before analysis.");
              emit(outletEvent(outlet, "unavailable", { detail: "time budget" }));
              return;
            }

            emit(outletEvent(outlet, "analyzing", {
              detail: article.title ?? article.url,
            }));

            const relevance = await judgeRelevance(anchor, {
              url: article.url,
              text: page.text,
              publishedAt: article.published_at,
            });

            if (!relevance.ok) {
              article.status = "unavailable";
              article.notes.push(`Relevance unavailable: ${relevance.reason}`);
              emit(outletEvent(outlet, "unavailable", { detail: "relevance" }));
              return;
            }

            article.relevance = relevance.value;
            if (
              !relevance.value.relevant ||
              relevance.value.confidence < 0.5
            ) {
              article.status = "irrelevant";
              article.notes.push(relevance.value.reason);
              emit(
                outletEvent(outlet, "irrelevant", {
                  detail: relevance.value.reason,
                }),
              );
              return;
            }

            const claims = await extractClaims(anchor, outlet, {
              url: article.url,
              text: page.text,
              publishedAt: article.published_at,
            });
            if (claims.ok) {
              article.claims = claims.value;
            } else {
              article.notes.push(`Claims unavailable: ${claims.reason}`);
            }

            const framing = await analyseFraming(anchor, outlet, {
              url: article.url,
              text: page.text,
              publishedAt: article.published_at,
            });
            if (framing.ok) {
              article.framing = framing.value;
              if (!framing.value.dominant_frame) {
                article.notes.push(
                  "Frame label dropped: its evidence quote did not match the article.",
                );
              }
            } else {
              article.notes.push(`Framing unavailable: ${framing.reason}`);
            }

            article.status = "relevant";
            emit(
              outletEvent(outlet, "analyzed", {
                detail: `${article.claims.length} claims verified`,
                count: article.claims.length,
              }),
            );
          } catch (error) {
            article.status = "unavailable";
            article.notes.push(
              `Analysis unavailable: ${error instanceof Error ? error.message.slice(0, 160) : "unexpected error"}`,
            );
            emit(outletEvent(outlet, "unavailable", { detail: "analysis error" }));
          }
        },
      );
    },
  );

  for (const report of reports) {
    report.covered = report.articles.some(
      (article) => article.status === "relevant",
    );
  }

  // 5. Consensus core.
  const covering = reports.filter((report) => report.covered).length;
  const consensus = await stage(
    "consensus",
    "Building the consensus fact core",
    async () =>
      buildConsensus({
        anchor,
        articles: reports
          .filter((report) => report.covered)
          .map((report) => ({
            outletId: report.outletId,
            outletName: report.name,
            url:
              report.articles.find((article) => article.status === "relevant")
                ?.url ?? report.homepage,
            claims: report.articles.flatMap((article) => article.claims),
          })),
        coveringOutlets: covering,
      }),
  );
  if (consensus.note) log(consensus.note);

  // 6. Blind-spot gate, then the mandatory TinyFish absence check.
  const coverage = computeCoverage(reports);
  const decisions = gateBlindSpots({
    coverage,
    consensusFacts: consensus.facts.length,
    totalClaims: consensus.totalClaims,
  });

  const findings = await stage(
    "blindspot",
    "Checking coverage gaps",
    async () => {
      const toVerify = decisions.filter(
        (decision) => decision.status === "candidate",
      );

      if (toVerify.length === 0) {
        return decisions.map(
          (decision): BlindSpotFinding => ({
            group: decision.group,
            status: "quiet",
            omission_index: decision.omission_index,
            overall_coverage: decision.overall_coverage,
            claim_support: decision.claim_support,
            coverage: coverage[decision.group],
            description: decision.reason,
            evidence: [],
            notes: [],
          }),
        );
      }

      for (const decision of toVerify) {
        for (const outlet of outlets.filter(
          (candidate) => candidate.group === decision.group,
        )) {
          emit(
            outletEvent(outlet, "absence_check", {
              detail: "site search via TinyFish Agent",
            }),
          );
        }
      }

      return Promise.all(
        decisions.map(async (decision): Promise<BlindSpotFinding> => {
          if (decision.status !== "candidate") {
            return {
              group: decision.group,
              status: "quiet",
              omission_index: decision.omission_index,
              overall_coverage: decision.overall_coverage,
              claim_support: decision.claim_support,
              coverage: coverage[decision.group],
              description: decision.reason,
              evidence: [],
              notes: [],
            };
          }

          const finding = await verifyBlindSpot({
            decision,
            coverage,
            eventQuery: anchor.query,
          });

          for (const outlet of outlets.filter(
            (candidate) => candidate.group === decision.group,
          )) {
            const evidence = finding.evidence.find(
              (item) => item.outlet === outlet.name,
            );
            emit(
              outletEvent(
                outlet,
                finding.status === "notice" ? "absent" : "absence_inconclusive",
                { detail: evidence?.notes },
              ),
            );
          }

          return finding;
        }),
      );
    },
  );

  const generatedAt = new Date().toISOString();
  const payload = buildPayload({
    eventId: anchor.event_id,
    canonicalTitle: anchor.canonical_title,
    timestamp: generatedAt,
    facts: consensus.facts.map((fact) => fact.text),
    reports,
    findings,
  });

  return {
    event: anchor,
    payload,
    facts: consensus.facts,
    outlets: reports,
    blind_spots: findings,
    consensus: {
      covering_outlets: covering,
      monitored_outlets: outlets.length,
      consensus_share: thresholds.consensus_share,
      total_claims: consensus.totalClaims,
    },
    mode: {
      llm: llm.mode,
      llm_model: llm.model,
      tinyfish: reports.some((report) => report.search_source === "live")
        ? "live"
        : "cached",
      replay: false,
    },
    generated_at: generatedAt,
    duration_ms: Date.now() - startedAt,
    caveats: buildCaveats({
      llmMode: llm.mode,
      covering,
      facts: consensus.facts.length,
    }),
    activity: [],
  };
}
