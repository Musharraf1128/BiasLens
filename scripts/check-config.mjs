#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const errors = [];

async function readJson(relativePath) {
  try {
    return JSON.parse(
      await readFile(path.join(root, relativePath), "utf8"),
    );
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function checkUrl(value, label) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${label}: must be http(s), got ${value}`);
    }
  } catch {
    errors.push(`${label}: invalid URL ${value}`);
  }
}

const outletsFile = await readJson("config/outlets.json");
const thresholds = await readJson("config/thresholds.json");

if (outletsFile) {
  const groups = outletsFile.groups ?? {};
  for (const key of ["left", "center", "right"]) {
    if (!groups[key]) errors.push(`config/outlets.json: missing group label ${key}`);
  }

  const outlets = outletsFile.outlets ?? [];
  if (!Array.isArray(outlets) || outlets.length === 0) {
    errors.push("config/outlets.json: outlets must be a non-empty array");
  }
  if (Array.isArray(outlets) && outlets.length < 15) {
    errors.push(`config/outlets.json: at least 15 outlets are required (found ${outlets.length})`);
  }

  const ids = new Set();
  const domains = new Set();
  for (const outlet of outlets) {
    const label = outlet.id || "(missing id)";
    if (!outlet.id) errors.push(`outlet ${label}: missing id`);
    if (!outlet.name) errors.push(`outlet ${label}: missing name`);
    if (!["left", "center", "right"].includes(outlet.group)) {
      errors.push(`outlet ${label}: invalid group ${outlet.group}`);
    }
    if (!outlet.domain) errors.push(`outlet ${label}: missing domain`);
    if (ids.has(outlet.id)) errors.push(`outlet ${label}: duplicate id`);
    if (domains.has(outlet.domain)) errors.push(`outlet ${label}: duplicate domain`);
    ids.add(outlet.id);
    domains.add(outlet.domain);
    if (outlet.homepage) checkUrl(outlet.homepage, `${label}.homepage`);
    else errors.push(`outlet ${label}: missing homepage`);
    if (outlet.rating_url) checkUrl(outlet.rating_url, `${label}.rating_url`);
    else errors.push(`outlet ${label}: missing rating_url`);
    if (typeof outlet.rating_verified !== "boolean") {
      errors.push(`outlet ${label}: rating_verified must be boolean`);
    }
  }
}

if (thresholds) {
  const unit = [
    "consensus_share",
    "omission_threshold",
    "overall_coverage_threshold",
    "diversity_threshold",
    "slant_label_threshold",
  ];
  for (const key of unit) {
    const value = thresholds[key];
    if (typeof value !== "number" || value < 0 || value > 1) {
      errors.push(`config/thresholds.json: ${key} must be 0..1`);
    }
  }
  if (
    typeof thresholds.search_window_minutes !== "number" ||
    thresholds.search_window_minutes <= 0
  ) {
    errors.push("config/thresholds.json: search_window_minutes must be positive");
  }
  if (thresholds.max_fetch_urls_per_request > 10) {
    errors.push("config/thresholds.json: max_fetch_urls_per_request must be <= 10");
  }
  if (thresholds.max_search_results_per_outlet > 10) {
    errors.push("config/thresholds.json: max_search_results_per_outlet must be <= 10");
  }
  if (thresholds.top_news_max_fetch_urls > 10) {
    errors.push("config/thresholds.json: top_news_max_fetch_urls must be <= 10");
  }
  if (thresholds.top_news_search_window_minutes <= 0) {
    errors.push("config/thresholds.json: top_news_search_window_minutes must be positive");
  }
}

for (const required of [
  "BIASLENS_BUILD_SPEC.md",
  "schema/event-anchor.schema.json",
  ".env.example",
]) {
  try {
    await readFile(path.join(root, required));
  } catch {
    errors.push(`missing required file: ${required}`);
  }
}

if (errors.length > 0) {
  console.error("Config check failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Config OK: ${outletsFile.outlets.length} outlets, ` +
    `${Math.round(thresholds.consensus_share * 100)}% consensus, ` +
    `${thresholds.search_window_minutes} min window.`,
);
