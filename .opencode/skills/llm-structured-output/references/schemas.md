# Stage schemas

Use these as the source of truth in `lib/analysis/schemas.ts`. Keep field names
aligned with `EventAnchorPayload`. Zod v4.

```ts
import { z } from "zod";

export const RelevanceSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(240),
});

export const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  text: z.string().min(3).max(240),
  subject: z.string().min(1).max(120),
  predicate: z.string().min(1).max(120),
  object: z.string().min(1).max(200),
  source_url: z.string().url(),
  excerpt: z.string().min(1).max(400),   // also enforce <=25 words in code
  outlet: z.string().min(1),
  published_at: z.string().optional(),
});

export const ClaimBatchSchema = z.object({
  claims: z.array(ClaimSchema).max(20),
});

export const ConsensusFactSchema = z.object({
  fact_id: z.string().min(1),
  text: z.string().min(3).max(240),
  source_urls: z.array(z.string().url()).min(1),
  outlets: z.array(z.string()).min(1),
  excerpt: z.string().min(1).max(400),
  support: z.number().int().min(1),
});

export const ConsensusBatchSchema = z.object({
  facts: z.array(ConsensusFactSchema),
});

const MfcFrame = z.enum([
  "Economic",
  "Capacity and Resources",
  "Morality",
  "Fairness and Equality",
  "Legality, Constitutionality, Jurisprudence",
  "Policy Prescription and Evaluation",
  "Crime and Punishment",
  "Security and Defense",
  "Health and Safety",
  "Quality of Life",
  "Cultural Identity",
  "Public Opinion",
  "Political",
  "External Regulation and Reputation",
  "Other",
]);

const PersuasionTechnique = z.enum([
  "Name calling / labeling",
  "Guilt by association",
  "Casting doubt",
  "Appeal to hypocrisy",
  "Questioning the reputation",
  "Flag waving",
  "Appeal to authority",
  "Appeal to popularity",
  "Appeal to values",
  "Appeal to fear / prejudice",
  "Straw man",
  "Red herring",
  "Whataboutism",
  "Causal oversimplification",
  "False dilemma / no choice",
  "Consequential oversimplification",
  "Slogans",
  "Conversation killer",
  "Appeal to time",
  "Loaded language",
  "Obfuscation / vagueness / confusion",
  "Exaggeration / minimisation",
  "Repetition",
]);

const EntityRole = z.enum([
  "Victim",
  "Exploited",
  "Scapegoat",
  "Villain",
  "Instigator",
  "Guardian",
  "Hero",
  "Peacemaker",
]);

export const FramingSchema = z.object({
  dominant_frame: MfcFrame,
  frame_evidence: z.string().min(1).max(400),
  persuasion: z
    .array(
      z.object({
        technique: PersuasionTechnique,
        excerpt: z.string().min(1).max(400),
        explanation: z.string().min(1).max(240),
      }),
    )
    .max(5),
  entity_roles: z
    .array(
      z.object({
        entity_name: z.string().min(1).max(120),
        assigned_role: EntityRole,
        excerpt: z.string().min(1).max(400),
      }),
    )
    .max(5),
  slant_score: z.number().min(-1).max(1),
  slant_rationale: z.string().min(1).max(240),
});

export const SlantSchema = z.object({
  score: z.number().min(-1).max(1),
  rationale: z.string().min(1).max(240),
});
```

## Payload shape

```ts
type SpectrumDetail = {
  article_count: number;
  average_slant_score: number;          // -1..1
  dominant_mfc_frame: string;
  perspective_summary: string;
  detected_persuasion_techniques: string[];
  key_entity_roles: { entity_name: string; assigned_role: string }[];
};

type EventAnchorPayload = {
  event_id: string;
  canonical_title: string;
  timestamp_updated: string;            // ISO
  consensus_fact_core: string[];
  blind_spot_alerts: {
    omitted_spectrum: "Left" | "Center" | "Right";
    omission_index: number;             // 0..1
    description: string;
  }[];
  spectrum_breakdown: {
    left: SpectrumDetail;
    center: SpectrumDetail;
    right: SpectrumDetail;
  };
};
```

Optional per-fact evidence, outside the required set:

```ts
type FactEvidence = {
  fact_id: string;
  text: string;
  source_urls: string[];
  excerpt: string;
  support: number;
};
```

## Validation rules in code (not in the schema)

- Excerpt is an exact substring of the fetched article after whitespace
  normalization.
- Excerpt <=25 words.
- `support <= covering_outlets`.
- Empty group: `article_count: 0`, `average_slant_score: 0`,
  `dominant_mfc_frame: "Other"`, `perspective_summary: ""`, empty arrays.
- Reject unknown taxonomy labels; do not coerce them to `Other`.
- Deduplicate `source_urls`.
