import { z } from "zod";

export const TopNewsGroupSchema = z.enum(["left", "center", "right"]);
export type TopNewsGroup = z.infer<typeof TopNewsGroupSchema>;

export const OrientationSchema = z.object({
  left: z.number().int().min(0).max(100),
  center: z.number().int().min(0).max(100),
  right: z.number().int().min(0).max(100),
  total: z.number().int().min(1),
}).refine(
  (value) => value.left + value.center + value.right === 100,
  "Orientation percentages must total 100",
);

export const TopNewsSourceSchema = z.object({
  outlet_id: z.string().min(1),
  outlet_name: z.string().min(1),
  domain: z.string().min(1),
  group: TopNewsGroupSchema,
  title: z.string().min(1),
  url: z.url(),
  published_at: z.string().nullable(),
  excerpt: z.string().max(400),
  excerpt_verified: z.boolean(),
});

export const RelatedImageSchema = z.object({
  image_url: z.url(),
  source_url: z.url(),
  alt: z.string().min(1).max(240),
  credit: z.string().min(1).max(120),
});

export const TopNewsStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  query: z.string().min(1),
  representative_url: z.url(),
  excerpt: z.string().max(400),
  excerpt_verified: z.boolean(),
  sources: z.array(TopNewsSourceSchema).min(1),
  outlet_count: z.number().int().min(1),
  orientation: OrientationSchema,
  related_image: RelatedImageSchema.nullable().optional(),
  related_image_version: z.enum(["v2", "v3", "v4"]).optional(),
});

export const TopNewsFeedSchema = z.object({
  generated_at: z.iso.datetime(),
  query: z.string().min(1),
  search_window_minutes: z.number().int().positive(),
  monitored_outlets: z.number().int().positive(),
  stories: z.array(TopNewsStorySchema),
  search_failures: z.number().int().min(0),
  status: z.enum(["live", "partial", "unavailable"]),
});

export type TopNewsSource = z.infer<typeof TopNewsSourceSchema>;
export type TopNewsStory = z.infer<typeof TopNewsStorySchema>;
export type TopNewsFeed = z.infer<typeof TopNewsFeedSchema>;
export type RelatedImage = z.infer<typeof RelatedImageSchema>;
