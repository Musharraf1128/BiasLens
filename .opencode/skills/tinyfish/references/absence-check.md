# Absence check protocol

A blind-spot notice is a claim about what an outlet did **not** publish. It is
only allowed after this protocol passes. Never infer omission from a failed
fetch, an empty search snippet, or a missing article URL.

## Required evidence

For each outlet in the allegedly omitted group:

1. Scoped TinyFish Search on the outlet domain returned no relevant article.
2. The outlet's own site search was opened with TinyFish Agent and returned
   `results_found: 0` for the specific event.
3. `search_available` is `true` (the search page loaded and returned a state).
4. The run was not blocked by login, paywall, CAPTCHA, or a site error.
5. A screenshot or run id is stored as evidence, if capture is enabled.

If any item is missing: **no notice**. Report "coverage check inconclusive".

## Agent goal template

```text
Go to {outlet_url}. Use the site's own search interface (not an external search
engine) to search for: "{event_query}".

Rules:
- Do not log in, sign up, bypass a paywall, or solve a CAPTCHA.
- Accept only essential cookie consent if a banner blocks the search.
- Count only headlines that are about this specific event, not loose keyword
  matches.
- If the search page loads and shows a result state, set search_available=true.
- If the search page is blocked, requires login, errors, or never loads, set
  results_found=-1, search_available=false, and explain in notes.

Return JSON only, matching the provided output schema.
```

## Output schema

```json
{
  "type": "object",
  "properties": {
    "results_found": {
      "type": "integer",
      "description": "Matching headlines, or -1 if the search was unavailable"
    },
    "top_titles": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 5
    },
    "searched_url": { "type": "string" },
    "search_available": { "type": "boolean" },
    "notes": { "type": "string" }
  },
  "required": ["results_found", "top_titles", "searched_url", "search_available"]
}
```

If TinyFish rejects a schema keyword, simplify to `type` + `properties` +
`required`; do not drop `results_found` or `search_available`.

## Request

```ts
const body = {
  url: outlet.homepage,
  goal,
  output_schema: absenceSchema,
  agent_config: { max_duration_seconds: 90 },
  // Only add capture_config if the account is enabled for it; a 403 must not
  // break the flow.
  ...(screenshotsEnabled ? { capture_config: { screenshots: true } } : {}),
};
```

Use `/run` for a single outlet. For a group, run one Agent per outlet in
parallel via `/run-async`, then poll, or use `/run-sse` when the demo should
show the browser live.

## Decision table

| Scoped Search | Agent `results_found` | Agent available | Outcome |
| --- | --- | --- | --- |
| Relevant article | any | any | Covered. No notice. |
| None | `> 0` | true | Covered (search index missed it). No notice. |
| None | `0` | true | Absence candidate. Evaluate thresholds. |
| None | `0` | false | Inconclusive. No notice. |
| None | `-1` | false | Inconclusive. No notice. |
| None | any | blocked / login / paywall | Inconclusive. No notice. |
| Fetch failed for a result | any | any | Not evidence. No notice. |

## Threshold gate

Even a verified absence only becomes a notice when all config thresholds pass:

```text
V_e,p = covered outlets in group p / outlets monitored in group p
O_e,p = 1 - V_e,p / max_{q != p} V_e,q      (null if the max is 0)
D_e,p = consensus facts / distinct extracted claims across covering outlets
```

Alert only if `O >= omission_threshold` (default 0.70),
`V_overall >= overall_coverage_threshold` (default 0.40),
`D >= diversity_threshold` (default 0.65), and the absence check passed.

Guards:

- Empty group: no alert; render `article_count: 0`.
- Max coverage 0: no alert; return `omission_index: 0` or omit the alert.
- Small samples: with 3 outlets, V ∈ {0, 0.33, 0.67, 1}; the 0.70 threshold
  only fires at zero coverage. Say "X of Y outlets in this group covered it".

## Evidence record

Store with the alert:

```ts
type AbsenceEvidence = {
  outlet: string;
  group: "left" | "center" | "right";
  checked_at: string;          // ISO
  search_query: string;
  search_results_relevant: number;
  onsite_results_found: number; // -1 = unavailable
  onsite_search_available: boolean;
  searched_url: string | null;
  run_id: string | null;
  screenshot_url: string | null;
  notes: string;
};
```

Surface `checked_at`, `searched_url`, and the run id in the UI. Never show only
"no coverage".
