<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BiasLens agent instructions

## Read first

1. `BIASLENS_BUILD_SPEC.md` **Part 1**. It is authoritative. Part 3 is reference
   only; build nothing from it unless Part 1 says so.
2. The `biaslens` skill for the MVP guardrails, cut line, and wording rules.
3. `biaslens-architecture` before changing app code.
4. `tinyfish` before touching retrieval or absence checks.
5. `llm-structured-output` and `media-bias-analysis` before touching analysis.

## Commands

```bash
npm run check        # typecheck + lint + config invariants
npm run build
npm run probe        # TinyFish Search + Fetch smoke test
npm run dev
```

Before claiming work is complete, run the command that proves it and read the
output. Use the `verification-before-completion` skill.

## Hard rules

- TinyFish does the finding, reading, and coverage checking. Keep it central and
  visible in the demo.
- Every fact, frame, and persuasion hit needs a source URL and a verbatim
  excerpt of at most 25 words. Verify the excerpt in code.
- Every LLM stage returns strict JSON. Validate; retry once; then mark the item
  `unavailable`. Never guess.
- Thresholds, outlets, windows, and model IDs live in `config/` or env, not in
  components.
- Never say an outlet "ignored" or "hid" a story. Only raise a blind-spot notice
  after the TinyFish absence check passes.
- Never commit or log keys. `.env.local` is server-side only; no
  `NEXT_PUBLIC_` secrets.
- Store URL, title, short excerpts, and derived labels. Do not commit full
  article text.
- Public pages only. No logins, paywalls, CAPTCHA solving, or access-control
  bypass.
- Ask before adding scope. The cut line is: consensus core and live TinyFish
  activity first, framing second, blind spot third.

## Next.js

The managed block above is written by `next dev`; do not remove it. Read the
version-matched docs in `node_modules/next/dist/docs/` before using a framework
API you are unsure about.
