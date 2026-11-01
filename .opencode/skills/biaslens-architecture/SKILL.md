---
name: BiasLens Architecture
description: Use when adding or changing BiasLens code. Maps the Next.js 16 app structure, server/client boundaries, API routes, TinyFish and LLM clients, cache policy, config and prompt conventions, and the testing commands.
---

# BiasLens Architecture

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4.
- One Node server; no database, no vector store, no auth.
- TinyFish for retrieval; an OpenAI-compatible LLM for analysis; filesystem
  cache for demo reliability.

## File map

```text
app/
  layout.tsx                  fonts, metadata
  page.tsx                    build console / landing shell
  globals.css                 Tailwind theme tokens
  api/health/route.ts         readiness JSON (no secrets)
  api/tinyfish/search/route.ts  outlet-scoped search smoke endpoint
components/                   client components as the workbench grows
lib/
  config.ts                   zod-validated outlet + threshold config
  env.ts                      server-only env access, LLM mode
  cache.ts                    sha256 keys, TTL JSON cache, in-memory fallback
  tinyfish.ts                 Search/Fetch/Agent client, absence check
  llm.ts                      OpenAI-compatible JSON caller + mock mode
  analysis/schemas.ts         Zod contracts for every stage and payload
  analysis/                   pipeline stages (anchor, relevance, claims, …)
config/
  outlets.json                seed registry; group mapping; rating sources
  thresholds.json             all tunable numbers
prompts/                      versioned prompt files, stage.vN.md
schema/event-anchor.schema.json  output JSON Schema (field names frozen)
data/
  cache/                      gitignored; may hold transient raw fetch text
  demo/                       committed; derived results + <=25-word excerpts only
  mock/                       deterministic LLM fixtures
scripts/
  check-config.mjs            config invariants
  warm-demo.mjs               validate demo fixtures
.opencode/skills/             project + vendored skills
```

## Data flow

```text
UI -> POST /api/analyze (planned)
   -> anchor
   -> searchOutletCoverage() per outlet (parallel, bounded)
   -> fetchArticles() in batches of 10
   -> chatJson(relevance) -> chatJson(claims) -> consensus
   -> chatJson(framing, outlet masked)
   -> runAbsenceCheck() for candidate omissions
   -> EventAnchorPayload + evidence
   -> cache + data/demo/<story>.json
```

Keep the pipeline in `lib/analysis/pipeline.ts` and keep route handlers thin.
The UI receives one typed payload; it must not call TinyFish or the LLM directly.

## Server/client boundaries

- `lib/env.ts` is the only place that reads `process.env`. Never read
  `process.env.TINYFISH_API_KEY` or `LLM_API_KEY` in a component.
- Never use `NEXT_PUBLIC_` for a secret.
- Route handlers that touch TinyFish, the LLM, or the filesystem:
  `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.
- Components are server components by default. Add `"use client"` only for
  state, effects, or event handlers.
- Do not import `lib/tinyfish.ts`, `lib/llm.ts`, or `lib/cache.ts` into a client
  component.

## Route handler conventions

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  // ...
}
```

- Validate every request body with Zod.
- Return `{ error, message }` with a stable error code; never leak keys, raw
  upstream bodies, or article text.
- Map TinyFish 401 to 503 (server misconfigured), other upstream errors to 502.
- Long jobs: return a job id and stream progress via SSE, or run synchronously
  with a hard timeout for the hackathon.

## SSE proxy pattern

For live Agent views, proxy the upstream stream without buffering:

```ts
export async function POST(request: Request) {
  const upstream = await startAgentStream(body);
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- Do not `await upstream.text()`; it buffers and breaks the live view.
- Forward events as-is; the client parses `STARTED`, `STREAMING_URL`,
  `PROGRESS`, `HEARTBEAT`, `COMPLETE`.
- `STREAMING_URL` expires in ~24h. Store run ids, not only the URL.
- Support a cached fallback for the demo.

## Cache policy

- Key with `cacheKey([...])`; it hashes a stable stringification.
- Search key: outlet domain + query + window + language + location.
- Fetch key: URL.
- LLM key: stage + model + prompt version + hashes of system/user/schema.
- `data/cache/` is gitignored. It may contain raw article text transiently;
  never commit it.
- `data/demo/` is committed and must contain derived results and excerpts only.
- Demo replay must work with the network off.

## Config changes

- Outlets, groups, rating sources, thresholds, windows, and feature flags live
  in `config/` or env.
- After editing `config/outlets.json`, run `npm run check:config`.
- Do not hardcode outlet names, domains, thresholds, or model IDs in components.
- The `left`/`center`/`right` keys are frozen by the payload schema. Their UI
  labels come from `groups` in the config.

## Adding a pipeline stage

1. Add a Zod schema in `lib/analysis/schemas.ts`.
2. Add a versioned prompt in `prompts/<stage>.v1.md`.
3. Call `chatJson` with the schema, schema text, prompt version, and cache parts.
4. Verify every evidence span is an exact substring after whitespace
   normalization; drop the item otherwise.
5. Add the stage to the pipeline with bounded concurrency and a timeout.
6. Surface `live` / `cached` / `unavailable` in the UI.
7. Add a demo fixture in `data/demo/` and run `npm run warm-demo`.

## Testing and verification

```bash
npm run check        # typecheck + lint + config invariants
npm run build        # production build (Next 16)
npm run probe        # TinyFish Search + Fetch smoke test
npm run probe:agent  # optional Agent run (costs credits)
npm run warm-demo    # validate demo fixtures
```

- For UI behavior, use the `webapp-testing` skill (Playwright) with
  `npm run dev`.
- Before claiming a feature is done, run the command that proves it and read the
  output. Use `verification-before-completion`.

## Pitfalls

| Pitfall | Fix |
| --- | --- |
| Reading env in a component | Use `lib/env.ts` on the server |
| Buffering SSE | Return `upstream.body` directly |
| Build-time API calls | Keep routes dynamic; never call TinyFish at module load |
| Dynamic fs tracing warning | Keep paths under `data/`; avoid `path.join(cwd, variable)` |
| Stale cache during a live run | Include a run nonce in the key for live, omit for demo |
| Raw article text committed | Write fixtures from derived payloads only |
| Zod schema drift | Derive TS types with `z.infer`, never duplicate interfaces |
| Empty center group crashes UI | Always render `article_count: 0` and empty arrays |
| Next 16 `jsx` setting | Leave the build-generated `react-jsx` in `tsconfig.json` |
