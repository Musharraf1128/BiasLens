import { cacheGet, cacheKey, cacheSet, sha256 } from "@/lib/cache";
import { outlets, thresholds, type Group, type Outlet } from "@/lib/config";
import {
  TopNewsFeedSchema,
  type TopNewsFeed,
  type TopNewsSource,
  type TopNewsStory,
} from "@/lib/top-news-schema";
import {
  fetchArticles,
  searchOutletCoverage,
  tinyfishReady,
  type SearchResult,
} from "@/lib/tinyfish";

export type TopNewsFeedResponse = {
  feed: TopNewsFeed;
  cached: boolean;
};

type Candidate = {
  outlet: Outlet;
  result: SearchResult;
};

type Bundle = {
  candidates: Candidate[];
  tokens: Set<string>;
};

const STOP_WORDS = new Set([
  "about", "after", "against", "amid", "and", "are", "been", "before",
  "being", "between", "from", "have", "india", "into", "latest", "more",
  "news", "over", "says", "that", "the", "their", "this", "with", "will",
]);

function tokensFor(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function sharesStory(candidate: Candidate, bundle: Bundle): boolean {
  const candidateTokens = tokensFor(candidate.result.title);
  if (candidateTokens.size === 0 || bundle.tokens.size === 0) return false;
  const overlap = [...candidateTokens].filter((token) => bundle.tokens.has(token)).length;
  const minimum = Math.min(candidateTokens.size, bundle.tokens.size);
  return overlap >= 2 && overlap / minimum >= 0.5;
}

function excerptFromText(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length >= 20 && !value.startsWith("#"));
  if (!line) return "";
  return line.split(/\s+/).slice(0, 25).join(" ");
}

function previewExcerpt(value: string): string {
  return value.trim().split(/\s+/).slice(0, 25).join(" ");
}

function percentages(counts: Record<Group, number>, total: number) {
  const groups: Group[] = ["left", "center", "right"];
  const raw = groups.map((group) => (counts[group] / total) * 100);
  const rounded = raw.map(Math.floor);
  let remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = [...groups.keys()].sort((a, b) => raw[b] - rounded[b] - (raw[a] - rounded[a]));
  for (const index of order) {
    if (remainder <= 0) break;
    rounded[index] += 1;
    remainder -= 1;
  }
  return {
    left: rounded[0],
    center: rounded[1],
    right: rounded[2],
    total,
  };
}

function rankBundle(bundle: Bundle): number {
  const groups = new Set(bundle.candidates.map((candidate) => candidate.outlet.group));
  const positionScore = bundle.candidates.reduce(
    (sum, candidate) => sum + Math.max(0, 12 - candidate.result.position),
    0,
  );
  return bundle.candidates.length * 20 + groups.size * 8 + positionScore;
}

function chooseStories(bundles: Bundle[], limit: number): Bundle[] {
  const ranked = [...bundles].sort((a, b) => rankBundle(b) - rankBundle(a));
  const selected = ranked.slice(0, limit);
  const groups = new Set(selected.flatMap((bundle) => bundle.candidates.map((candidate) => candidate.outlet.group)));

  for (const group of ["left", "center", "right"] as const) {
    if (groups.has(group)) continue;
    const replacement = ranked.find(
      (bundle) => bundle.candidates.some((candidate) => candidate.outlet.group === group) && !selected.includes(bundle),
    );
    if (replacement && selected.length > 0) {
      selected[selected.length - 1] = replacement;
      groups.add(group);
    }
  }

  return selected;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function makeFeed(options: {
  candidates: Candidate[];
  failed: number;
  fetchedByUrl: Map<string, { text: string }>;
}): TopNewsFeed {
  const bundles: Bundle[] = [];
  for (const candidate of options.candidates) {
    const existing = bundles.find((bundle) => sharesStory(candidate, bundle));
    if (existing) {
      existing.candidates.push(candidate);
      for (const token of tokensFor(candidate.result.title)) existing.tokens.add(token);
    } else {
      bundles.push({
        candidates: [candidate],
        tokens: tokensFor(candidate.result.title),
      });
    }
  }

  const stories = chooseStories(bundles, thresholds.top_news_max_items).map((bundle) => {
    const candidates = [...bundle.candidates].sort((a, b) => a.result.position - b.result.position);
    const representative = candidates[0];
    const counts: Record<Group, number> = { left: 0, center: 0, right: 0 };
    const seenOutlets = new Set<string>();

    const sources = candidates.map((candidate) => {
      const { outlet, result } = candidate;
      if (!seenOutlets.has(outlet.id)) {
        seenOutlets.add(outlet.id);
        counts[outlet.group] += 1;
      }
      const fetched = options.fetchedByUrl.get(result.url);
      const excerpt = fetched ? excerptFromText(fetched.text) : previewExcerpt(result.snippet);
      return {
        outlet_id: outlet.id,
        outlet_name: outlet.name,
        domain: outlet.domain,
        group: outlet.group,
        title: result.title,
        url: result.url,
        published_at: result.date ?? null,
        excerpt,
        excerpt_verified: Boolean(fetched && excerpt),
      } satisfies TopNewsSource;
    });

    const representativeSource = sources[0];
    return {
      id: `story-${sha256(candidates.map((candidate) => candidate.result.url).sort().join("|")) .slice(0, 12)}`,
      title: representative.result.title,
      query: thresholds.top_news_query,
      representative_url: representative.result.url,
      excerpt: representativeSource.excerpt,
      excerpt_verified: representativeSource.excerpt_verified,
      sources,
      outlet_count: seenOutlets.size,
      orientation: percentages(counts, seenOutlets.size),
    } satisfies TopNewsStory;
  });

  const status = stories.length === 0
    ? "unavailable"
    : options.failed > 0
      ? "partial"
      : "live";

  return TopNewsFeedSchema.parse({
    generated_at: new Date().toISOString(),
    query: thresholds.top_news_query,
    search_window_minutes: thresholds.top_news_search_window_minutes,
    monitored_outlets: outlets.length,
    stories,
    search_failures: options.failed,
    status,
  });
}

export async function getTopNewsFeed(options: {
  forceRefresh?: boolean;
} = {}): Promise<TopNewsFeedResponse> {
  const key = cacheKey([
    "top-news-feed",
    thresholds.top_news_query,
    thresholds.top_news_search_window_minutes,
    thresholds.top_news_results_per_outlet,
    thresholds.top_news_max_items,
  ]);

  if (!options.forceRefresh) {
    const cached = await cacheGet<TopNewsFeed>(key);
    if (cached) return { feed: TopNewsFeedSchema.parse(cached), cached: true };
  }

  const cached = await cacheGet<TopNewsFeed>(key);
  if (!tinyfishReady()) {
    if (cached) return { feed: TopNewsFeedSchema.parse(cached), cached: true };
    return {
      feed: TopNewsFeedSchema.parse({
        generated_at: new Date().toISOString(),
        query: thresholds.top_news_query,
        search_window_minutes: thresholds.top_news_search_window_minutes,
        monitored_outlets: outlets.length,
        stories: [],
        search_failures: outlets.length,
        status: "unavailable",
      }),
      cached: false,
    };
  }

  const attempts = await mapLimit(outlets, thresholds.outlet_search_concurrency, async (outlet) => {
    try {
      const response = await searchOutletCoverage({
        outlet,
        query: thresholds.top_news_query,
        recencyMinutes: thresholds.top_news_search_window_minutes,
        cacheTtlSeconds: thresholds.top_news_cache_ttl_seconds,
        forceRefresh: options.forceRefresh,
      });
      return {
        outlet,
        results: response.results
          .sort((a, b) => a.position - b.position)
          .slice(0, thresholds.top_news_results_per_outlet),
        failed: false,
      };
    } catch {
      return { outlet, results: [] as SearchResult[], failed: true };
    }
  });

  const candidates = attempts.flatMap((attempt) =>
    attempt.results.map((result) => ({ outlet: attempt.outlet, result })),
  );
  const bundles = new Set(candidates.map((candidate) => candidate.result.url));
  const fetchUrls = [...bundles].slice(0, thresholds.top_news_max_fetch_urls);
  const fetchedByUrl = new Map<string, { text: string }>();

  if (fetchUrls.length > 0) {
    try {
      const fetched = await fetchArticles({
        urls: fetchUrls,
        purpose: "Read the lead of recent public news articles for a source-linked Top News preview",
        cacheTtlSeconds: thresholds.top_news_cache_ttl_seconds,
      });
      for (const page of fetched.results) {
        fetchedByUrl.set(page.url, { text: page.text });
        fetchedByUrl.set(page.final_url, { text: page.text });
      }
    } catch {
      // Search titles and snippets remain valid source-linked previews.
    }
  }

  const feed = makeFeed({
    candidates,
    failed: attempts.filter((attempt) => attempt.failed).length,
    fetchedByUrl,
  });
  await cacheSet(key, feed, thresholds.top_news_cache_ttl_seconds);
  return { feed, cached: false };
}
