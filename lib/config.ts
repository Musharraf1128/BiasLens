import { z } from "zod";

import outletsJson from "@/config/outlets.json";
import thresholdsJson from "@/config/thresholds.json";

export const GroupSchema = z.enum(["left", "center", "right"]);
export type Group = z.infer<typeof GroupSchema>;

const OutletSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  homepage: z.url(),
  group: GroupSchema,
  rating_source: z.string().min(1),
  rating_url: z.url(),
  rating_verified: z.boolean(),
});

const OutletsFileSchema = z.object({
  updated_at: z.string().min(1),
  note: z.string(),
  groups: z.record(GroupSchema, z.string()),
  outlets: z.array(OutletSchema).min(1),
});

const ThresholdsSchema = z.object({
  consensus_share: z.number().min(0).max(1),
  search_window_minutes: z.number().int().positive(),
  max_search_results_per_outlet: z.number().int().min(1).max(10),
  max_fetch_urls_per_request: z.number().int().min(1).max(10),
  max_articles_per_outlet: z.number().int().positive(),
  omission_threshold: z.number().min(0).max(1),
  overall_coverage_threshold: z.number().min(0).max(1),
  diversity_threshold: z.number().min(0).max(1),
  slant_label_threshold: z.number().min(0).max(1),
  max_article_chars: z.number().int().positive(),
  pipeline_deadline_ms: z.number().int().positive(),
  max_articles_total: z.number().int().positive(),
  llm_concurrency: z.number().int().positive(),
  llm_timeout_ms: z.number().int().positive(),
  llm_retries: z.number().int().min(0).max(2),
  outlet_search_concurrency: z.number().int().positive(),
  fetch_ttl_seconds: z.number().int().nonnegative(),
  cache_ttl_seconds: z.number().int().positive(),
  top_news_query: z.string().min(3),
  top_news_search_window_minutes: z.number().int().positive(),
  top_news_results_per_outlet: z.number().int().min(1).max(10),
  top_news_max_items: z.number().int().positive(),
  top_news_max_fetch_urls: z.number().int().min(1).max(10),
  top_news_cache_ttl_seconds: z.number().int().positive(),
  agent_timeout_seconds: z.number().int().positive(),
  screenshots_enabled: z.boolean(),
});

export type Outlet = z.infer<typeof OutletSchema>;
export type OutletsFile = z.infer<typeof OutletsFileSchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export const outletsFile: OutletsFile = OutletsFileSchema.parse(outletsJson);
export const thresholds: Thresholds = ThresholdsSchema.parse(thresholdsJson);
export const outlets: Outlet[] = outletsFile.outlets;

export const outletsByGroup: Record<Group, Outlet[]> = {
  left: outlets.filter((outlet) => outlet.group === "left"),
  center: outlets.filter((outlet) => outlet.group === "center"),
  right: outlets.filter((outlet) => outlet.group === "right"),
};

export const groupLabels: Record<Group, string> = {
  left: outletsFile.groups.left,
  center: outletsFile.groups.center,
  right: outletsFile.groups.right,
};

export function getOutlet(id: string): Outlet | undefined {
  return outlets.find((outlet) => outlet.id === id);
}

export function getOutletByDomain(domain: string): Outlet | undefined {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return outlets.find(
    (outlet) =>
      outlet.domain.toLowerCase().replace(/^www\./, "") === normalized,
  );
}
