# BiasLens acceptance checklist

Run this before calling the MVP done, and again after the feature freeze.

## 1. Happy path (live)

- [ ] Topic input and seed-URL input both produce an event anchor.
- [ ] One TinyFish Search per configured outlet, scoped with
      `include_domains`, `domain_type=news`, and the configured recency window.
- [ ] Search results are visible per outlet in the live panel.
- [ ] Article URLs are batch-fetched (max 10 per request) with
      `format=markdown`; per-URL errors are logged and do not fail the batch.
- [ ] At least one article per covered outlet reaches the relevance stage.
- [ ] Relevance drops off-event articles; confidence is stored.
- [ ] Claims carry `source_url` and a <=25-word verbatim excerpt.
- [ ] Consensus fact core shows "N of M outlets" for every fact.
- [ ] Framing shows dominant MFC frame per outlet, persuasion techniques with
      quoted spans, entity roles, and a masked slant score.
- [ ] Every fact and frame links to its source URL.
- [ ] Blind-spot notices appear only when the absence check passes.
- [ ] Empty mixed group renders `article_count: 0` and empty arrays.

## 2. Honesty checks

- [ ] No UI copy says "ignored", "hid", "silent", or "suppressed".
- [ ] Blind-spot card says "No matching article found by outlet search and
      on-site search on <time>" and shows "X of Y outlets ...".
- [ ] Framing labels are marked as model estimates.
- [ ] Slant direction is labeled: -1 government-critical, +1 government-aligned.
- [ ] Rating source is visible next to outlet labels.
- [ ] Results are scoped: "these events and outlets only".

## 3. Failure and cache

- [ ] Kill the network / use an invalid key: cached story still renders.
- [ ] TinyFish 429 or 402: UI shows a cached/live-degraded state, not a crash.
- [ ] One Fetch error: article marked "not accessible", event continues.
- [ ] LLM timeout: stage retries once, then item shows "unavailable".
- [ ] Agent absence check fails: **no** blind-spot notice is raised.
- [ ] No API key appears in the browser bundle, logs, or network responses.

## 4. Verification commands

```bash
npm run check        # typecheck + lint
npm run build        # production build
npm run probe        # TinyFish key, search, fetch smoke test
npm run warm-demo    # populate demo cache for prepared stories
```

- [ ] Browser console clean on the demo path.
- [ ] `data/demo/` contains derived results only, no full article text.
- [ ] `.env.local` is ignored by git; `.env.example` contains placeholders only.

## 5. Demo gate

- [ ] 3-5 stories prepared; at least one shows framing contrast, one shows a
      verified blind spot, one shows broad consensus.
- [ ] Each story has been run at least once and cached.
- [ ] Live TinyFish panel works or has a recorded fallback queued.
- [ ] 90-second script rehearsed end to end from a cold browser tab.
- [ ] Feature freeze respected; no unverified feature is on the demo path.
