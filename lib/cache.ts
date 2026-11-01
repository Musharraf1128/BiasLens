import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR =
  process.env.BIASLENS_CACHE_DIR?.trim() ||
  path.join(process.cwd(), "data", "cache");

const DEFAULT_TTL_SECONDS = 86_400;

type CacheEntry<T> = {
  key: string;
  createdAt: string;
  expiresAt: string;
  value: T;
};

const memory = new Map<string, { expiresAt: number; value: unknown }>();

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function cacheKey(parts: unknown[]): string {
  return sha256(parts.map(stableStringify).join("\u0000"));
}

function fileNameFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const mem = memory.get(key);
  if (mem) {
    if (mem.expiresAt > Date.now()) return mem.value as T;
    memory.delete(key);
  }

  try {
    const raw = await readFile(fileNameFor(key), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.parse(entry.expiresAt) <= Date.now()) return null;
    memory.set(key, { expiresAt: Date.parse(entry.expiresAt), value: entry.value });
    return entry.value;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + Math.max(0, ttlSeconds) * 1000;
  memory.set(key, { expiresAt, value });

  const entry: CacheEntry<T> = {
    key,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    value,
  };

  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const target = fileNameFor(key);
    const temp = `${target}.${process.pid}.${now}.tmp`;
    await writeFile(temp, JSON.stringify(entry), "utf8");
    await rename(temp, target);
  } catch (error) {
    console.warn(
      `[cache] could not persist ${key.slice(0, 12)}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return { value: hit, cached: true };
  const value = await load();
  await cacheSet(key, value, ttlSeconds);
  return { value, cached: false };
}

export function getCacheDir(): string {
  return CACHE_DIR;
}
