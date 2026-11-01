import { z } from "zod";

export const RelevanceSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(240),
});
export type Relevance = z.infer<typeof RelevanceSchema>;

export const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  text: z.string().min(3).max(240),
  subject: z.string().min(1).max(120),
  predicate: z.string().min(1).max(120),
  object: z.string().min(1).max(200),
  source_url: z.url(),
  excerpt: z.string().min(1).max(400),
  outlet: z.string().min(1),
  published_at: z.string().optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimBatchSchema = z.object({
  claims: z.array(ClaimSchema).max(20),
});
export type ClaimBatch = z.infer<typeof ClaimBatchSchema>;

export const ConsensusFactSchema = z.object({
  fact_id: z.string().min(1),
  text: z.string().min(3).max(240),
  source_urls: z.array(z.url()).min(1),
  outlets: z.array(z.string()).min(1),
  excerpt: z.string().min(1).max(400),
  support: z.number().int().min(1),
  /** Claims the model grouped here. Resolved and re-verified in code. */
  claim_ids: z.array(z.string().min(1)).min(1),
});
export type ConsensusFact = z.infer<typeof ConsensusFactSchema>;

export const ConsensusBatchSchema = z.object({
  facts: z.array(ConsensusFactSchema),
});
export type ConsensusBatch = z.infer<typeof ConsensusBatchSchema>;

export const MFC_FRAMES = [
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
] as const;

export const PERSUASION_TECHNIQUES = [
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
] as const;

export const ENTITY_ROLES = [
  "Victim",
  "Exploited",
  "Scapegoat",
  "Villain",
  "Instigator",
  "Guardian",
  "Hero",
  "Peacemaker",
] as const;

const MfcFrameSchema = z.enum(MFC_FRAMES);
const PersuasionTechniqueSchema = z.enum(PERSUASION_TECHNIQUES);
const EntityRoleSchema = z.enum(ENTITY_ROLES);

export const PersuasionHitSchema = z.object({
  technique: PersuasionTechniqueSchema,
  excerpt: z.string().min(1).max(400),
  explanation: z.string().min(1).max(240),
});
export type PersuasionHit = z.infer<typeof PersuasionHitSchema>;

export const EntityRoleHitSchema = z.object({
  entity_name: z.string().min(1).max(120),
  assigned_role: EntityRoleSchema,
  excerpt: z.string().min(1).max(400),
});
export type EntityRoleHit = z.infer<typeof EntityRoleHitSchema>;

export const FramingSchema = z.object({
  dominant_frame: MfcFrameSchema,
  frame_evidence: z.string().min(1).max(400),
  persuasion: z.array(PersuasionHitSchema).max(5),
  entity_roles: z.array(EntityRoleHitSchema).max(5),
  slant_score: z.number().min(-1).max(1),
  slant_rationale: z.string().min(1).max(240),
});
export type Framing = z.infer<typeof FramingSchema>;

export const SlantSchema = z.object({
  score: z.number().min(-1).max(1),
  rationale: z.string().min(1).max(240),
});
export type Slant = z.infer<typeof SlantSchema>;

export const EventAnchorSchema = z.object({
  event_id: z.uuid(),
  canonical_title: z.string().min(1).max(160),
  query: z.string().min(1).max(160),
  timestamp_updated: z.iso.datetime(),
  seed_url: z.url().optional(),
});
export type EventAnchor = z.infer<typeof EventAnchorSchema>;

export const SpectrumDetailSchema = z.object({
  article_count: z.number().int().min(0),
  average_slant_score: z.number().min(-1).max(1),
  dominant_mfc_frame: z.string(),
  perspective_summary: z.string(),
  detected_persuasion_techniques: z.array(z.string()),
  key_entity_roles: z.array(
    z.object({
      entity_name: z.string(),
      assigned_role: z.string(),
    }),
  ),
});
export type SpectrumDetail = z.infer<typeof SpectrumDetailSchema>;

export const BlindSpotAlertSchema = z.object({
  omitted_spectrum: z.enum(["Left", "Center", "Right"]),
  omission_index: z.number().min(0).max(1),
  description: z.string().min(1),
});
export type BlindSpotAlert = z.infer<typeof BlindSpotAlertSchema>;

export const EventAnchorPayloadSchema = z.object({
  event_id: z.uuid(),
  canonical_title: z.string(),
  timestamp_updated: z.iso.datetime(),
  consensus_fact_core: z.array(z.string()),
  blind_spot_alerts: z.array(BlindSpotAlertSchema),
  spectrum_breakdown: z.object({
    left: SpectrumDetailSchema,
    center: SpectrumDetailSchema,
    right: SpectrumDetailSchema,
  }),
});
export type EventAnchorPayload = z.infer<typeof EventAnchorPayloadSchema>;
