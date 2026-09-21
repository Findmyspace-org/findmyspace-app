export type ManagedSpaceRow = {
  id: string;
  title: string | null;
  description?: string | null;
  city?: string | null;
  suburb?: string | null;
  address_line_1?: string | null;
  space_type?: string | null;
  status?: string | null;
  booking_unit?: string | null;
  price_amount?: number | null;
  price_unit?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  public_listing_mode?: string | null;
  created_at?: string | null;
  ownership_proof_status?: string | null;
  deposit_type?: string | null;
  deposit_months?: number | null;
  monthly_payment_day?: number | null;
  property_id?: string | null;
  property_name?: string | null;
  organisation_id?: string | null;
  cover_image_url?: string | null;
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
