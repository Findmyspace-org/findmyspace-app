import type { CrmProfile } from "./types";

export function normalizeSpacerEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function normalizeDisplayName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Prefer admin, rows with email, then newest. */
function profilePreferenceScore(
  profile: CrmProfile,
  preferredProfileId?: string | null
): number {
  let score = 0;
  if (preferredProfileId && profile.id === preferredProfileId) score += 1e12;
  if (profile.role === "admin") score += 1000;
  if (profile.email?.trim()) score += 100;
  const created = profile.created_at
    ? new Date(profile.created_at).getTime()
    : 0;
  return score + created / 1e12;
}

/**
 * All active profile ids that represent the same person as `current`
 * (same email, or same normalized name when emails differ or are missing).
 */
export function findProfileAliasIds(
  current: Pick<CrmProfile, "id" | "email" | "full_name">,
  profiles: CrmProfile[]
): string[] {
  const ids = new Set<string>([current.id]);
  const emailKey = normalizeSpacerEmail(current.email);
  const nameKey = normalizeDisplayName(current.full_name);

  for (const p of profiles) {
    if (!p.active || p.id === current.id) continue;
    const pEmail = normalizeSpacerEmail(p.email);
    const pName = normalizeDisplayName(p.full_name);
    if (emailKey && pEmail && pEmail === emailKey) {
      ids.add(p.id);
      continue;
    }
    if (nameKey && pName && pName === nameKey) {
      ids.add(p.id);
    }
  }

  return [...ids];
}

/**
 * Active profiles only — one entry per email and display name.
 * When `preferredProfileId` is set, that row wins over duplicate email/name rows.
 */
export function dedupeActiveSpacers(
  profiles: CrmProfile[],
  preferredProfileId?: string | null
): CrmProfile[] {
  const active = profiles.filter((p) => p.active);
  const sorted = [...active].sort(
    (a, b) =>
      profilePreferenceScore(b, preferredProfileId) -
      profilePreferenceScore(a, preferredProfileId)
  );

  const byEmail = new Map<string, CrmProfile>();
  const byName = new Map<string, CrmProfile>();

  if (preferredProfileId) {
    const preferred = active.find((p) => p.id === preferredProfileId);
    if (preferred) {
      const emailKey = normalizeSpacerEmail(preferred.email);
      const nameKey = normalizeDisplayName(preferred.full_name);
      if (emailKey) byEmail.set(emailKey, preferred);
      if (nameKey) byName.set(nameKey, preferred);
    }
  }

  for (const profile of sorted) {
    const emailKey = normalizeSpacerEmail(profile.email);
    const nameKey = normalizeDisplayName(profile.full_name);

    if (emailKey) {
      if (!byEmail.has(emailKey)) byEmail.set(emailKey, profile);
      else if (profile.id === preferredProfileId) byEmail.set(emailKey, profile);
      continue;
    }

    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, profile);
      else if (profile.id === preferredProfileId) byName.set(nameKey, profile);
    }
  }

  const seenIds = new Set<string>();
  const result: CrmProfile[] = [];
  for (const profile of [...byEmail.values(), ...byName.values()]) {
    if (seenIds.has(profile.id)) continue;
    seenIds.add(profile.id);
    result.push(profile);
  }

  for (const profile of sorted) {
    if (seenIds.has(profile.id)) continue;
    if (!profile.email?.trim() && !profile.full_name?.trim()) {
      seenIds.add(profile.id);
      result.push(profile);
    }
  }

  return result.sort((a, b) =>
    spacerSortKey(a).localeCompare(spacerSortKey(b), undefined, {
      sensitivity: "base",
    })
  );
}

/** Roster for assignee/view selectors — excludes the signed-in user and their aliases. */
export function rosterExcludingCurrentUser(
  profiles: CrmProfile[],
  current: Pick<CrmProfile, "id" | "email" | "full_name"> | null | undefined
): CrmProfile[] {
  if (!current) return dedupeActiveSpacers(profiles);
  const deduped = dedupeActiveSpacers(profiles, current.id);
  const aliasIds = new Set(findProfileAliasIds(current, profiles));
  return deduped.filter((p) => !aliasIds.has(p.id));
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
