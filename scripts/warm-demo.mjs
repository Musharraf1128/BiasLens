#!/usr/bin/env node
/** Validate derived demo replay files without making network calls. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "demo");
let files = [];

try {
  files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
} catch {
  console.log("No data/demo directory yet.");
  console.log("Create data/demo/<story>.json after the pipeline is wired.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("No demo stories yet.");
  console.log("Add data/demo/<story>.json with derived results — never full article text.");
  process.exit(0);
}

const errors = [];

function wordCount(value) {
  return String(value ?? "").trim() ? String(value).trim().split(/\s+/).length : 0;
}

for (const file of files) {
  const label = `data/demo/${file}`;
  let story;
  try {
    story = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    continue;
  }

  if (!story.id) errors.push(`${label}: missing id`);
  if (!story.input?.type || !story.input?.value) {
    errors.push(`${label}: input.type and input.value are required`);
  }
  const result = story.result;
  if (!result?.event?.canonical_title) {
    errors.push(`${label}: result.event.canonical_title is required`);
  }
  if (!result?.payload) {
    errors.push(`${label}: result.payload is required`);
  } else {
    for (const group of ["left", "center", "right"]) {
      if (!result.payload.spectrum_breakdown?.[group]) {
        errors.push(`${label}: result.payload.spectrum_breakdown.${group} is required`);
      }
    }
  }
  if (!Array.isArray(result?.outlets)) {
    errors.push(`${label}: result.outlets must be an array`);
  }
  if (!Array.isArray(result?.activity)) {
    errors.push(`${label}: result.activity must be an array`);
  }
  if (!Array.isArray(result?.facts)) {
    errors.push(`${label}: result.facts must be an array`);
  } else {
    for (const [index, fact] of result.facts.entries()) {
      if (!fact.text || !fact.source_urls?.length || !fact.excerpt) {
        errors.push(`${label}: result.facts[${index}] is missing evidence`);
      }
      if (wordCount(fact.excerpt) > 25) {
        errors.push(`${label}: result.facts[${index}].excerpt exceeds 25 words`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Demo check failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Demo stories OK: ${files.length} (${files.join(", ")}).`);
