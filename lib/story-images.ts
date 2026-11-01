import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { thresholds } from "@/lib/config";

import { RelatedImageSchema, type RelatedImage } from "@/lib/top-news-schema";

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";

type WikimediaImageInfo = {
  thumburl?: unknown;
  url?: unknown;
  descriptionurl?: unknown;
};

type CachedRelatedImage = RelatedImage | { not_found: true };

function stripMarkup(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function queryFor(title: string): string {
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 10);
  return `${words.join(" ")} India`;
}

function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "upload.wikimedia.org";
  } catch {
    return false;
  }
}

function isAllowedSourceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("wikimedia.org");
  } catch {
    return false;
  }
}

export async function findRelatedImage(title: string): Promise<RelatedImage | null> {
  const key = cacheKey(["wikimedia-related-image-v4", title]);
  const cached = await cacheGet<CachedRelatedImage>(key);
  if (cached) return "not_found" in cached ? null : RelatedImageSchema.parse(cached);

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: queryFor(title),
      gsrlimit: "1",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "1200",
      format: "json",
      origin: "*",
    });
    const response = await fetch(`${WIKIMEDIA_API}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Wikimedia ${response.status}`);

    const body = (await response.json()) as {
      query?: { pages?: Record<string, { title?: unknown; imageinfo?: WikimediaImageInfo[] }> };
    };
    const page = Object.values(body.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    const imageUrl = info?.thumburl ?? info?.url;
    const sourceUrl = info?.descriptionurl;
    if (!isAllowedImageUrl(imageUrl) || !isAllowedSourceUrl(sourceUrl)) {
      await cacheSet(key, { not_found: true }, thresholds.top_news_cache_ttl_seconds);
      return null;
    }

    const credit = stripMarkup(page?.title).replace(/^File:\s*/i, "") || "Wikimedia Commons";
    const related = RelatedImageSchema.parse({
      image_url: imageUrl,
      source_url: sourceUrl,
      alt: `Related public image for ${title}`,
      credit: `Wikimedia Commons · ${credit}`.slice(0, 120),
    });
    await cacheSet(key, related, thresholds.top_news_cache_ttl_seconds);
    return related;
  } catch {
    await cacheSet(key, { not_found: true }, thresholds.top_news_cache_ttl_seconds);
    return null;
  }
}
