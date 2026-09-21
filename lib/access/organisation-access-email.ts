/** Canonical organisation_access email: lower(trim(email)), matching 064. */

export function normalizeOrganisationAccessEmail(
  email: string | null | undefined
): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length <= 2) return null;
  const at = normalized.indexOf("@");
  if (at < 1 || at === normalized.length - 1) return null;
  if (normalized.includes(" ")) return null;
  return normalized;
}
