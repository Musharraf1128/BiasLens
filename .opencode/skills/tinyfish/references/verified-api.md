# TinyFish verified API reference

Source: https://docs.tinyfish.ai (checked Nov 2026). Re-check before changing
request shapes. SDK: `@tiny-fish/sdk`. Raw endpoints are authoritative.

## Common auth

```
X-API-Key: $TINYFISH_API_KEY
```

Keys: https://agent.tinyfish.ai/api-keys

## Search

`GET https://api.search.tinyfish.ai`

| Param | Type | Notes |
| --- | --- | --- |
| `query` | string, required | Search string |
| `purpose` | string | Why you are searching; max 2000 chars |
| `location` | string | ISO country code; default US |
| `language` | string | Language code; default en |
| `include_domains` | string | Comma-separated domains |
| `exclude_domains` | string | Comma-separated domains |
| `recency_minutes` | integer | 1..5256000; cannot combine with dates |
| `after_date` | YYYY-MM-DD | Lower bound |
| `before_date` | YYYY-MM-DD | Upper bound |
| `domain_type` | `web` \| `news` \| `research_paper` | `news` adds publisher/date |
| `page` | integer | 0-based, max 10 |

Response:

```json
{
  "query": "string",
  "results": [
    {
      "position": 1,
      "site_name": "example.com",
      "title": "string",
      "snippet": "string",
      "url": "https://…",
      "date": "optional",
      "publisher": "optional"
    }
  ],
  "total_results": 10,
  "page": 0
}
```

Limits: 12,000 requests/day free, 30 req/min personal. Errors: 400, 401, 402,
403, 404, 429, 500, 503.

## Fetch

`POST https://api.fetch.tinyfish.ai`

```json
{
  "urls": ["https://example.com/a", "https://example.com/b"],
  "format": "markdown",
  "links": false,
  "image_links": false,
  "ttl": 3600,
  "per_url_timeout_ms": 45000,
  "purpose": "Extract article text for analysis"
}
```

| Param | Notes |
| --- | --- |
| `urls` | Required, max 10, http/https only, no private IPs |
| `format` | `markdown` (default), `html`, `json` |
| `links` | Include `<a href>` URLs |
| `image_links` | Include `<img src>` URLs |
| `ttl` | Omit = any cache; `0` = live; positive = max age seconds |
| `per_url_timeout_ms` | 1..110000 |
| `include_selectors` | Up to 20 CSS selectors |
| `exclude_selectors` | Up to 20 CSS selectors |
| `highlights` | Beta; requires `format: "markdown"` |
| `include_etag_and_last_modified` | Adds `etag` / `last_modified` |
| `if_none_match` / `if_modified_since` | Single URL only |

Response:

```json
{
  "results": [
    {
      "url": "https://…",
      "final_url": "https://…",
      "title": "string|null",
      "description": "string|null",
      "language": "string|null",
      "author": "string|null",
      "published_date": "string|null",
      "text": "markdown",
      "links": ["https://…"],
      "latency_ms": 123
    }
  ],
  "errors": [
    { "url": "https://…", "error": "bot_blocked", "status": 403 }
  ]
}
```

Per-URL errors: `target_http_error`, `page_not_found`, `target_unreachable`,
`timeout`, `bot_blocked`, `empty_content`, `login_required`,
`content_too_large`, `invalid_url`, `invalid_redirect_url`, `proxy_error`,
`conditional_unsupported`, `selector_not_matched`, `selector_unsupported`.

Limits: 10 URLs/request, 110s/URL backend, 120s/batch CDN ceiling, 150s client
timeout, ~150 URLs/min, 1,000 free URLs/day.

## Agent

Base: `https://agent.tinyfish.ai/v1`

| Endpoint | Result |
| --- | --- |
| `POST /automation/run` | Blocking final result; cannot cancel |
| `POST /automation/run-async` | `{ run_id }` immediately; cancellable |
| `POST /automation/run-sse` | SSE stream; cancellable |
| `GET /runs/{id}` | Current/final run state |
| `POST /runs/{id}/cancel` | Cancel async/SSE run |

Request body:

```jsonc
{
  "url": "https://example.com",
  "goal": "Natural-language goal",
  "output_schema": { "type": "object", "properties": {}, "required": [] },
  "browser_profile": "lite",             // or "stealth"
  "proxy_config": { "enabled": true, "type": "tinyfish", "country_code": "IN" },
  "agent_config": { "max_duration_seconds": 120 },
  "capture_config": { "screenshots": true, "html": false },
  "use_profile": false,
  "profile_id": "prof_…",
  "use_vault": false,
  "webhook_url": "https://…"
}
```

`output_schema` supports a JSON-Schema subset. Unsupported fields are rejected
before execution. Keep it small and flat.

Run response (`/run`):

```json
{
  "run_id": "uuid",
  "status": "COMPLETED",
  "started_at": "ISO-8601",
  "finished_at": "ISO-8601",
  "num_of_steps": 5,
  "result": {},
  "error": null
}
```

`GET /runs/{id}` adds `goal`, `streaming_url`, `video_url`, `steps`, and
`error { code, message, category, retry_after, help_url, help_message }`.

SSE event types:

| Type | Fields |
| --- | --- |
| `STARTED` | `run_id`, `timestamp` |
| `STREAMING_URL` | `streaming_url` |
| `PROGRESS` | `purpose` |
| `HEARTBEAT` | `timestamp` |
| `COMPLETE` | `status`, `result?`, `error?` |

`COMPLETED` is a run status, not a success guarantee. Check `result` for
failure signals (`captcha`, `blocked`, `access denied`) and empty output.

Limits: `max_steps` 1..500 default 150 (beta-gated), `max_duration_seconds`
optional, `capture_config` account-gated (403 if unavailable). `streaming_url`
~24h; recordings ~15 min.

## Error codes

| HTTP | Meaning |
| --- | --- |
| 400 | Invalid input |
| 401 | Missing/invalid key |
| 402 | Allowance exhausted / no wallet balance |
| 403 | Forbidden or feature not enabled |
| 422 | Invalid selector syntax |
| 429 | Rate limit exceeded |
| 500 | Internal error |
| 503 | Service unavailable; retry with backoff |

Run-level failures: `TASK_FAILED`, `SITE_BLOCKED`, `MAX_STEPS_EXCEEDED`,
`TIMEOUT`, `BILLING_REJECTED`.
