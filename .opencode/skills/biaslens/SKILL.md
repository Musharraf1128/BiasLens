---
name: BiasLens Build Guardrails
description: Use for any BiasLens implementation decision, scope question, feature addition, or pre-demo check. Enforces the MVP spec, cut line, TinyFish centrality, evidence and wording rules, config-driven thresholds, and safe data/secret handling.
---

# BiasLens Build Guardrails

## Source of truth

- Read `BIASLENS_BUILD_SPEC.md` **Part 1** before any non-trivial change. Use Part 2 only for TinyFish and Part 3 only as reference.
- Build nothing from Part 3 unless Part 1 explicitly calls for it.
- If Part 1 and Part 3 disagree, Part 1 wins. If the spec and a shortcut disagree, the spec wins.
- Ask before adding scope. Do **not** add auth, a database, a vector store, Kafka, fine-tuning, embeddings/clustering, or vernacular pipelines in the MVP.

## What we are building

Given a topic or seed URL, BiasLens shows side by side how a fixed outlet set
covered the same event:

1. Anchor the event (canonical title + short query).
2. Discover coverage per outlet with **TinyFish Search**.
3. Read articles with **TinyFish Fetch**.
4. Relevance-filter with an LLM.
5. Extract claims, then build the **Consensus Fact Core** (default 60% of
   covering outlets; config value).
6. Per-outlet framing: dominant MFC frame, persuasion techniques with a quoted
   evidence span, entity roles, and masked slant.
7. **Verified** blind-spot notice only after the TinyFish absence check passes.
8. UI: live panel of outlets being searched/read, then side-by-side result with
   a source link next to every fact.

Never produce one "objective" summary. The product is a consensus fact core plus
explicit per-outlet framing.

## Non-negotiables

- **TinyFish is central.** It does the finding, reading, and coverage checking.
  It is not a side add-on and must be visible in the demo.
- **Evidence or it does not ship.** Every fact, frame, and persuasion technique
  carries a source URL and a verbatim excerpt of at most 25 words. If there is no
  excerpt, drop the item.
- **Strict JSON.** Every LLM stage returns JSON. Validate it; on failure retry
  once with the validation error, then mark the item `unavailable`. Never guess.
- **Cache everything.** Cache by URL/query/content hash. The demo must run from
  cache if a live API fails.
- **Config, not code.** Outlet registry, thresholds, recency windows, model IDs,
  and feature flags live in `config/` or env, not in components.
- **Group mapping.** Schema fields stay `left` / `center` / `right`, but their
  meaning is **government-critical / mixed / government-aligned**. Show the
  third-party rating source in the UI.
- **Empty groups still render.** For the empty mixed group return
  `article_count: 0` and empty arrays, never omit the key.

## Wording rules

- Never say an outlet "ignored", "hid", "suppressed", or was "silent".
- Say: "No matching article found by outlet search and on-site search on
  <date/time>."
- Consensus is "facts reported by **N of M** outlets", with links.
- Framing and persuasion labels are "model estimates" shown with the quoted
  evidence span.
- Next to any blind-spot notice show "X of Y outlets in this group covered it".
- State that results hold only for these events and outlets.

## Safe data and secret handling

- Persist **URL, title, short excerpts, and derived labels only**. Analyze full
  article text in memory. Do not commit full article text.
  - `data/cache/` is gitignored and may hold transient raw fetch text.
  - `data/demo/` is committed and holds derived results plus <=25-word excerpts.
- Public pages only. No logins, paywalls, CAPTCHA solving, private IPs, or
  attempts to evade access controls.
- A failed or blocked fetch is **not** evidence of omission.
- Never print, log, or commit API keys. `.env.local` is gitignored and
  server-side only; never use a `NEXT_PUBLIC_` key.
- Do not add analytics or third-party calls beyond TinyFish and the configured
  LLM endpoint.

## Definition of done for a feature

- Runs live end to end on at least one prepared demo story.
- Has a cached fallback and a visible `live` / `cached` / `unavailable` state.
- Validates JSON at the boundary; no untyped payloads reach the UI.
- Shows source link + evidence for every extracted item.
- `npm run check` passes and the browser console is clean.
- The wording rules above are visible in the UI copy, not just the code.

## Build order and cut line

1. Anchor + per-outlet search + fetch + relevance + claims + consensus + UI.
2. Framing analysis.
3. Blind-spot notice.

Cut from the bottom. **Never cut visible TinyFish activity from the demo.**
Plan a feature freeze 30-45 minutes before the end.

## Spec deltas already verified

Part 2 of the spec lists older TinyFish endpoints. Current docs use:

- Search: `GET https://api.search.tinyfish.ai`
- Fetch: `POST https://api.fetch.tinyfish.ai`
- Agent: `https://agent.tinyfish.ai/v1/automation/run|run-async|run-sse`

Use the `tinyfish` skill for verified request/response shapes before coding.

## References

- `references/acceptance.md` — end-to-end acceptance checklist and demo gate.
