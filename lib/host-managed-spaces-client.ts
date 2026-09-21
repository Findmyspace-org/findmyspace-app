export type ManagedSpaceRow = {
  id: string;
  title: string | null;
  city?: string | null;
  suburb?: string | null;
  status?: string | null;
  booking_unit?: string | null;
  public_listing_mode?: string | null;
  owner_id?: string | null;
};

export async function fetchManagedSpaces(
  accessToken: string
): Promise<ManagedSpaceRow[]> {
  const res = await fetch("/api/host/managed-spaces", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as {
    spaces?: ManagedSpaceRow[];
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(json?.error || "Could not load managed spaces.");
  }
  return json?.spaces || [];
}
