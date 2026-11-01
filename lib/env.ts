export type LlmMode = "live" | "mock";

export type LlmConfig = {
  baseUrl: string;
  apiKey: string | null;
  model: string | null;
  reasoningEffort: "none" | "low" | "medium" | "high" | null;
  mode: LlmMode;
  configured: boolean;
  forcedMock: boolean;
  reason: string | null;
};

export function getTinyFishKey(): string | null {
  return process.env.TINYFISH_API_KEY?.trim() || null;
}

export function tinyfishConfigured(): boolean {
  return getTinyFishKey() !== null;
}

/**
 * Verified TinyFish endpoints. The env overrides exist so the full pipeline can
 * be exercised against a local stub without a key; production leaves them unset.
 */
export function tinyfishEndpoints(): {
  search: string;
  fetch: string;
  agent: string;
} {
  return {
    search:
      process.env.TINYFISH_SEARCH_URL?.trim() ||
      "https://api.search.tinyfish.ai",
    fetch:
      process.env.TINYFISH_FETCH_URL?.trim() ||
      "https://api.fetch.tinyfish.ai",
    agent:
      process.env.TINYFISH_AGENT_URL?.trim() ||
      "https://agent.tinyfish.ai/v1",
  };
}

export function getLlmConfig(): LlmConfig {
  const baseUrl = (
    process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const apiKey = process.env.LLM_API_KEY?.trim() || null;
  const model = process.env.LLM_MODEL?.trim() || null;
  const configuredReasoning = process.env.LLM_REASONING_EFFORT?.trim();
  const reasoningEffort = ["none", "low", "medium", "high"].includes(
    configuredReasoning ?? "",
  )
    ? (configuredReasoning as "none" | "low" | "medium" | "high")
    : baseUrl.includes("openrouter.ai")
      ? "none"
      : null;
  const forcedMock = process.env.LLM_MOCK === "1";
  const configured = Boolean(apiKey && model);

  let reason: string | null = null;
  if (forcedMock) reason = "LLM_MOCK=1";
  else if (!apiKey) reason = "LLM_API_KEY is not set";
  else if (!model) reason = "LLM_MODEL is not set";

  return {
    baseUrl,
    apiKey,
    model,
    reasoningEffort,
    mode: configured && !forcedMock ? "live" : "mock",
    configured,
    forcedMock,
    reason,
  };
}

export function getScreenshotsEnabled(): boolean {
  return process.env.TINYFISH_SCREENSHOTS === "1";
}
