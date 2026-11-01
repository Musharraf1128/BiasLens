import { z } from "zod";

import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { thresholds, type Outlet } from "@/lib/config";
import { getScreenshotsEnabled, getTinyFishKey, tinyfishEndpoints } from "@/lib/env";

const endpoints = tinyfishEndpoints;

export class TinyFishError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`TinyFish ${status}: ${body.slice(0, 300)}`);
    this.name = "TinyFishError";
    this.status = status;
    this.body = body;
  }
}

export type SearchResult = {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
  date?: string;
  publisher?: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  total_results: number;
  page: number;
};

export type FetchResult = {
  url: string;
  final_url: string;
  title: string | null;
  description: string | null;
  language: string | null;
  author: string | null;
  published_date: string | null;
  text: string;
  links?: string[];
  latency_ms?: number | null;
  format: string;
};

export type FetchError = {
  url: string;
  error: string;
  status?: number;
};

export type FetchResponse = {
  results: FetchResult[];
  errors: FetchError[];
};

export type AgentRun = {
  run_id: string | null;
  status: "COMPLETED" | "FAILED" | "PENDING" | "RUNNING" | "CANCELLED";
  started_at: string | null;
  finished_at: string | null;
  num_of_steps: number | null;
  result: unknown;
  steps?: unknown[];
  error: {
    code?: string;
    message?: string;
    category?: string;
    retry_after?: number | null;
    help_url?: string;
    help_message?: string;
  } | null;
};

export type AbsenceEvidence = {
  outlet: string;
  group: Outlet["group"];
  checked_at: string;
  search_query: string;
  search_results_relevant: number;
  onsite_results_found: number;
  onsite_search_available: boolean;
  searched_url: string | null;
  run_id: string | null;
  screenshot_url: string | null;
  notes: string;
};

export type AbsenceOutcome =
  | { status: "absent"; evidence: AbsenceEvidence }
  | { status: "covered"; evidence: AbsenceEvidence }
  | { status: "inconclusive"; evidence: AbsenceEvidence };

const AbsenceResultSchema = z.object({
  results_found: z.number().int(),
  top_titles: z.array(z.string()).max(5).default([]),
  searched_url: z.string().default(""),
  search_available: z.boolean(),
  notes: z.string().optional(),
});

const SCREENSHOT_KEYS = [
  "screenshot_url",
  "screenshotUrl",
  "screenshot",
  "screenshot_uri",
];

function findScreenshotUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findScreenshotUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of SCREENSHOT_KEYS) {
      const candidate = record[key];
      if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) {
        return candidate;
      }
    }
    for (const item of Object.values(record)) {
      const found = findScreenshotUrl(item);
      if (found) return found;
    }
  }

  return null;
}

function authHeaders(): Record<string, string> {
  const key = getTinyFishKey();
  if (!key) throw new TinyFishError(401, "TINYFISH_API_KEY is not set");
  return { "X-API-Key": key };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          await sleep(400 * 2 ** attempt + Math.random() * 200);
          continue;
        }
      }

      throw new TinyFishError(response.status, await response.text());
    } catch (error) {
      if (error instanceof TinyFishError) throw error;
      lastError = error;
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt + Math.random() * 200);
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("TinyFish request failed");
}

function hostMatches(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const target = domain.replace(/^www\./, "").toLowerCase();
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

export function tinyfishReady(): boolean {
  return getTinyFishKey() !== null;
}

export async function searchOutletCoverage(options: {
  outlet: Outlet;
  query: string;
  recencyMinutes: number;
  language?: string;
  location?: string;
  cacheTtlSeconds?: number;
  forceRefresh?: boolean;
}): Promise<SearchResponse & { cached: boolean }> {
  const {
    outlet,
    query,
    recencyMinutes,
    language = "en",
    location = "IN",
    cacheTtlSeconds = 3600,
    forceRefresh = false,
  } = options;

  const key = cacheKey([
    "tinyfish:search",
    outlet.domain,
    query,
    recencyMinutes,
    language,
    location,
  ]);

  const cached = await cacheGet<SearchResponse>(key);
  if (cached && !forceRefresh) return { ...cached, cached: true };

  const params = new URLSearchParams({
    query,
    include_domains: outlet.domain,
    domain_type: "news",
    recency_minutes: String(recencyMinutes),
    language,
    location,
    purpose: `Find ${outlet.name}'s coverage of this specific event`,
  });

  const response = await requestWithRetry(
    `${endpoints().search}?${params}`,
    { headers: authHeaders() },
    10_000,
  );
  const data = (await response.json()) as SearchResponse;
  data.results = (data.results ?? []).filter((result) =>
    hostMatches(result.url, outlet.domain),
  );

  await cacheSet(key, data, cacheTtlSeconds);
  return { ...data, cached: false };
}

export async function fetchArticles(options: {
  urls: string[];
  ttlSeconds?: number;
  purpose?: string;
  cacheTtlSeconds?: number;
}): Promise<FetchResponse & { cached: number }> {
  const {
    urls,
    ttlSeconds,
    purpose = "Extract article text for event claim and framing analysis",
    cacheTtlSeconds = 3600,
  } = options;

  const unique = [...new Set(urls)].filter(Boolean);
  const results: FetchResult[] = [];
  const errors: FetchError[] = [];
  let cachedCount = 0;

  const missing: string[] = [];
  for (const url of unique) {
    const key = cacheKey(["tinyfish:fetch", url]);
    const hit = await cacheGet<FetchResult>(key);
    if (hit) {
      results.push(hit);
      cachedCount += 1;
    } else {
      missing.push(url);
    }
  }

  const batchSize = thresholds.max_fetch_urls_per_request;
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const response = await requestWithRetry(
      endpoints().fetch,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: batch,
          format: "markdown",
          purpose,
          ...(ttlSeconds !== undefined ? { ttl: ttlSeconds } : {}),
        }),
      },
      150_000,
    );

    const data = (await response.json()) as FetchResponse;
    for (const result of data.results ?? []) {
      results.push(result);
      await cacheSet(cacheKey(["tinyfish:fetch", result.url]), result, cacheTtlSeconds);
    }
    errors.push(...(data.errors ?? []));
  }

  return { results, errors, cached: cachedCount };
}

export function buildAbsenceGoal(
  outlet: Outlet,
  eventQuery: string,
): string {
  return `Go to ${outlet.homepage}. Use the site's own search interface (not an external search engine) to search for: "${eventQuery}".

Rules:
- Do not log in, sign up, bypass a paywall, or solve a CAPTCHA.
- Accept only essential cookie consent if a banner blocks the search.
- Count only headlines that are about this specific event, not loose keyword matches.
- If the search page loads and shows a result state, set search_available=true.
- If the search page is blocked, requires login, errors, or never loads, set results_found=-1, search_available=false, and explain in notes.

Return JSON only, matching the provided output schema.`;
}

const absenceOutputSchema = {
  type: "object",
  properties: {
    results_found: { type: "integer" },
    top_titles: { type: "array", items: { type: "string" } },
    searched_url: { type: "string" },
    search_available: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["results_found", "top_titles", "searched_url", "search_available"],
};

export async function runAgent(options: {
  url: string;
  goal: string;
  outputSchema?: object;
  browserProfile?: "lite" | "stealth";
  maxDurationSeconds?: number;
  captureScreenshots?: boolean;
  timeoutMs?: number;
}): Promise<{ run: AgentRun; screenshotsRequested: boolean }> {
  const {
    url,
    goal,
    outputSchema,
    browserProfile = "lite",
    maxDurationSeconds = 90,
    captureScreenshots = false,
    timeoutMs = 120_000,
  } = options;

  const attempt = async (withCapture: boolean) => {
    const response = await requestWithRetry(
      `${endpoints().agent}/automation/run`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          goal,
          ...(outputSchema ? { output_schema: outputSchema } : {}),
          browser_profile: browserProfile,
          agent_config: { max_duration_seconds: maxDurationSeconds },
          ...(withCapture ? { capture_config: { screenshots: true } } : {}),
        }),
      },
      timeoutMs,
      0,
    );
    return (await response.json()) as AgentRun;
  };

  if (captureScreenshots) {
    try {
      return { run: await attempt(true), screenshotsRequested: true };
    } catch (error) {
      if (!(error instanceof TinyFishError) || error.status !== 403) throw error;
      console.warn("[tinyfish] capture_config not enabled; retrying without screenshots");
    }
  }

  return {
    run: await attempt(false),
    screenshotsRequested: false,
  };
}

export async function runAbsenceCheck(options: {
  outlet: Outlet;
  eventQuery: string;
  searchResultsRelevant?: number;
  browserProfile?: "lite" | "stealth";
  cacheTtlSeconds?: number;
}): Promise<AbsenceOutcome> {
  const {
    outlet,
    eventQuery,
    searchResultsRelevant = 0,
    browserProfile = "lite",
    cacheTtlSeconds = 6 * 3600,
  } = options;

  const key = cacheKey([
    "tinyfish:absence",
    outlet.domain,
    eventQuery,
    browserProfile,
  ]);
  const cached = await cacheGet<AbsenceOutcome>(key);
  if (cached) return cached;

  const { run, screenshotsRequested } = await runAgent({
    url: outlet.homepage,
    goal: buildAbsenceGoal(outlet, eventQuery),
    outputSchema: absenceOutputSchema,
    browserProfile,
    captureScreenshots: getScreenshotsEnabled(),
    timeoutMs: 150_000,
  });

  const checkedAt = new Date().toISOString();
  const parsed = AbsenceResultSchema.safeParse(run.result);
  const unavailable =
    run.status !== "COMPLETED" ||
    !parsed.success ||
    run.error != null ||
    parsed.data.search_available === false ||
    parsed.data.results_found < 0;

  if (unavailable) {
    const outcome: AbsenceOutcome = {
      status: "inconclusive",
      evidence: {
        outlet: outlet.name,
        group: outlet.group,
        checked_at: checkedAt,
        search_query: eventQuery,
        search_results_relevant: searchResultsRelevant,
        onsite_results_found: parsed.success ? parsed.data.results_found : -1,
        onsite_search_available: parsed.success
          ? parsed.data.search_available
          : false,
        searched_url: parsed.success ? parsed.data.searched_url || null : null,
        run_id: run.run_id,
        screenshot_url: findScreenshotUrl(run.steps),
        notes:
          parsed.success
            ? parsed.data.notes || "Agent reported the search as unavailable"
            : `Agent result did not match the absence schema (${run.status})`,
      },
    };
    await cacheSet(key, outcome, 600);
    return outcome;
  }

  const found = parsed.data.results_found;
  const outcome: AbsenceOutcome =
    found === 0
      ? {
          status: "absent",
          evidence: {
            outlet: outlet.name,
            group: outlet.group,
            checked_at: checkedAt,
            search_query: eventQuery,
            search_results_relevant: searchResultsRelevant,
            onsite_results_found: 0,
            onsite_search_available: true,
            searched_url: parsed.data.searched_url || null,
            run_id: run.run_id,
            screenshot_url: findScreenshotUrl(run.steps),
            notes:
              parsed.data.notes ||
              `On-site search returned no matching headlines${screenshotsRequested ? " (screenshot requested)" : ""}`,
          },
        }
      : {
          status: "covered",
          evidence: {
            outlet: outlet.name,
            group: outlet.group,
            checked_at: checkedAt,
            search_query: eventQuery,
            search_results_relevant: found,
            onsite_results_found: found,
            onsite_search_available: true,
            searched_url: parsed.data.searched_url || null,
            run_id: run.run_id,
            screenshot_url: findScreenshotUrl(run.steps),
            notes:
              parsed.data.notes ||
              `On-site search found ${found} matching headline(s)`,
          },
        };

  await cacheSet(key, outcome, cacheTtlSeconds);
  return outcome;
}

export async function startAgentStream(body: {
  url: string;
  goal: string;
  outputSchema?: object;
  browserProfile?: "lite" | "stealth";
  maxDurationSeconds?: number;
}): Promise<Response> {
  const response = await fetch(`${endpoints().agent}/automation/run-sse`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      url: body.url,
      goal: body.goal,
      ...(body.outputSchema ? { output_schema: body.outputSchema } : {}),
      browser_profile: body.browserProfile ?? "lite",
      agent_config: { max_duration_seconds: body.maxDurationSeconds ?? 90 },
    }),
    signal: AbortSignal.timeout(5 * 60_000),
  });

  if (!response.ok) {
    throw new TinyFishError(response.status, await response.text());
  }
  return response;
}

export async function getRun(runId: string): Promise<AgentRun> {
  const response = await requestWithRetry(
    `${endpoints().agent}/runs/${encodeURIComponent(runId)}`,
    { headers: authHeaders() },
    30_000,
  );
  return (await response.json()) as AgentRun;
}

export async function cancelRun(runId: string): Promise<void> {
  await requestWithRetry(
    `${endpoints().agent}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST", headers: authHeaders() },
    30_000,
    0,
  );
}
