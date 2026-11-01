---
name: Demo Delivery
description: Use when planning, building, caching, or rehearsing the BiasLens demo under the 4.5-hour constraint. Covers the timebox schedule, cut line, story selection, cache warming, failure fallbacks, live TinyFish visibility, and the 90-second pitch.
---

# Demo Delivery

Scoring emphasis: **TinyFish centrality 35%**, problem relevance 25%, working
demo 25%, presentation 15%. Optimize in that order.

## 4.5-hour timebox

| Window | Work | Exit condition |
| --- | --- | --- |
| 0:00–0:30 | Probe TinyFish key, Search, Fetch, one Agent. Verify outlet domains and 2 stories. | `npm run probe` passes; 7 outlet domains return results |
| 0:30–1:00 | Scaffold config, schemas, cache, TinyFish client, LLM client + mock | `/api/health` and a scripted end-to-end call work |
| 1:00–2:00 | Anchor → per-outlet search → fetch → relevance → claims → consensus | One story returns a consensus core with source links |
| 2:00–2:50 | UI: input, live outlet panel, consensus/facts, source links | Demo path clickable end to end |
| 2:50–3:30 | Framing: MFC frame, persuasion + spans, entity roles, masked slant | One story shows framing contrast |
| 3:30–3:50 | Blind-spot absence check + thresholds + wording | One story has a verified notice or "inconclusive" |
| 3:50–4:00 | Warm demo cache for 3-5 stories; record fallback | Cold-tab replay works |
| 4:00–4:30 | **Feature freeze.** Rehearse, fix only demo-path bugs, polish copy | 90-second run passes twice |

If a stage slips, cut from the bottom (blind spot → framing → polish). Never cut
the visible TinyFish panel.

## Story selection

Pick 3-5 stories before building the UI:

1. **Consensus story** — broad coverage across groups; shows the fact core and
   "N of M".
2. **Framing-contrast story** — same facts, clearly different frames/roles;
   shows the product's value.
3. **Blind-spot story** — one group absent; absence check passes; shows the
   cautionary notice.
4. **Edge story** — sparse coverage or a paywalled outlet; shows graceful
   "inconclusive"/"not accessible" states.
5. Optional: a seed-URL story to prove both input modes.

For each story store:

```jsonc
{
  "id": "budget-session",
  "input": { "type": "topic", "value": "..." },
  "event": { "canonical_title": "...", "query": "..." },
  "payload": { /* EventAnchorPayload + evidence */ },
  "outletActivity": [ /* search/fetch/agent steps for the live panel */ ],
  "cachedAt": "ISO",
  "notes": "what the demo should point at"
}
```

Store derived results only. No full article text in `data/demo/`.

## Cache warming

- Run each story once, live, at least 30 minutes before the demo.
- Save the final payload and the per-outlet activity log.
- Provide a "Use cached demo" control that loads by story id.
- Cache key must include the story id so a live run cannot overwrite a good
  fixture with a partial one.
- Test with the network disabled and with an invalid TinyFish key.

## Failure matrix

| Failure | Demo behavior |
| --- | --- |
| TinyFish 429/402 | Load cached story; banner "live allowance exhausted — cached run" |
| Search returns 0 for an outlet | Show "no matching article found by search"; do not call it omission |
| Fetch `bot_blocked` / `login_required` | Retry Agent stealth once; then "not accessible" |
| Fetch batch partial failure | Continue with successful results; show count |
| LLM timeout/invalid JSON | Retry once; then "analysis unavailable" for that item |
| Agent absence check fails | "coverage check inconclusive"; no blind-spot notice |
| SSE disconnect | Poll run; if still failing, use cached activity |
| Entire backend down | Static cached replay page |

Never show a stack trace, raw JSON, or an empty panel on the demo path.

## Live TinyFish visibility

This is 35% of the score. Show it even if the rest is cached:

- During discovery, render one row per outlet: searching → reading → analyzed.
- When using Agent, embed the `streaming_url` in an iframe for one or two
  outlets. Keep a fallback screenshot/recording because links expire.
- Show the actual query, domain, timestamp, and result count.
- Label the panel "TinyFish: live web" and distinguish cached steps.
- Do not fake progress. If replaying cache, say "cached run from 14:20".

## 90-second demo script

1. **0:00–0:12 — Problem.** "One story, seven outlets, seven realities. Readers
   cannot see what is shared, what is framed, and what is missing."
2. **0:12–0:22 — Input.** Type the prepared topic (or paste the seed URL).
3. **0:22–0:42 — TinyFish live.** "TinyFish searches each outlet's domain, reads
   the articles in parallel, and checks the outlet's own site search." Point at
   the live rows/stream.
4. **0:42–1:02 — Consensus.** "These facts were reported by 5 of 7 outlets;
   every fact links to its source."
5. **1:02–1:20 — Framing.** "Same fact, different frame: one outlet casts the
   protesters as victims, another as instigators. Each label has a quote."
6. **1:20–1:30 — Blind spot + honesty.** "No matching article found by search
   and on-site search. 0 of 3 government-critical outlets covered it — a
   coverage finding, not a motive. Results hold for these outlets and this
   time window."

Close on the limitation, not on a claim of neutrality.

## Presentation checklist

- [ ] One-sentence problem and one-sentence product.
- [ ] Architecture slide: TinyFish Search → Fetch → Agent; LLM stages; cache.
- [ ] Evidence for TinyFish centrality: query log, domains, run ids, live view.
- [ ] Honesty slide: 60% threshold, small-sample caveat, absence precision,
      masking delta.
- [ ] No claim of "objective" or "neutral" summary.
- [ ] Fallback recording queued in a second tab.
- [ ] Timer visible; rehearse to 90 seconds.

## Do not

- Do not add features after the freeze.
- Do not debug infrastructure during the demo.
- Do not run an uncached story for the first time on stage.
- Do not let a blind-spot notice appear without the absence evidence.
