import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { DemoFileSchema, type DemoFile } from "@/lib/analysis/types";

/**
 * Committed demo runs. A demo file holds derived labels, short excerpts, and
 * the recorded activity log — never full article text.
 */

const DEMO_DIR = path.join(process.cwd(), "data", "demo");

export type DemoSummary = {
  id: string;
  title: string;
  input: string;
  cached_at: string;
  notes: string | null;
};

export async function listDemoStories(): Promise<DemoSummary[]> {
  let files: string[] = [];
  try {
    files = (await readdir(DEMO_DIR)).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }

  const stories: DemoSummary[] = [];
  for (const file of files) {
    const demo = await readDemoFile(file.replace(/\.json$/, ""));
    if (!demo) continue;
    stories.push({
      id: demo.id,
      title: demo.result.event.canonical_title,
      input: demo.input.value,
      cached_at: demo.cached_at,
      notes: demo.notes ?? null,
    });
  }

  return stories.sort((a, b) => a.title.localeCompare(b.title));
}

async function readDemoFile(id: string): Promise<DemoFile | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(id)) return null;

  try {
    const raw = await readFile(path.join(DEMO_DIR, `${id}.json`), "utf8");
    const parsed = DemoFileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(
        `[demo] ${id}.json failed validation: ${parsed.error.message.slice(0, 300)}`,
      );
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function loadDemoStory(id: string): Promise<DemoFile | null> {
  return readDemoFile(id);
}
