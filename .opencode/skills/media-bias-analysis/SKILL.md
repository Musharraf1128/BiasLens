---
name: Media Bias Analysis
description: Use for BiasLens's analysis layer: event anchoring, relevance filtering, claim extraction, consensus fact core, MFC frames, persuasion techniques, entity roles, masked slant scoring, and blind-spot math. Enforces evidence, small-sample honesty, and neutral wording.
---

# Media Bias Analysis

This skill defines the analytical contracts. Use it with
`llm-structured-output` for the JSON plumbing and `tinyfish` for retrieval.

## Pipeline order

```
anchor -> per-outlet search -> fetch -> relevance -> claims -> consensus
       -> per-outlet framing -> blind-spot gate -> payload
```

Do not run framing on an article that failed relevance. Do not compute a
blind-spot notice from search results alone.

## 1. Event anchor

MVP: no embeddings, no clustering.

```ts
type EventAnchor = {
  event_id: string;          // uuid
  canonical_title: string;   // headline-style, <=120 chars
  query: string;             // short search query, <=12 words
  timestamp_updated: string; // ISO
  seed_url?: string;
};
```

- From a topic: use the topic as both title and query, trimmed.
- From a seed URL: fetch it, use its headline and first paragraph to form a
  canonical title; strip site name and SEO suffixes.
- Keep the anchor stable across all outlet searches so comparisons are fair.
- Do not add outlet names to the anchor.

## 2. Relevance

Ask a binary question: **is this article about the same specific event**, not
the same broad topic?

```ts
type Relevance = {
  relevant: boolean;
  confidence: number;   // 0..1
  reason: string;       // <=30 words
};
```

- Compare who / what / when / where. "Budget passed" vs "budget protests" are
  different events.
- Drop `relevant: false`. Drop `confidence < 0.5` unless the article is a clear
  match.
- A rejected article is not evidence of omission.

## 3. Claims and the consensus core

### Claim extraction

One atomic claim per statement, subject-predicate-object style, stripped of
evaluation and loaded language.

```ts
type Claim = {
  claim_id: string;
  text: string;          // normalized, <=30 words, no adjectives of judgment
  subject: string;
  predicate: string;
  object: string;
  source_url: string;
  excerpt: string;       // verbatim, <=25 words
  outlet: string;
  published_at?: string;
};
```

Rules:

- Facts only: who did what, when, where, with what number. No "shockingly",
  "failed to", "refused to" unless that is the literal reported action.
- Resolve pronouns to named entities using the article.
- Keep numbers with units and dates; do not normalize away uncertainty
  ("about 200" stays "about 200").
- The excerpt must be an exact substring of the fetched article. If it cannot
  be found, drop the claim.
- Deduplicate within an article before cross-outlet matching.

### Consensus

Two claims support each other when they describe the same normalized
subject-predicate-object, allowing paraphrase, synonyms, and date/number
tolerance. Use an LLM grouping pass, then verify with the excerpts.

```
support(claim) = number of distinct outlets with at least one supporting claim
covering_outlets = outlets with at least one relevant article
share = support / covering_outlets
consensus = share >= config.consensus_share   // default 0.60
```

- Store `source_urls[]` and one representative `excerpt` per supporting outlet.
- The UI says "facts reported by N of M outlets".
- The long-term target is 0.75; the MVP default is 0.60. Make it config.
- If only one outlet covered the event, there is no meaningful consensus; show
  the single-outlet facts as "reported by 1 outlet", not as consensus.

## 4. Framing

### Dominant MFC frame

Choose exactly one from the 15 Media Frames Corpus frames in
`references/taxonomies.md`. Return the frame plus a <=25-word evidence quote.

```ts
type Framing = {
  dominant_frame: MfcFrame;
  frame_evidence: string;
  persuasion: PersuasionHit[];
  entity_roles: EntityRole[];
  slant_score: number;       // -1..+1
  slant_rationale: string;   // <=30 words
};
```

- If the article genuinely fits none, use `Other`; do not force a frame.
- The frame is a model estimate. Label it that way in the UI.

### Persuasion techniques

Use the 23 SemEval-2023 Task 3 techniques in `references/taxonomies.md`.

```ts
type PersuasionHit = {
  technique: PersuasionTechnique;
  excerpt: string;   // verbatim, <=25 words
  explanation: string;
};
```

- Require a quoted span for every hit. No span, no hit.
- Cap at 5 hits per article, strongest first.
- Do not label neutral reported speech as persuasion.
- The taxonomy in the spec was written from memory. Verify the canonical names
  against the official SemEval-2023 Task 3 guidelines before finalizing prompts.

### Entity roles

Top 3-5 named entities only.

- Victim / Exploited / Scapegoat
- Villain / Instigator
- Guardian / Hero / Peacemaker

Return `{ entity_name, assigned_role, excerpt }`. The same entity may have
different roles across outlets; that contrast is the product.

### Slant (masked)

- Scale: **-1 = government-critical, 0 = mixed/neutral, +1 = government-aligned**.
- Mask the outlet name, domain, byline, and any self-reference before scoring.
  Replace with "the outlet".
- Score only the article text, not the outlet's reputation.
- Store both masked and unmasked scores; report the mean absolute difference
  (masking delta) in validation.
- Do not use a phrase-frequency model in the MVP.

## 5. Blind-spot gate

Definitions and worked examples are in `references/blind-spot.md`.

```
V_e,p = covered outlets in group p / monitored outlets in group p
O_e,p = 1 - V_e,p / max_{q != p} V_e,q      (null if max is 0)
D_e,p = consensus facts / distinct extracted claims across covering outlets
```

Alert only when **all** hold:

- `O >= 0.70` (config)
- `V_overall >= 0.40` (config)
- `D >= 0.65` (config)
- the TinyFish absence check passed for every outlet in the group

Guards:

- Empty group (`mixed`): no alert, `article_count: 0`.
- Max coverage 0: no alert.
- Fewer than 2 covering outlets overall: no blind-spot claim.
- With 3 outlets per group, V ∈ {0, 0.33, 0.67, 1}; the 0.70 threshold only
  fires at zero coverage. Say "X of Y outlets in this group covered it".
- Never say "ignored" or "hid". Use the absence wording from `biaslens`.

## 6. Output payload

Keep the `EventAnchorPayload` field names from the spec. Add optional
`source_urls` and `excerpt` per fact outside the required set. For an empty
group return `article_count: 0`, `average_slant_score: 0`,
`dominant_mfc_frame: "Other"`, `perspective_summary: ""`, and empty arrays.

## 7. Validation that must accompany the demo

- 3-5 events; a human reads >=4 outlets per event and labels key facts, dominant
  frame per outlet, and coverage.
- Report per-event agreement for facts, frames, and coverage.
- Report absence-check precision: confirmed / raised.
- Report masking delta: mean absolute difference between masked and unmasked
  slant scores.
- State that results hold only for these events and outlets.

## 8. Common failure modes

| Failure | Guard |
| --- | --- |
| Treating same-topic as same-event | Relevance prompt compares who/what/when/where |
| Paraphrase counted twice | Deduplicate by normalized triple + outlet |
| LLM invents a quote | Verify excerpt is an exact substring; drop otherwise |
| Outlet name drives slant | Mask name/domain/byline; report delta |
| Absence from failed fetch | Absence check must pass; otherwise inconclusive |
| Forced 15-frame label | Allow `Other`; require evidence |
| Persuasion on neutral text | Require quoted span + explanation |
| Small-sample overclaim | Show X of Y; suppress alerts below 2 outlets |
| Sarcasm/opinion read as fact | Claims only for reported events; flag opinion pieces |

## 9. References

- `references/taxonomies.md` — MFC frames, persuasion techniques, entity roles.
- `references/blind-spot.md` — formulas, worked examples, edge cases.
