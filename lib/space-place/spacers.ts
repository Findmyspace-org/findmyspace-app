import type { CrmProfile } from "./types";

export function normalizeSpacerEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function normalizeDisplayName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Prefer admin, rows with email, then newest. */
function profilePreferenceScore(profile: CrmProfile): number {
  let score = 0;
  if (profile.role === "admin") score += 1000;
  if (profile.email?.trim()) score += 100;
  const created = profile.created_at
    ? new Date(profile.created_at).getTime()
    : 0;
  return score + created / 1e12;
}

/**
 * Active profiles only — one entry per id, email, and display name.
 * Resolves duplicate "Schalk van der Merwe" rows from multiple auth accounts.
 */
export function dedupeActiveSpacers(profiles: CrmProfile[]): CrmProfile[] {
  const active = profiles.filter((p) => p.active);
  const sorted = [...active].sort(
    (a, b) => profilePreferenceScore(b) - profilePreferenceScore(a)
  );

  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();
  const result: CrmProfile[] = [];

  for (const profile of sorted) {
    if (seenIds.has(profile.id)) continue;

    const emailKey = normalizeSpacerEmail(profile.email);
    const nameKey = normalizeDisplayName(profile.full_name);

    if (emailKey && seenEmails.has(emailKey)) continue;
    if (nameKey && seenNames.has(nameKey)) continue;

    seenIds.add(profile.id);
    if (emailKey) seenEmails.add(emailKey);
    if (nameKey) seenNames.add(nameKey);
    result.push(profile);
  }

  return result.sort((a, b) =>
    spacerSortKey(a).localeCompare(spacerSortKey(b), undefined, {
      sensitivity: "base",
    })
  );
}

function spacerSortKey(profile: CrmProfile): string {
  return (
    profile.full_name?.trim() ||
    profile.email?.trim() ||
    profile.id
  ).toLowerCase();
}

/** Label for selects; adds email when names collide in the roster. */
export function formatSpacerOptionLabel(
  profile: CrmProfile,
  roster: CrmProfile[]
): string {
  const name = profile.full_name?.trim() || "Unnamed";
  const nameCount = roster.filter(
    (p) => (p.full_name?.trim() || "Unnamed") === name
  ).length;
  if (nameCount > 1 && profile.email?.trim()) {
    return `${name} (${profile.email.trim()})`;
  }
  if (!profile.full_name?.trim() && profile.email?.trim()) {
    return profile.email.trim();
  }
  return name;
}

export function countDuplicateProfileIds(profiles: CrmProfile[]): number {
  const ids = profiles.map((p) => p.id);
  return ids.length - new Set(ids).size;
}

const SCHALK_DISPLAY_NAME = "schalk van der merwe";

/**
 * Primary active admin profile for Schalk (deduped).
 * Matches role admin + email contains "schalk" or full name "Schalk van der Merwe".
 */
export function findSchalkAdminProfile(
  profiles: CrmProfile[]
): CrmProfile | null {
  const roster = dedupeActiveSpacers(profiles);
  const matches = roster.filter(
    (p) =>
      p.role === "admin" &&
      (normalizeDisplayName(p.full_name) === SCHALK_DISPLAY_NAME ||
        normalizeSpacerEmail(p.email).includes("schalk"))
  );
  return matches[0] ?? null;
}
