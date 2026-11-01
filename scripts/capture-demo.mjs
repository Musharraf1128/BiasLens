#!/usr/bin/env node
/**
 * Capture one completed SSE analysis into data/demo/<id>.json.
 * The server has already removed raw article text; this writes only the typed
 * derived result and the activity trail.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , storyId, input, baseUrl = "http://localhost:3000"] = process.argv;

if (!storyId || !input || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(storyId)) {
  console.error("Usage: npm run capture-demo -- <story-id> <topic-or-url> [base-url]");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input }),
});

if (!response.ok || !response.body) {
  console.error(`Analysis request failed with HTTP ${response.status}.`);
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let result = null;
const activity = [];

function consume(chunk) {
  buffer += chunk;
  const records = buffer.split("\n\n");
  buffer = records.pop() ?? "";
  for (const record of records) {
    const line = record.split("\n").find((item) => item.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") result = event.result;
    else activity.push(event);
  }
}

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  consume(decoder.decode(value, { stream: true }));
}
consume(decoder.decode());

if (!result) {
  console.error("The stream ended without a completed result.");
  process.exit(1);
}

result.activity = activity;
const demo = {
  id: storyId,
  cached_at: new Date().toISOString(),
  input: {
    type: /^https?:\/\//i.test(input.trim()) ? "url" : "topic",
    value: input.trim(),
  },
  notes: "Captured from a completed BiasLens analysis; derived results only.",
  result,
};

const directory = path.join(process.cwd(), "data", "demo");
await mkdir(directory, { recursive: true });
await writeFile(
  path.join(directory, `${storyId}.json`),
  `${JSON.stringify(demo, null, 2)}\n`,
  "utf8",
);
console.log(`Captured data/demo/${storyId}.json`);
