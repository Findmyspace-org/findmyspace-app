import type { CrmProfile } from "./types";

export function normalizeSpacerEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Active profiles only; one row per id and per email. */
export function dedupeActiveSpacers(profiles: CrmProfile[]): CrmProfile[] {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const result: CrmProfile[] = [];

  for (const profile of profiles) {
    if (!profile.active) continue;
    if (seenIds.has(profile.id)) continue;

    const emailKey = normalizeSpacerEmail(profile.email);
    if (emailKey && seenEmails.has(emailKey)) continue;

    seenIds.add(profile.id);
    if (emailKey) seenEmails.add(emailKey);
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
