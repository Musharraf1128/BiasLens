import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { cacheGet, cacheKey, cacheSet, sha256 } from "@/lib/cache";
import { getLlmConfig } from "@/lib/env";

export type JsonCallResult<T> =
  | { ok: true; value: T; cached: boolean; attempts: number }
  | { ok: false; reason: string; status?: number; attempts: number };

export type JsonCallOptions<T> = {
  stage: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaText: string;
  promptVersion: string;
  cacheParts?: unknown[];
  maxOutputTokens?: number;
  timeoutMs?: number;
  cacheTtlSeconds?: number;
};

function parseJsonLoose(text: string): unknown | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function loadMockFixture(
  stage: string,
  cacheParts: unknown[],
): Promise<unknown | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "data", "mock", `${stage}.json`),
      "utf8",
    );
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const index = Number.parseInt(sha256(JSON.stringify(cacheParts)).slice(0, 8), 16) % parsed.length;
      return parsed[index];
    }
    return parsed;
  } catch {
    return null;
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string; type?: string };
};

async function postChat(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  timeoutMs: number;
  jsonMode: boolean;
  reasoningEffort: "none" | "low" | "medium" | "high" | null;
}): Promise<{ ok: true; content: string } | { ok: false; status: number; body: string }> {
  let response: Response;
  try {
    response = await fetch(`${options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        temperature: 0,
        max_tokens: options.maxOutputTokens,
        ...(options.reasoningEffort
          ? { reasoning: { effort: options.reasoningEffort } }
          : {}),
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      status: error instanceof DOMException && error.name === "TimeoutError" ? 408 : 502,
      body: error instanceof DOMException && error.name === "TimeoutError"
        ? "LLM request timed out"
        : "LLM request failed before a response was received",
    };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body: await response.text() };
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return {
      ok: false,
      status: 502,
      body: data.error?.message ?? "LLM returned an empty message",
    };
  }
  return { ok: true, content };
}

export async function chatJson<T>(
  options: JsonCallOptions<T>,
): Promise<JsonCallResult<T>> {
  const config = getLlmConfig();
  const cacheDigest = cacheKey([
    "llm",
    options.stage,
    config.model ?? "no-model",
    options.promptVersion,
    sha256(options.system),
    sha256(options.user),
    sha256(options.schemaText),
    ...(options.cacheParts ?? []),
  ]);

  const cached = await cacheGet<T>(cacheDigest);
  if (cached !== null) {
    return { ok: true, value: cached, cached: true, attempts: 0 };
  }

  if (config.mode === "mock") {
    const fixture = await loadMockFixture(options.stage, options.cacheParts ?? []);
    if (fixture === null) {
      return {
        ok: false,
        reason: `Mock mode (${config.reason ?? "no key"}); no data/mock/${options.stage}.json fixture`,
        attempts: 0,
      };
    }
    const parsed = options.schema.safeParse(fixture);
    if (!parsed.success) {
      return {
        ok: false,
        reason: `Mock fixture for ${options.stage} failed validation: ${parsed.error.message}`,
        attempts: 0,
      };
    }
    await cacheSet(cacheDigest, parsed.data, options.cacheTtlSeconds ?? 86_400);
    return { ok: true, value: parsed.data, cached: false, attempts: 0 };
  }

  if (!config.apiKey || !config.model) {
    return {
      ok: false,
      reason: config.reason ?? "LLM is not configured",
      attempts: 0,
    };
  }

  const maxOutputTokens = options.maxOutputTokens ?? 2000;
  const timeoutMs = options.timeoutMs ?? 45_000;
  let lastReason = "LLM call failed";
  let lastStatus: number | undefined;
  let userPrompt = options.user;

  for (let attempt = 0; attempt < 2; attempt++) {
    let result = await postChat({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      system: options.system,
      user: userPrompt,
      maxOutputTokens,
      timeoutMs,
      jsonMode: true,
      reasoningEffort: config.reasoningEffort,
    });

    // Some OpenAI-compatible providers reject response_format. Retry once
    // without it; the prompt still demands JSON.
    if (!result.ok && result.status === 400 && /response_format|json/i.test(result.body)) {
      result = await postChat({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        system: options.system,
        user: userPrompt,
        maxOutputTokens,
        timeoutMs,
        jsonMode: false,
        reasoningEffort: config.reasoningEffort,
      });
    }

    if (!result.ok) {
      lastStatus = result.status;
      lastReason = `LLM HTTP ${result.status}: ${result.body.slice(0, 200)}`;
      const retryable = result.status === 408 || result.status === 429 || result.status >= 500;
      if (retryable && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        continue;
      }
      break;
    }

    const raw = parseJsonLoose(result.content);
    if (raw === null) {
      lastReason = "LLM output was not valid JSON";
      userPrompt = `${options.user}\n\nYour previous output was not valid JSON. Return corrected JSON only.`;
      continue;
    }

    const parsed = options.schema.safeParse(raw);
    if (parsed.success) {
      await cacheSet(
        cacheDigest,
        parsed.data,
        options.cacheTtlSeconds ?? 86_400,
      );
      return {
        ok: true,
        value: parsed.data,
        cached: false,
        attempts: attempt + 1,
      };
    }

    lastReason = `LLM output failed schema validation: ${parsed.error.message}`;
    userPrompt = `${options.user}\n\nYour previous output failed validation: ${parsed.error.message}\nReturn corrected JSON only.`;
  }

  return {
    ok: false,
    reason: lastReason,
    status: lastStatus,
    attempts: 2,
  };
}

export function llmStatus(): {
  mode: "live" | "mock";
  configured: boolean;
  model: string | null;
  reason: string | null;
} {
  const config = getLlmConfig();
  return {
    mode: config.mode,
    configured: config.configured,
    model: config.model,
    reason: config.reason,
  };
}
