import { z } from "zod";

import {
  ClaimSchema,
  EventAnchorSchema,
  EventAnchorPayloadSchema,
  FramingSchema,
  RelevanceSchema,
} from "@/lib/analysis/schemas";

/**
 * Wire contracts. Everything that crosses the API boundary — including the
 * committed demo files — is parsed with these before it reaches a component.
 */

export const GroupSchema = z.enum(["left", "center", "right"]);
export type Group = z.infer<typeof GroupSchema>;

export const OutletPhaseSchema = z.enum([
  "queued",
  "searching",
  "search_done",
  "no_results",
  "reading",
  "read_failed",
  "analyzing",
  "analyzed",
  "irrelevant",
  "unavailable",
  "absence_check",
  "absent",
  "absence_inconclusive",
]);
export type OutletPhase = z.infer<typeof OutletPhaseSchema>;

export const ActivityEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: z.string(),
    status: z.enum(["start", "done", "skip"]),
    message: z.string(),
    at: z.string(),
    duration_ms: z.number().optional(),
  }),
  z.object({
    type: z.literal("outlet"),
    outletId: z.string(),
    name: z.string(),
    domain: z.string(),
    group: GroupSchema,
    phase: OutletPhaseSchema,
    at: z.string(),
    detail: z.string().optional(),
    count: z.number().optional(),
    source: z.enum(["live", "cached"]).optional(),
  }),
  z.object({
    type: z.literal("log"),
    message: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    at: z.string(),
  }),
]);
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/** Server-to-client events: the done event is added by the route. */
export const StreamEventSchema = z.union([
  ActivityEventSchema,
  z.object({
    type: z.literal("done"),
    result: z.unknown(),
    at: z.string(),
  }),
]);

export const FramingReportSchema = z.object({
  dominant_frame: z.string().nullable(),
  frame_evidence: z.string().nullable(),
  persuasion: FramingSchema.shape.persuasion,
  entity_roles: FramingSchema.shape.entity_roles,
  slant_score: z.number().min(-1).max(1),
  slant_rationale: z.string(),
});
export type FramingReport = z.infer<typeof FramingReportSchema>;

export const ArticleReportSchema = z.object({
  url: z.url(),
  title: z.string().nullable(),
  outletId: z.string(),
  outletName: z.string(),
  group: GroupSchema,
  published_at: z.string().nullable(),
  status: z.enum(["relevant", "irrelevant", "unavailable", "not_accessible"]),
  fetch: z.enum(["ok", "cached", "failed"]),
  error: z.string().optional(),
  relevance: RelevanceSchema.optional(),
  claims: z.array(ClaimSchema),
  framing: FramingReportSchema.optional(),
  notes: z.array(z.string()),
});
export type ArticleReport = z.infer<typeof ArticleReportSchema>;

export const OutletReportSchema = z.object({
  outletId: z.string(),
  name: z.string(),
  domain: z.string(),
  homepage: z.url(),
  group: GroupSchema,
  rating_source: z.string(),
  rating_url: z.url(),
  searched: z.boolean(),
  search_source: z.enum(["live", "cached", "none"]),
  search_results: z.number().int().min(0),
  articles: z.array(ArticleReportSchema),
  covered: z.boolean(),
  error: z.string().optional(),
});
export type OutletReport = z.infer<typeof OutletReportSchema>;

export const AbsenceEvidenceSchema = z.object({
  outlet: z.string(),
  group: GroupSchema,
  checked_at: z.string(),
  search_query: z.string(),
  search_results_relevant: z.number().int(),
  onsite_results_found: z.number().int(),
  onsite_search_available: z.boolean(),
  searched_url: z.string().nullable(),
  run_id: z.string().nullable(),
  screenshot_url: z.string().nullable(),
  notes: z.string(),
});
export type AbsenceEvidence = z.infer<typeof AbsenceEvidenceSchema>;

export const FactEvidenceSchema = z.object({
  outlet: z.string(),
  url: z.url(),
  excerpt: z.string().min(1),
});
export type FactEvidence = z.infer<typeof FactEvidenceSchema>;

export const ConsensusFactDetailSchema = z.object({
  fact_id: z.string(),
  text: z.string(),
  source_urls: z.array(z.url()).min(1),
  outlets: z.array(z.string()).min(1),
  excerpt: z.string().min(1),
  support: z.number().int().min(1),
  claim_ids: z.array(z.string()).min(1),
  covering_outlets: z.number().int().min(0),
  evidence: z.array(FactEvidenceSchema).min(1),
});
export type ConsensusFactDetail = z.infer<typeof ConsensusFactDetailSchema>;

export const BlindSpotFindingSchema = z.object({
  group: GroupSchema,
  status: z.enum(["notice", "inconclusive", "quiet"]),
  omission_index: z.number().min(0).max(1),
  overall_coverage: z.number().min(0).max(1),
  claim_support: z.number().min(0).max(1),
  coverage: z.object({
    covered: z.number().int().min(0),
    monitored: z.number().int().min(0),
  }),
  description: z.string(),
  evidence: z.array(AbsenceEvidenceSchema),
  notes: z.array(z.string()),
});
export type BlindSpotFinding = z.infer<typeof BlindSpotFindingSchema>;

export const AnalyzeResultSchema = z.object({
  event: EventAnchorSchema,
  payload: EventAnchorPayloadSchema,
  facts: z.array(ConsensusFactDetailSchema),
  outlets: z.array(OutletReportSchema),
  blind_spots: z.array(BlindSpotFindingSchema),
  consensus: z.object({
    covering_outlets: z.number().int().min(0),
    monitored_outlets: z.number().int().min(0),
    consensus_share: z.number().min(0).max(1),
    total_claims: z.number().int().min(0),
  }),
  mode: z.object({
    llm: z.enum(["live", "mock"]),
    llm_model: z.string().nullable(),
    tinyfish: z.enum(["live", "cached"]),
    replay: z.boolean(),
  }),
  generated_at: z.string(),
  duration_ms: z.number().min(0),
  caveats: z.array(z.string()),
  activity: z.array(ActivityEventSchema),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

export const DemoFileSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  cached_at: z.string(),
  input: z.object({
    type: z.enum(["topic", "url"]),
    value: z.string().min(1),
  }),
  result: AnalyzeResultSchema,
});
export type DemoFile = z.infer<typeof DemoFileSchema>;
