# Blind-spot math and edge cases

The blind-spot notice is the most defamatory part of the product. Treat it as a
claim that needs evidence, a threshold gate, and careful wording.

## Variables

- `P = {left, center, right}` — display names for government-critical, mixed,
  government-aligned.
- `S_p` — monitored outlets in group `p` (from `config/outlets.json`).
- `covered(e, s)` — 1 if outlet `s` published at least one relevant article on
  event `e`, else 0.
- `consensus(e)` — number of facts in the consensus core.
- `claims(e)` — number of distinct claims extracted across all covering outlets.

## Formulas

```
V_e,p      = (1 / |S_p|) * sum_{s in S_p} covered(e, s)
V_e,overall = covered outlets / all monitored outlets

max_other  = max_{q != p} V_e,q
O_e,p      = 1 - V_e,p / max_other        if max_other > 0
           = null                        if max_other == 0

D_e,p      = consensus(e) / claims(e)     if claims(e) > 0
           = 0                           if claims(e) == 0
```

Alert for group `p` only when **all** hold:

1. `O_e,p >= 0.70` (config `omission_threshold`)
2. `V_e,overall >= 0.40` (config `overall_coverage_threshold`)
3. `D_e,p >= 0.65` (config `diversity_threshold`)
4. TinyFish absence check passed for **every** outlet in `S_p`
5. `|S_p| > 0` and at least 2 outlets covered the event overall

## Guard rails

| Case | Behavior |
| --- | --- |
| `S_p` empty (the mixed group) | No alert. `article_count: 0`, empty arrays. |
| `max_other == 0` | No alert. No division. |
| `claims(e) == 0` | `D = 0`; no alert. |
| One outlet covered overall | No blind-spot claim; show "reported by 1 outlet". |
| Absence check inconclusive | No alert. Show "coverage check inconclusive". |
| Paywall / login / blocked fetch | Not evidence. No alert. |
| Group partially covered | No alert for that group; show coverage counts. |

## Worked examples

Assume 3 outlets in `left`, 4 in `right`, 0 in `center` (the MVP seed).

### A. Broad coverage, no alert

- left: 3/3 covered → `V_left = 1.0`
- right: 3/4 covered → `V_right = 0.75`
- `V_overall = 6/7 = 0.857`
- For left: `O = 1 - 1.0 / 0.75 = -0.333` → no alert.
- For right: `O = 1 - 0.75 / 1.0 = 0.25` → no alert.

### B. Right covered it, left did not

- left: 0/3 → `V_left = 0`
- right: 4/4 → `V_right = 1.0`
- `V_overall = 4/7 = 0.571` (passes 0.40)
- `O_left = 1 - 0 / 1.0 = 1.0` (passes 0.70)
- `D = 8 consensus / 10 claims = 0.80` (passes 0.65)
- Absence check passes for all 3 left outlets → **alert: Left omitted**.

### C. One left outlet covered it

- left: 1/3 → `V_left = 0.333`
- right: 4/4 → `V_right = 1.0`
- `V_overall = 5/7 = 0.714`
- `O_left = 1 - 0.333 / 1.0 = 0.667` → **below 0.70**, no alert.
- UI: "1 of 3 outlets in the government-critical group covered it."

### D. Sparse overall coverage

- left: 0/3 → 0
- right: 1/4 → 0.25
- `V_overall = 1/7 = 0.143` → fails 0.40, no alert even though `O = 1.0`.
- The event is not widely covered enough to call it a blind spot.

### E. Nobody covered it

- `V_left = V_right = 0` → `max_other = 0` → no alert, no division.

### F. Four-outlet group at 1/4

- left: 1/4 → 0.25
- right: 4/4 → 1.0
- `O_left = 1 - 0.25 = 0.75` → passes 0.70. With 4 outlets per group, a single
  covered outlet can still trigger. This is why the overall coverage and `D`
  gates matter.

## Small-sample arithmetic to show in the UI

| Outlets in group | Possible V values |
| --- | --- |
| 3 | 0, 0.33, 0.67, 1.00 |
| 4 | 0, 0.25, 0.50, 0.75, 1.00 |

With 3 outlets, `O >= 0.70` only fires when the group has **zero** coverage and
another group has nonzero coverage. Say this explicitly in the demo caveats.

## `D` (diversity / claim support) details

- Numerator: facts in the consensus core for the event.
- Denominator: distinct claims extracted across all covering outlets after
  within-article and cross-outlet deduplication.
- `D` is a proxy for "how much shared factual ground exists", not a measure of
  article quality.
- If `D` is high, the event has a strong factual core; an omission claim is more
  defensible.
- If `D` is low, coverage is fragmented; do not claim omission.

## Required evidence record

Each alert must carry the `AbsenceEvidence` record from
`tinyfish/references/absence-check.md`, plus:

```ts
type BlindSpotAlert = {
  omitted_spectrum: "Left" | "Center" | "Right";
  omission_index: number;       // O, 0..1
  description: string;          // neutral wording
  coverage: { covered: number; monitored: number };
  overall_coverage: number;     // V_overall
  claim_support: number;        // D
  evidence: AbsenceEvidence[];
};
```

## Wording

Use:

> "No matching article was found by outlet search and on-site search on
> 1 Nov 2026, 14:30 IST. 0 of 3 government-critical outlets covered this event;
> 4 of 4 government-aligned outlets did."

Do not use:

> "The government-critical media ignored this story."

Never imply intent. The finding is about searchable coverage at a point in time,
not about editorial motives.
