const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for a non-empty UUID string — safe for `.eq()` / `.in()` on uuid columns. */
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && UUID_RE.test(value.trim());
}

export function getDisplayName(profile?: {
  first_name?: string | null;
  last_name?: string | null;
} | null) {
  if (!profile) return "Unknown";

  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return name || "Unknown";
}