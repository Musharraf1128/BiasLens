# BiasLens Build Spec (single source of truth)

This is the only document you need. Do not look for other specs.

- **Part 1** says what to build now (MVP). It is authoritative.
- **Part 2** is the TinyFish integration and API reference.
- **Part 3** is the long-term reference design (condensed from the original research). Build nothing from Part 3 unless Part 1 says so. If Part 3 and Part 1 disagree, Part 1 wins.

---

# PART 1: BUILD BRIEF (MVP)

## 1.1 Product

BiasLens is a multi-perspective news intelligence engine. Given a story, it shows side by side how different outlets covered it: the facts they agree on, how each frames the story, what persuasion techniques each uses, and (only when verified) which outlets did not cover it.

It does **not** produce one "objective" summary that claims to be neutral. It shows a consensus fact core plus explicit per-outlet framing.

Users: news readers who want to see past a single outlet's framing; journalists and researchers comparing coverage.

## 1.2 Constraints

- Build window: about 4.5 hours, solo builder. Plan a feature freeze 30-45 minutes before the end.
- The product must be powered by TinyFish, and TinyFish must be central (it does the finding, reading and coverage-checking), not a side add-on.
- The demo must run live end to end on a prepared set of stories. A working narrow slice beats a broad half-built one.
- Scoring emphasis for the build: how central TinyFish is (35%), problem relevance (25%), working demo (25%), presentation (15%).

## 1.3 MVP user flow

User types a topic or pastes a news URL, then sees a side-by-side comparison across a fixed outlet set.

1. **Event Anchor (simplified).** Input: topic text or one seed URL. Anchor = canonical title + short query string. No embeddings or clustering in the MVP.
2. **Discover coverage per outlet** with TinyFish Search (one scoped search per outlet, see Part 2).
3. **Read articles** with TinyFish Fetch (up to 10 URLs per request, markdown).
4. **Relevance check** with an LLM: drop articles that are not about the event.
5. **Claim extraction** per article (short subject-predicate-object style statements). Build the **Consensus Fact Core**: claims supported by at least a configurable share of the outlets that covered the event (default 60%; the long-term value is 75%).
6. **Framing analysis per outlet** (LLM, taxonomies in the prompt):
   - dominant Media Frames Corpus frame (15-frame list in Part 3),
   - persuasion techniques (list in Part 3), each with a **quoted span** as evidence,
   - entity roles (victim / villain / guardian) for the top named entities,
   - slant on a government-critical to government-aligned scale, scored with the **outlet name masked**.
7. **Blind-spot notice**, only after the TinyFish absence check passes (Part 2, section 2.3).
8. **Output** shaped like the EventAnchorPayload schema in Part 3 (keep field names; map left/center/right as in 1.6).
9. **UI:** a live panel showing outlets being searched and read (TinyFish live view where Agent runs are used), then the side-by-side result with a source link next to every fact.

**Cut line if time runs short (cut from the bottom):** keep steps 1-5 and the UI; then framing (6); then the blind-spot notice (7). Do not cut visible TinyFish activity from the demo.

## 1.3.1 Prompts and structure rules
- Every LLM stage returns strict JSON. Validate it; on failure retry once, then mark the item "unavailable" instead of guessing.
- Every extracted fact, frame and technique must carry the source URL and a quoted excerpt of at most 25 words.
- Cache all TinyFish and LLM results by URL/query so the demo can run from cache.

## 1.4 Decisions that override the original research

| Original design | MVP decision | Reason |
|---|---|---|
| 24-week stack (Kafka, BigQuery, Qdrant, fine-tuned DeBERTa, fine-tuned 70B LLMs) | Hosted LLM API calls with taxonomies in the prompt. No Kafka, BigQuery, vector DB or fine-tuning. | Impossible in 4.5 hours. |
| Left / Center / Right with a US-derived phrase-frequency slant model | Government-critical / mixed / government-aligned axis, with outlet labels from third-party ratings. Drop the phrase-frequency model. | The slant baseline needs partisan corpora that do not exist for Indian outlets; the practical axis in Indian coverage is attitude to the government. |
| SemEval-2023 Task 3 fine-tuned persuasion classifier | LLM with the technique list, quoted evidence span required. English-language outlets first. | That dataset covers English, French, German, Italian, Polish and Russian (plus Spanish, Greek, Georgian as test-only). No Indian languages. |
| Blind-spot rule uses undefined `D_{e,p}` and untested thresholds | Define `D` as in Part 3 section 3.7; all thresholds are config values. | Spec gap. |
| Blind-spot alert based on "no article found" | Alert only after a TinyFish absence check (search + the outlet's own site search + screenshot) comes back empty. | Absence of a scraped article is not evidence of omission (scraper misses, paywalls, bad queries). |
| "Neutrality Score = 1 - SIPS(summary)" | Replace with a small human-labelled check (1.8) plus the masking test. | The formula does not match SIPS as defined; no labelled evaluation set exists. |
| Store full article texts | Store URL, title, short excerpts and derived labels only; analyse text in memory. | Copyright and site-terms risk. Link to the original. |
| Vernacular (Hindi, Tamil, Bengali, Telugu) pipeline | Stage 2: fetch, keep raw text, translate with an LLM, analyse in English. | Out of MVP scope; Indic extraction by Fetch is unverified. |

## 1.5 Small-sample arithmetic (be honest in the UI)
With 3 outlets in a group, coverage can only be 0, 0.33, 0.67 or 1. With `O = 1 - V_p / max_q V_q`, the 0.70 threshold fires only when the group has **zero** coverage. Guard against division by zero (if the maximum coverage is 0, no alert). Show "X of Y outlets in this group covered it" next to any notice.

## 1.6 Outlet registry (MVP seed; verify domains and ratings before use)

Treat `left / center / right` fields in the schema as **government-critical / mixed / government-aligned**. Seed ratings come from Media Bias Fact Check (US-based). A 2023 academic study of Indian election coverage used the same classifications: The Hindu, The Indian Express and NDTV as left or left-center (anti-government framing); Zee News, The Times of India, Republic World and India Today as right or right-center (pro-government framing). These are third-party labels with known disagreement, not ground truth.

| MVP group | Outlets |
|---|---|
| Government-critical | The Hindu, The Indian Express, NDTV |
| Government-aligned | Zee News, The Times of India, Republic World, India Today |
| Mixed | No verified centre outlet found. Leave empty, or add a wire-service reference only after checking its rating. |

Store in a config file: `name, domain, group, rating_source, rating_url`. Show the rating source in the UI.

## 1.7 Output wording rules
- Never say an outlet "ignored" or "hid" a story. Say: "No matching article found by outlet search and on-site search on [date/time]."
- Show framing and persuasion labels as model estimates with the quoted evidence span.
- Present consensus as "facts reported by N of M outlets", with links.

## 1.8 Validation (small but real)
- **Human check set:** pick 3-5 events. A human reads articles from at least 4 outlets and writes the key facts, the dominant frame per outlet and who covered the event. Compare with BiasLens output and report agreement per event.
- **Absence-check precision:** a human confirms each blind-spot notice using the outlet's own site search. Report confirmed over raised.
- **Masking test:** score slant with and without the outlet name; report the mean absolute difference (a cheap version of the SIPS idea in Part 3).
- State that results hold only for these events and outlets.

## 1.9 Ground rules
- Follow the cut line. Ask before adding scope.
- Thresholds and outlet lists live in config files, not in code.
- Never print or commit the API key. No `.env` in the repo.
- Public pages only; no logins; do not try to bypass paywalls or CAPTCHAs.
- If a feature is flaky near the end, remove it and fall back to cached results for the demo stories (run each demo story at least once beforehand and store the results).

---

# PART 2: TINYFISH

## 2.1 What TinyFish provides
Live-web access for agents. Three tools matter:
- **Search API:** ranked web results with filters (location, language, include/exclude domains, recency).
- **Fetch API:** clean extracted page content (markdown / html / json) from up to 10 URLs per call, browser-rendered.
- **Agent API:** a goal-driven browser agent (natural-language goal in, structured result out) in real, fresh browser sessions, with a live streaming URL, per-step screenshots, optional recordings, and stealth/proxy options.

## 2.2 Where each is used

**Search: coverage discovery.** One search per outlet with `include_domains` set to the outlet domain, a `recency_minutes` window for recent stories, and `language` / `location` as needed. This replaces GDELT for the MVP and makes later absence claims defensible.

**Fetch: reading articles.** Batch up to 10 article URLs per request with `format: "markdown"`. Per-URL failures come back in `errors[]` without failing the batch; log them. A failed fetch is **not** evidence of omission. For an outlet homepage, use `links: true` to read story-link order (a cheap stand-in for editorial placement). Re-fetching an article later and diffing the text supports stealth-edit detection (stage 2; check how the `ttl` cache parameter behaves first).

**Agent: absence checks, hard pages, live demo.**
- Absence check goal (template): "Open {outlet site}. Use the site's own search for '{event query}'. Return JSON only: {results_found: number, top_titles: [...], searched_url: string}." Capture a screenshot. Show an absence notice only when both scoped Search and the on-site search return nothing.
- Hard pages (cookie walls, JS-heavy, thin Fetch output): Agent with `browser_profile: "stealth"`. Agents cannot solve CAPTCHAs; paywalled content is skipped and reported as "not accessible".
- Demo visibility: run one Agent per outlet in parallel via the SSE endpoint and embed each `STREAMING_URL` in the UI, so the audience watches outlets being read live.

## 2.3 Component map (original design to MVP source)

| Original component | MVP source |
|---|---|
| GDELT GKG (event signals) | User-provided topic or URL (optional later: Search with `recency_minutes`) |
| GDELT Frontpage Graph (placement) | Fetch the outlet homepage with `links: true`, rank the story position |
| GDELT Global Difference Graph (stealth edits) | Stage 2: re-fetch and diff |
| Event Registry / newsapi.ai | Not used in the MVP |
| Regional scraper pool (Hindi, Tamil, Bengali, Telugu) | Fetch + Agent; vernacular in stage 2 |
| Blind-spot coverage data | Search per outlet + Agent absence check |
| Embeddings + UMAP + HDBSCAN clustering | LLM relevance check (MVP); full pipeline later |
| Fine-tuned DeBERTa framing/persuasion models | LLM with taxonomies in the prompt (MVP) |

## 2.4 API reference (from public docs; check for newer versions)

Docs: https://docs.tinyfish.ai. Put the key in the `TINYFISH_API_KEY` environment variable (server side only). Auth header: `X-API-Key`.

**SDKs.** Python: `from tinyfish import TinyFish; client = TinyFish()`; fetch with `client.fetch.get_contents(urls=[...], format="markdown")`. TypeScript: `import { TinyFish } from "@tiny-fish/sdk"`; `client.fetch.getContents({ urls, format: "markdown" })`. An MCP endpoint also exists (`https://agent.tinyfish.ai/mcp`, OAuth) if the coding agent supports MCP.

**Fetch API.** `POST https://api.fetch.tinyfish.ai`. Body: `urls` (max 10, http/https only, private IPs rejected), `format` (`markdown` default, `html`, `json`), `links`, `image_links`, `ttl` (default 3600), `per_url_timeout_ms` (default 45000), optional `proxy_config`. Response: `results[]` (url, title, text, optional links) and `errors[]`.

**Search API.** Parameters seen in SDK/plugin docs: `query` (required), `location`, `language`, `include_domains`, `exclude_domains`, `recency_minutes`, `domain_type`, `page`. Returns ranked results (position, site name, title, snippet, URL). Confirm the exact field names in the official Search reference before coding.

**Agent API.** Base `https://agent.tinyfish.ai/v1`. Endpoints: `/run` (sync, for tasks under about 30 s), `/run-async` (queue, then poll), `/run-sse` (event stream with `STARTED`, `STREAMING_URL`, `PROGRESS`, `HEARTBEAT`, `COMPLETE`). Request body: `url`, `goal`, optional `agent_config.max_steps` (default 150, 1-500 beta), `agent_config.max_duration_seconds`, `capture_config` (screenshots, html, recording), `browser_profile` (`stealth` for protected sites), `proxy_config {enabled, country_code}` (US, GB, CA, DE, FR, JP, AU only; no India exit). Each run starts with a fresh session. Streaming URLs last about 24 hours; recording links expire in about 15 minutes, so save evidence immediately. Cancel with `POST /v1/runs/{id}/cancel`.

## 2.5 Unverified: test these first (about 30 minutes)
1. Parallel run limits, rate limits and credit cost per call (Search, Fetch, Agent).
2. Whether Fetch returns clean article text for each target outlet (some may need the Agent).
3. Fetch and Search behaviour on Hindi, Tamil, Bengali and Telugu pages.
4. Exact Search response fields; whether `include_domains` accepts several domains.
5. Whether a TinyFish exit location changes outlet pages (geo-blocking, cookie walls).
6. Whether GDELT's Frontpage Graph and Global Difference Graph are still published (the MVP does not depend on them).

---

# PART 3: REFERENCE DESIGN (long-term; condensed from the original research)

## 3.1 Problem framing
Recommendation systems optimised for engagement create filter bubbles and confirmation bias; partisan framing entrenches views and triggers the hostile media effect (partisans perceive balanced reporting as biased against them). BiasLens moves from single-source curation to side-by-side contextualisation: it quantifies slant, finds coverage omissions and flags loaded language.

## 3.2 Slant model (long-term; NOT in the MVP)
Adapted Gentzkow-Shapiro phrase-frequency divergence against reference corpora of known orientation. Informativeness of phrase p between two groups (d, r), Pearson chi-square:

```
chi2_p = (f_pd * f_notp_r - f_pr * f_notp_d)^2
         / ((f_pd + f_pr) * (f_pd + f_notp_d) * (f_pr + f_notp_r) * (f_notp_d + f_notp_r))
```
f_pd, f_pr = frequency of phrase p in group d / group r publications; f_notp_d, f_notp_r = counts of all other phrases in each group.

Article slant on [-1, +1]: `S_i = sum over partisan phrases p of w_p * (c_{p,i} / N_i)` where c_{p,i} is the count of phrase p in article i, N_i the article token count, w_p a standardised weight from historical log-odds. Needs a reference corpus for the target country; none is specified for India.

## 3.3 Shift-Induced Prediction Sensitivity (SIPS)
Purpose: ensure a bias-scoring model does not judge identical text differently because of the outlet name. With f(p, o, a) the model prediction for article a, prompt p and outlet o, and f(p, none, a) the prediction without attribution:

```
d(o, a) = f(p, o, a) - f(p, none, a)
AS = mean over articles and outlets of |d(o, a)|      (absolute sensitivity)
AC = mean over articles of Corr(d(o, a), g_o)         (agreement coherence; g_o in {-1, 0, 1} = outlet class)
SIPS = AS * AC          target: below 0.15 (untuned placeholder)
```

## 3.4 Ingestion (long-term)
Tier 1 signal layer: GDELT 2.0 GKG (15-minute updates, 100+ languages), GDELT Frontpage Graph (hourly, about 50,000 homepages, placement prominence), GDELT Global Difference Graph (article revisions, stealth edits, 404s), Event Registry / newsapi.ai (35,000+ sources). Tier 2 full-text layer: scraping workers for targeted URLs and Indian vernacular outlets (Hindi, Tamil, Bengali, Telugu), with machine translation to English while keeping raw text.

## 3.5 Event Anchors (long-term clustering)
1. Embed headline + lead paragraph with a multilingual sentence transformer (all-mpnet-base-v2 or XLM-RoBERTa-base), 768 dimensions, mean pooling.
2. UMAP to 15 dimensions: `n_neighbors=30, n_components=15, metric='cosine'`.
3. HDBSCAN: `min_cluster_size=5, min_samples=3, cluster_selection_epsilon=0.15`; noise = peripheral coverage.
4. Proposition alignment (OpenIE 6.0 / dependency parser), confidence `p_match >= 0.82`. Tuples shared by at least 75% of the sources across the spectrum form the "Consensus Fact Core".

## 3.6 Framing, persuasion, entity roles

**Media Frames Corpus (Card et al., 2015), 15 frames:** Economic; Capacity and Resources; Morality; Fairness and Equality; Legality, Constitutionality, Jurisprudence; Policy Prescription and Evaluation; Crime and Punishment; Security and Defense; Health and Safety; Quality of Life; Cultural Identity; Public Opinion; Political; External Regulation and Reputation; Other. (Note: this corpus was built around US policy issues; generalisation to Indian coverage is unvalidated.)

**Persuasion techniques (SemEval-2023 Task 3, 23 techniques).** The original document tabled six; the full list below is from memory of the task taxonomy, so **verify it against the official task guidelines** before relying on it:
- Attack on reputation: name calling/labeling, guilt by association, casting doubt, appeal to hypocrisy, questioning the reputation.
- Justification: flag waving, appeal to authority, appeal to popularity, appeal to values, appeal to fear/prejudice.
- Distraction: straw man, red herring, whataboutism.
- Simplification: causal oversimplification, false dilemma / no choice, consequential oversimplification.
- Call: slogans, conversation killer, appeal to time.
- Manipulative wording: loaded language, obfuscation/vagueness/confusion, exaggeration/minimisation, repetition.

Original handling notes: loaded language is highlighted and replaced with neutral wording in neutral summaries; appeal to fear is flagged as high-sentiment manipulation; causal oversimplification is annotated and contrasted with complex causes; false dilemma is flagged and alternatives shown; whataboutism/red herring flagged as topic diversion from the event anchor; straw man flagged as distorted counter-arguments.

**Entity role framing:** map named entities (politicians, organisations, groups) to roles: Victim / Exploited / Scapegoat; Villain / Instigator; Guardian / Hero / Peacemaker. Long-term method: dependency trees plus semantic role labelling; MVP: LLM. Highlight contrasting portrayals of the same entity across outlets.

## 3.7 Blind-spot (coverage omission) engine
Event e in a 24-hour window; groups P (originally Left, Center, Right; MVP: government-critical, mixed, government-aligned); S_p = monitored outlets in group p.

```
V_{e,p} = (1 / |S_p|) * sum over outlets s in S_p of 1(s published at least one article on e)
O_{e,p} = 1 - V_{e,p} / max over q != p of V_{e,q}        (if the max is 0: no alert)
```
Alert when all hold (every value is a tunable placeholder in config):
- `O_{e,p} >= 0.70` (coverage in group p is at least 70% lower than the best other group)
- `V_{e,overall} >= 0.40` (widely covered across all outlets)
- `D_{e,p} >= 0.65`

The original document never defines D. **Definition adopted here:** D = (number of consensus facts for the event) / (number of distinct claims extracted across all covering outlets), a value in [0, 1]. Adding a condition that the absence was verified by the TinyFish absence check (Part 2) is mandatory.

## 3.8 Summarisation and quality targets (long-term)
Produce a summary matrix: a consensus summary (from the Consensus Fact Core only, after removing loaded language and persuasion spans) plus explicit left-side and right-side (MVP: government-critical and government-aligned) framing briefs showing differences in causal attribution, entity roles and policy evaluation. Original quantitative targets (untuned placeholders): Neutrality = 1 - SIPS(consensus summary) > 0.88; Fact Retention = |summary facts ∩ consensus facts| / |consensus facts| > 0.92; Framing Separation = cosine distance between the two perspective summary embeddings > 0.45.

## 3.9 Long-term architecture
Event-driven: ingestion (GDELT, APIs, scrapers) into Apache Kafka; scraping workers; embedding and clustering; fine-tuned transformer workers for frames and persuasion; results in PostgreSQL 16 (JSONB) and a vector database (Qdrant or Milvus); Redis cache; API gateway; dashboard. Models: XLM-RoBERTa-base / all-mpnet-base-v2 (embeddings), fine-tuned DeBERTa-v3-large / XLM-RoBERTa (frames and persuasion), fine-tuned Llama-3-70B or Qwen2.5-72B via vLLM (summaries).

## 3.10 Event Anchor payload (JSON Schema, keep field names)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "EventAnchorPayload",
  "type": "object",
  "properties": {
    "event_id": { "type": "string", "format": "uuid" },
    "canonical_title": { "type": "string" },
    "timestamp_updated": { "type": "string", "format": "date-time" },
    "consensus_fact_core": { "type": "array", "items": { "type": "string" } },
    "blind_spot_alerts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "omitted_spectrum": { "type": "string", "enum": ["Left", "Center", "Right"] },
          "omission_index": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "description": { "type": "string" }
        },
        "required": ["omitted_spectrum", "omission_index", "description"]
      }
    },
    "spectrum_breakdown": {
      "type": "object",
      "properties": {
        "left": { "$ref": "#/$defs/SpectrumDetail" },
        "center": { "$ref": "#/$defs/SpectrumDetail" },
        "right": { "$ref": "#/$defs/SpectrumDetail" }
      },
      "required": ["left", "center", "right"]
    }
  },
  "required": ["event_id", "canonical_title", "timestamp_updated",
               "consensus_fact_core", "blind_spot_alerts", "spectrum_breakdown"],
  "$defs": {
    "SpectrumDetail": {
      "type": "object",
      "properties": {
        "article_count": { "type": "integer" },
        "average_slant_score": { "type": "number", "minimum": -1.0, "maximum": 1.0 },
        "dominant_mfc_frame": { "type": "string" },
        "perspective_summary": { "type": "string" },
        "detected_persuasion_techniques": { "type": "array", "items": { "type": "string" } },
        "key_entity_roles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "entity_name": { "type": "string" },
              "assigned_role": { "type": "string" }
            },
            "required": ["entity_name", "assigned_role"]
          }
        }
      },
      "required": ["article_count", "average_slant_score", "dominant_mfc_frame",
                   "perspective_summary", "detected_persuasion_techniques", "key_entity_roles"]
    }
  }
}
```
MVP note: for the empty "mixed" group, return `article_count: 0` and empty arrays instead of omitting the key. Add optional per-fact fields `source_urls` and `excerpt` outside the required set.

## 3.11 Long-term roadmap (24 weeks; reference only)
Phase 1 (weeks 1-6): ingestion and signal layer, scraper pool, baseline phrase lexicon. Phase 2 (7-12): embeddings, UMAP/HDBSCAN clustering, fine-tuned framing and persuasion models. Phase 3 (13-18): omission scoring, summary generation tuned against the Frame In, Frame Out benchmark. Phase 4 (19-24): API gateway, PostgreSQL/Qdrant backend, Redis caching, dashboard, end-to-end latency and SIPS validation.

---

# PART 4: SOURCES
- TinyFish docs: https://docs.tinyfish.ai (Agent endpoints, runs, proxies, browser profiles, Fetch reference and examples).
- SemEval-2023 Task 3 overview (languages, taxonomy): https://aclanthology.org/2023.semeval-1.317.pdf
- Indian election news framing study that used Media Bias Fact Check classifications: https://arxiv.org/pdf/2310.04331
- Media Bias Fact Check pages for Indian outlets (examples): https://mediabiasfactcheck.com/ndtv/ and https://mediabiasfactcheck.com/india-today/
- Original research references (from the source document's works cited): Gentzkow-Shapiro, "What Drives Media Slant? Evidence from U.S. Daily Newspapers"; "Measuring and Mitigating Media Outlet Name Bias in Large Language Models" (EMNLP 2025); "Generalizability of Media Frames" (*SEM 2025); "A Study on Scaling Up Multilingual News Framing Analysis" (arXiv 2404.01481); "Entity Framing and Role Portrayal in the News" (arXiv 2502.14718); "Measuring Framing Bias in LLM-Generated News Summaries" (arXiv 2505.05406).
