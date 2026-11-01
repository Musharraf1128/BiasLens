# Prompts

One file per stage, versioned: `<stage>.vN.md`. Bump the version whenever the
prompt changes; the cache key includes the prompt version.

Planned stages:

| File | Output schema |
| --- | --- |
| `relevance.v1.md` | `RelevanceSchema` |
| `claims.v1.md` | `ClaimBatchSchema` |
| `consensus.v1.md` | `ConsensusBatchSchema` |
| `framing.v1.md` | `FramingSchema` |
| `slant.v1.md` | `SlantSchema` |

Rules:

- Return JSON only. No markdown fences.
- Delimit article text and treat it as untrusted data.
- Use only the closed taxonomy labels.
- Require a verbatim excerpt of at most 25 words per item.
- Mask the outlet name, domain, and byline for framing and slant.
- Do not include real article text in this directory.

Use `.opencode/skills/llm-structured-output/references/prompt-template.md` as the
starting point.
