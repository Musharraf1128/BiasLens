#!/usr/bin/env node
/**
 * TinyFish smoke test. No dependencies.
 *
 *   node --env-file=.env.local .opencode/skills/tinyfish/scripts/probe.mjs
 *   node --env-file=.env.local .opencode/skills/tinyfish/scripts/probe.mjs --agent
 *
 * Checks: key present, Search, Fetch. With --agent, runs one short absence-style
 * Agent call (costs wallet credits; skip unless needed).
 */

const key = process.env.TINYFISH_API_KEY;
if (!key) {
  console.error("TINYFISH_API_KEY is not set. Use: node --env-file=.env.local ...");
  process.exit(1);
}

const headers = { "X-API-Key": key };
const started = Date.now();
const step = (name) => console.log(`\n[${((Date.now() - started) / 1000).toFixed(1)}s] ${name}`);

async function search() {
  step("Search: include_domains + news");
  const params = new URLSearchParams({
    query: "Parliament budget session",
    include_domains: "thehindu.com",
    domain_type: "news",
    language: "en",
    location: "IN",
    recency_minutes: "10080",
    purpose: "Smoke test BiasLens outlet-scoped coverage discovery",
  });

  const res = await fetch(`https://api.search.tinyfish.ai?${params}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(`  ${data.results?.length ?? 0} results, total=${data.total_results}`);
  for (const r of (data.results ?? []).slice(0, 3)) {
    console.log(`  - ${r.title} (${r.url})`);
  }
  return data.results?.[0]?.url;
}

async function fetchOne(url) {
  if (!url) return;
  step(`Fetch: ${url}`);
  const res = await fetch("https://api.fetch.tinyfish.ai", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: [url],
      format: "markdown",
      purpose: "Smoke test BiasLens article reading",
    }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok) throw new Error(`Fetch ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const page = data.results?.[0];
  console.log(`  title: ${page?.title ?? "(none)"}`);
  console.log(`  chars: ${page?.text?.length ?? 0}`);
  for (const err of data.errors ?? []) console.log(`  error: ${err.url} -> ${err.error}`);
}

async function agent() {
  step("Agent: short absence-style run");
  const body = {
    url: "https://www.thehindu.com/",
    goal: 'Open the site search, search for "Parliament budget session", and return JSON only: {"results_found": number, "search_available": boolean, "searched_url": string}. Do not log in, bypass paywalls, or solve CAPTCHAs.',
    output_schema: {
      type: "object",
      properties: {
        results_found: { type: "integer" },
        search_available: { type: "boolean" },
        searched_url: { type: "string" },
      },
      required: ["results_found", "search_available", "searched_url"],
    },
    agent_config: { max_duration_seconds: 90 },
  };

  const res = await fetch("https://agent.tinyfish.ai/v1/automation/run", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Agent ${res.status}: ${await res.text()}`);
  const data = await res.json();
  console.log(`  status: ${data.status}, steps: ${data.num_of_steps}`);
  console.log(`  result: ${JSON.stringify(data.result)}`);
  if (data.error) console.log(`  error: ${JSON.stringify(data.error)}`);
}

try {
  const url = await search();
  await fetchOne(url);
  if (process.argv.includes("--agent")) await agent();
  step("OK");
} catch (error) {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
}
