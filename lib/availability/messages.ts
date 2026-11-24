const MARKER = "space_unavailable:";

/** Turn the database exception into the sentence returned to the client. */
export function publicAvailabilityMessage(raw: string): string {
  const text = raw.trim();
  const index = text.indexOf(MARKER);
  if (index === -1) return text;
  const message = text.slice(index + MARKER.length).trim();
  return message || "Those dates or times are not available.";
}

export function isAvailabilityConflictMessage(raw: string): boolean {
  return raw.includes(MARKER) || publicAvailabilityMessage(raw).startsWith("Those dates or times are not available");
}
