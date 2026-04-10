export function getDisplayName(profile?: {
  first_name?: string | null;
  last_name?: string | null;
} | null) {
  if (!profile) return "Unknown";

  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return name || "Unknown";
}