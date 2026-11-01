/**
 * Evidence verification.
 *
 * Every fact, frame, persuasion hit, and entity role that reaches the UI must
 * carry a verbatim excerpt from the article it came from. The LLM is never
 * trusted to quote correctly: this module is the gate, and it runs in code.
 */

export const MAX_EXCERPT_WORDS = 25;

/** Collapse all whitespace runs and trim. Used on both sides of a comparison. */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function countWords(input: string): number {
  const normalized = normalizeWhitespace(input);
  if (normalized.length === 0) return 0;
  return normalized.split(" ").length;
}

/** Case-sensitive, whitespace-insensitive exact substring check. */
export function isVerbatim(excerpt: string, articleText: string): boolean {
  const needle = normalizeWhitespace(excerpt);
  if (needle.length === 0) return false;
  return normalizeWhitespace(articleText).includes(needle);
}

export type EvidenceCheck = {
  ok: boolean;
  reason?: "empty" | "too_long" | "not_found";
  words: number;
};

export function checkExcerpt(
  excerpt: string,
  articleText: string,
): EvidenceCheck {
  const words = countWords(excerpt);
  if (words === 0) return { ok: false, reason: "empty", words };
  if (words > MAX_EXCERPT_WORDS) return { ok: false, reason: "too_long", words };
  if (!isVerbatim(excerpt, articleText)) {
    return { ok: false, reason: "not_found", words };
  }
  return { ok: true, words };
}

/**
 * Keep only items whose excerpt is quoted from the article. Anything else is
 * dropped rather than repaired: a rewritten quote is not evidence.
 */
export function keepVerified<T>(
  items: T[],
  getExcerpt: (item: T) => string,
  articleText: string,
): T[] {
  return items.filter((item) => checkExcerpt(getExcerpt(item), articleText).ok);
}

/**
 * Remove the outlet's identity before a slant or frame judgement, so the model
 * scores the text rather than the brand. Applied case-insensitively.
 */
export function maskOutlet(
  text: string,
  identity: { name: string; domain: string; aliases?: string[] },
): string {
  const tokens = [identity.name, identity.domain, identity.domain.replace(/^www\./, "")];
  for (const alias of identity.aliases ?? []) tokens.push(alias);

  let masked = text;
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed.length < 3) continue;
    const pattern = new RegExp(escapeRegExp(trimmed), "gi");
    masked = masked.replace(pattern, "the outlet");
  }
  // Collapse the artefacts of repeated replacement ("the outlet the outlet").
  return masked.replace(/\bthe outlet(?:\s+the outlet\b)+/gi, "the outlet");
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trim an article to the analysis window without cutting mid-quote. Keeps the
 * lead and the paragraphs that mention the event query, in original order.
 */
export function selectArticleWindow(
  text: string,
  query: string,
  maxChars: number,
): string {
  if (text.length <= maxChars) return text;

  const paragraphs = text.split(/\n{2,}/);
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);

  const keep = new Set<number>();
  let used = 0;

  // Lead first, then keyword paragraphs, then the rest in order.
  const priority: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index < 3) priority.push(index);
    else if (terms.some((term) => paragraph.toLowerCase().includes(term))) {
      priority.push(index);
    }
  });
  paragraphs.forEach((_, index) => {
    if (!priority.includes(index)) priority.push(index);
  });

  for (const index of priority) {
    const paragraph = paragraphs[index];
    if (used + paragraph.length > maxChars) continue;
    keep.add(index);
    used += paragraph.length;
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((index) => paragraphs[index])
    .join("\n\n");
}
