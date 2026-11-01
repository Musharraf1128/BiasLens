# BiasLens

Multi-perspective news intelligence. Given a story, BiasLens shows how a fixed
set of outlets covered it: the facts they agree on, how each frames it, what
persuasion techniques appear, and — only after a verified absence check — which
outlets did not cover it.

It does **not** produce one "objective" summary. It shows a consensus fact core
plus explicit per-outlet framing, with a source link and a ≤25-word quote next
to every extracted item.

The authoritative build brief is [`BIASLENS_BUILD_SPEC.md`](./BIASLENS_BUILD_SPEC.md).
Part 1 wins over Part 3. Build nothing from Part 3 unless Part 1 says so.

## Status

The Top News welcome page, cached source feed, fact-checking workbench, and
typed SSE pipeline are wired. Live runs still require a TinyFish key; prepared
replay files are loaded from `data/demo/`.

| Area | State |
| --- | --- |
| Next.js 16 + React 19 + Tailwind v4 | ✅ dev/runtime verified |
| Config registry + thresholds (Zod-validated) | ✅ |
| `EventAnchorPayload` JSON Schema + stage Zod contracts | ✅ |
| TinyFish Search/Fetch/Agent client + absence-check protocol | ✅ wired |
| Filesystem cache with TTL + content-hash keys | ✅ |
| OpenAI-compatible LLM caller + mock mode | ✅ wired |
| `/`, `/analyze`, `/api/top-news`, `/api/health`, `/api/tinyfish/search` | ✅ |
| Anchor → search → fetch → relevance → claims → consensus | ✅ |
| Framing / blind-spot pipeline + result UI | ✅ |
| Typed SSE activity stream + cached replay capture | ✅ |

## Quick start

```bash
cp .env.example .env.local
# put TINYFISH_API_KEY=... in .env.local

npm install
npm run check
npm run probe        # live Search + Fetch smoke test
npm run dev          # http://localhost:3000
```

After a completed live run, save a derived replay for an offline demo:

```bash
npm run capture-demo -- budget-session "the story topic"
npm run warm-demo
```

The capture command stores URLs, titles, short excerpts, labels, and the
activity trail only. It never writes raw article text to `data/demo/`.

The app starts without an LLM key in mock mode. Live analysis needs
`LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` for any OpenAI-compatible
`/chat/completions` endpoint. Set `LLM_MOCK=1` only to force mock mode even
when a key is present.

Never commit `.env.local`. Never expose a key with `NEXT_PUBLIC_`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run check` | Typecheck + lint + config invariants |
| `npm run check:config` | Validate outlets and thresholds |
| `npm run probe` | TinyFish Search + Fetch smoke test |
| `npm run probe:agent` | Optional Agent run (costs credits) |
| `npm run warm-demo` | Validate prepared replay fixtures |
| `npm run capture-demo` | Capture one completed SSE run as a derived replay |

## Architecture

```text
app/                    Next.js App Router pages and route handlers
components/             Top News, navigation, and fact-checker UI
lib/config.ts           outlet registry + thresholds, Zod-validated
lib/env.ts              server-only env access, live/mock LLM mode
lib/cache.ts            sha256 keys, TTL JSON cache, in-memory fallback
lib/tinyfish.ts         Search, Fetch, Agent, SSE, absence check
lib/llm.ts              OpenAI-compatible JSON caller + deterministic mock
lib/analysis/schemas.ts Zod contracts for every stage and the payload
lib/top-news.ts          TinyFish-backed cached source feed and story bundles
lib/top-news-schema.ts   Zod contract for the Top News API and UI
config/                 outlets.json, thresholds.json
prompts/                versioned prompt files
schema/                 EventAnchorPayload JSON Schema
data/cache/             gitignored transient cache
data/demo/              committed derived demo results only
data/mock/              deterministic LLM fixtures
scripts/                config/demo checks
.opencode/skills/       project and vendored skills
```

Design rules:

- Route handlers stay thin; the pipeline lives in `lib/analysis/`.
- Only `lib/env.ts` reads `process.env`.
- All LLM output is validated with Zod; retry once, then mark `unavailable`.
- Every evidence span is verified as an exact substring in code.
- `data/demo/` never contains full article text.

See the `biaslens-architecture` skill for the full conventions.

## Outlets

The configured registry has 15 outlets across three groups:

- **Government-critical:** The Hindu, The Indian Express, NDTV, The Wire, Scroll, Brut India, Newslaundry, The Caravan
- **Mixed:** Reuters India, Press Trust of India, BBC News India
- **Government-aligned:** Zee News, The Times of India, Republic World, India Today

The schema keeps the `left` / `center` / `right` field names for compatibility.
Their UI labels are government-critical / mixed / government-aligned. Ratings are
third-party seed labels with known disagreement, not ground truth; each outlet
links to its rating source.

Top News searches each configured domain through TinyFish, bundles similar
headlines using a lightweight deterministic title matcher, and shows a
coverage-mix bar. The bar describes which configured source groups covered a
story bundle; it is not a truth or quality score. The feed is cached for the
configured TTL and can be refreshed manually.

## TinyFish

Current docs use newer endpoints than the spec's Part 2:

| API | Endpoint |
| --- | --- |
| Search | `GET https://api.search.tinyfish.ai` |
| Fetch | `POST https://api.fetch.tinyfish.ai` |
| Agent | `https://agent.tinyfish.ai/v1/automation/run\|run-async\|run-sse` |

The `tinyfish` skill contains verified request/response shapes, limits, and the
absence-check protocol. A failed fetch, paywall, or login wall is **not**
evidence of omission.

## Skills

Project skills:

| Skill | Use |
| --- | --- |
| `biaslens` | MVP guardrails, cut line, wording, data/secret rules |
| `tinyfish` | Search/Fetch/Agent integration, SSE, absence checks |
| `media-bias-analysis` | Claims, consensus, frames, persuasion, slant, blind-spot math |
| `llm-structured-output` | Strict JSON, evidence verification, caching, mock mode |
| `demo-delivery` | 4.5-hour schedule, cache warming, fallbacks, 90-second pitch |
| `biaslens-architecture` | File map, boundaries, route/cache conventions |

Vendored (see `.opencode/skills/VENDORED.md`): `frontend-design`,
`webapp-testing`, `systematic-debugging`, `verification-before-completion`.

## Safety

- Public pages only. No logins, paywalls, CAPTCHA solving, or access-control
  bypass.
- Store URL, title, short excerpts, and derived labels only. Analyze article
  text in memory.
- Never claim an outlet "ignored" or "hid" a story. Use the verified absence
  wording.
- Results hold only for the configured outlets and time window.

## Demo handoff

1. Add `TINYFISH_API_KEY` to `.env.local` and run `npm run probe`.
2. Run one or more stories through the workbench.
3. Capture each completed run with `npm run capture-demo -- <id> <input>`.
4. Test the prepared story buttons with the network disabled.
5. Rehearse the live activity panel and keep the cached replay available.
