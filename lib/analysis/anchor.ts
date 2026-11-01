import { randomUUID } from "node:crypto";

import type { EventAnchor } from "@/lib/analysis/schemas";
import { fetchArticles } from "@/lib/tinyfish";

const MAX_TITLE_CHARS = 120;
const MAX_QUERY_WORDS = 12;

/** Strip common news-site suffixes: " - The Hindu", " | India Today", " – NDTV". */
function stripSiteSuffix(title: string): string {
  return title
    .replace(/\s+[-–—|·]\s+[^-–—|·]{2,40}$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimWords(input: string, max: number): string {
  const words = input.trim().split(/\s+/);
  return words.length <= max ? input.trim() : words.slice(0, max).join(" ");
}

export function isUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function anchorFromTopic(topic: string): EventAnchor {
  const cleaned = topic.replace(/\s+/g, " ").trim();
  const title = trimWords(cleaned, 20).slice(0, MAX_TITLE_CHARS);

  return {
    event_id: randomUUID(),
    canonical_title: title,
    query: trimWords(cleaned, MAX_QUERY_WORDS),
    timestamp_updated: new Date().toISOString(),
  };
}

function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop() ?? "";
    return last
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .slice(0, 120);
  } catch {
    return url;
  }
}

/**
 * Seed-URL anchor: read the page once with TinyFish, then use its headline and
 * lead to form a title and a short query. If the read fails, fall back to the
 * URL slug — the anchor is still stable and the user sees why.
 */
export async function anchorFromUrl(
  url: string,
): Promise<{ anchor: EventAnchor; note: string | null }> {
  const fallback = slugFromUrl(url);
  const base: EventAnchor = {
    event_id: randomUUID(),
    canonical_title: trimWords(fallback || url, 20).slice(0, MAX_TITLE_CHARS),
    query: trimWords(fallback || url, MAX_QUERY_WORDS),
    timestamp_updated: new Date().toISOString(),
    seed_url: url,
  };

  try {
    const { results } = await fetchArticles({ urls: [url] });
    const page = results[0];
    if (!page) {
      return { anchor: base, note: "Seed URL could not be read; anchored on the URL slug." };
    }

    const headline = stripSiteSuffix(page.title ?? "");
    const title = headline || base.canonical_title;
    const lead = (page.description ?? "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      anchor: {
        ...base,
        canonical_title: trimWords(title, 20).slice(0, MAX_TITLE_CHARS),
        query: trimWords(headline || lead || base.query, MAX_QUERY_WORDS),
      },
      note: null,
    };
  } catch (error) {
    return {
      anchor: base,
      note: `Seed URL could not be read (${
        error instanceof Error ? error.message.slice(0, 120) : "unknown error"
      }); anchored on the URL slug.`,
    };
  }
}
