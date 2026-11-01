---
name: TinyFish Integration
description: Use whenever integrating or debugging TinyFish Search, Fetch, or Agent (sync, async, or SSE) in BiasLens. Covers verified endpoints, request and response shapes, rate limits, the coverage-absence protocol, caching, and live browser views.
---

# TinyFish Integration

TinyFish is the discovery, reading, and coverage-checking layer. Treat it as a
core dependency, not an enrichment step.

## Auth and runtime

- Key: `TINYFISH_API_KEY` in `.env.local` (gitignored), server-side only.
- Header: `X-API-Key`.
- SDK: `@tiny-fish/sdk` is installed for optional scripts, but
  `lib/tinyfish.ts` uses the raw HTTP API so retries, timeouts, caching, and SSE
  proxying behave the same across Search, Fetch, and Agent. The raw endpoints
  below are canonical.
- Every route that calls TinyFish must run on Node: `export const runtime = "nodejs"`.
- Never expose the key with `NEXT_PUBLIC_`.

## Verified endpoints (current docs, Nov 2026)

| API | Endpoint | Method | Client timeout |
| --- | --- | --- | --- |
| Search | `https://api.search.tinyfish.ai` | `GET` | 10s |
| Fetch | `https://api.fetch.tinyfish.ai` | `POST` | 150s |
| Agent sync | `https://agent.tinyfish.ai/v1/automation/run` | `POST` | 120s |
| Agent async | `https://agent.tinyfish.ai/v1/automation/run-async` | `POST` | 30s |
| Agent SSE | `https://agent.tinyfish.ai/v1/automation/run-sse` | `POST` | stream |
| Run status | `https://agent.tinyfish.ai/v1/runs/{id}` | `GET` | 30s |
| Cancel | `https://agent.tinyfish.ai/v1/runs/{id}/cancel` | `POST` | 30s |

The spec's Part 2 lists older paths. These are the verified ones.

## Search — coverage discovery

One search per outlet, scoped to the outlet domain. Never one global search and
then filter, and never `site:` operators when `include_domains` exists.

```ts
const params = new URLSearchParams({
  query: anchor.query,
  include_domains: outlet.domain,          // comma-separated if several
  domain_type: "news",                     // publisher + date fields
  recency_minutes: String(cfg.searchWindowMinutes),
  language: "en",
  location: "IN",
  purpose: `Find ${outlet.name}'s coverage of this specific event`,
});

const res = await fetch(`https://api.search.tinyfish.ai?${params}`, {
  headers: { "X-API-Key": process.env.TINYFISH_API_KEY! },
  signal: AbortSignal.timeout(10_000),
});
```

Response: `{ query, results[], total_results, page }` where each result has
`position`, `site_name`, `title`, `snippet`, `url`, and optionally `date`,
`publisher`. `page` is 0-based and max 10.

Rules:

- `include_domains` is a **comma-separated string**, not an array.
- Do not combine `recency_minutes` with `after_date` / `before_date`.
- Search is free to 12,000 requests/day, 30 requests/minute for a personal key.
  Handle `429` with backoff, `402` as "allowance exhausted".
- Deduplicate URLs across outlets before Fetch.
- A search with zero results is only a **candidate** absence. It is not an
  omission until the absence check passes.

## Fetch — reading articles

Batch up to 10 URLs per request. Per-URL failures arrive in `errors[]` with a
`200` response and must not fail the batch.

```ts
const res = await fetch("https://api.fetch.tinyfish.ai", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.TINYFISH_API_KEY!,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    urls,
    format: "markdown",
    links: false,
    purpose: "Extract article text for event claim and framing analysis",
  }),
  signal: AbortSignal.timeout(150_000),
});
```

Response: `{ results[], errors[] }`.

- `results[]`: `url`, `final_url`, `title`, `description`, `language`,
  `author`, `published_date`, `text`, and `links` when requested.
- `errors[]`: `url`, `error` code, optional `status`.
- Error codes: `target_http_error`, `page_not_found`, `target_unreachable`,
  `timeout`, `bot_blocked`, `empty_content`, `login_required`,
  `content_too_large`, `invalid_url`, `invalid_redirect_url`, `proxy_error`,
  `selector_not_matched`, `selector_unsupported`.
- Backend timeout is 110s per URL and 120s per batch; client timeout 150s.
- Rate limit ~150 URLs/minute; 1,000 free URLs/day.
- `ttl: 0` forces a live fetch. Omit `ttl` to accept any cached entry.
- For an outlet homepage, use `links: true` to read story-link order as a cheap
  placement signal.

A failed fetch is **not** evidence of omission. Mark the article `not
accessible` and continue.

## Agent — absence checks, hard pages, live demo

Request body (all three endpoints):

```jsonc
{
  "url": "https://www.thehindu.com/",
  "goal": "…natural-language instruction…",
  "output_schema": { "type": "object", "properties": {}, "required": [] },
  "browser_profile": "lite",              // or "stealth"
  "agent_config": { "max_duration_seconds": 90 },
  "capture_config": { "screenshots": true }
}
```

- Prefer `/run` for tasks under ~30s, `/run-async` for long jobs, `/run-sse`
  when the audience should watch the browser.
- `capture_config` is account-gated; a `403` must not break the flow. Request
  screenshots only if enabled.
- `agent_config.max_steps` and `mode: "strict"` are beta-gated; omit them unless
  the account has access.
- `COMPLETED` does **not** mean the goal succeeded. Inspect `result` / `result.error`
  for `captcha`, `blocked`, `access denied`, or an empty result.
- SSE events: `STARTED`, `STREAMING_URL`, `PROGRESS`, `HEARTBEAT`, `COMPLETE`.
  `streaming_url` lasts ~24h; recording links expire in ~15 min.
- SSE has no `Last-Event-ID` replay. On disconnect, poll
  `GET /v1/runs/{id}` until `COMPLETED`, `FAILED`, or `CANCELLED`.
- Cancel with `POST /v1/runs/{id}/cancel`; only `/run-async` and `/run-sse` runs
  can be cancelled.

### Absence-check protocol (mandatory before any blind-spot notice)

An outlet is "absent" only when **all** of these hold:

1. The scoped Search for that outlet returned no relevant article for the event.
2. An Agent run on the outlet's **own site search** returned `results_found: 0`
   (not `-1`, not an error, not "search unavailable").
3. The Agent's screenshot/evidence was captured, or the run explicitly reported
   the search page as accessible and empty.
4. No evidence of a paywall/login wall caused the miss.

If any condition fails, do not raise a blind-spot notice. Say "coverage check
inconclusive" instead.

Use `references/absence-check.md` for the goal template and result schema.

## Caching

Cache by a stable key:

- Search: `search:<outlet.domain>:<normalized query>:<window>`
- Fetch: `fetch:<url>`
- Agent: `agent:<outlet.domain>:<event hash>`
- LLM: handled by the `llm-structured-output` skill.

Store JSON with `{ key, fetchedAt, ttlSeconds, value }`. In dev, use
`data/cache/` (gitignored). For the demo, persist the **derived** final payload
to `data/demo/<story>.json`; never commit raw article text.

## Rate-limit and failure playbook

| Symptom | Action |
| --- | --- |
| `401` | Missing/invalid key. Stop and fix env; do not retry blindly. |
| `402` | Daily free allowance exhausted. Use cache; surface "allowance exhausted". |
| `403` | Feature gated (e.g. screenshots) or forbidden. Degrade gracefully. |
| `429` | Exponential backoff + jitter; cap retries at 3; use cache. |
| `5xx` / `503` | Retry twice with backoff, then cached result. |
| Fetch `bot_blocked` | Try Agent with `browser_profile: "stealth"`; if still blocked, mark not accessible. |
| Fetch `login_required` | Do not attempt login. Mark `not accessible`. |
| Fetch `timeout` | Reduce batch size, retry once, then mark. |
| Agent `SITE_BLOCKED` | No absence claim. Mark inconclusive. |
| SSE disconnect | Poll the run until terminal. |

## Do not

- Do not search the open web and attribute results to an outlet by domain guess.
- Do not treat a fetch failure, paywall, or login wall as omission.
- Do not bypass CAPTCHAs, paywalls, or access controls.
- Do not fetch private IPs, localhost, or metadata endpoints (the API rejects them).
- Do not log article text or keys.

## References

- `references/verified-api.md` — full verified request/response shapes.
- `references/absence-check.md` — absence goal, schema, and decision table.
- `scripts/probe.mjs` — zero-dependency smoke test for key, Search, and Fetch.
