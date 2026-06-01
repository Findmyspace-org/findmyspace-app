import { PIPELINE_STAGES, type PipelineStage } from "./constants";

export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchScore(a: string, b: string): number {
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;

  const wordsA = left.split(" ").filter(Boolean);
  const wordsB = right.split(" ").filter(Boolean);
  const overlap = wordsA.filter((w) => wordsB.includes(w)).length;
  if (overlap === 0) return 0;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

const MATCH_THRESHOLD = 0.55;

export function findBestMatch<T extends { id: string; name: string }>(
  query: string | null | undefined,
  candidates: T[]
): { item: T; score: number } | null {
  if (!query?.trim() || candidates.length === 0) return null;

  let best: { item: T; score: number } | null = null;
  for (const item of candidates) {
    const score = matchScore(query, item.name);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best;
}

export function coercePipelineStage(
  value: string | null | undefined
): PipelineStage | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_").trim();
  if ((PIPELINE_STAGES as readonly string[]).includes(normalized)) {
    return normalized as PipelineStage;
  }
  const aliases: Record<string, PipelineStage> = {
    prospect: "prospect",
    first_contact: "first_contact",
    "first-contact": "first_contact",
    follow_up: "follow_up",
    "follow-up": "follow_up",
    in_progress: "in_progress",
    "in-progress": "in_progress",
    signed_up: "signed_up",
    listed: "listed",
    closed_lost: "closed_lost",
    closed: "closed_lost",
  };
  return aliases[normalized] ?? null;
}

export function splitContactName(fullName: string): {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first_name: null, last_name: null, full_name: "Unnamed" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: null, full_name: trimmed };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
    full_name: trimmed,
  };
}
