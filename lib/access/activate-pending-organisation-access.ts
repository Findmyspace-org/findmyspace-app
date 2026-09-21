import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivatedOrganisationAccess = {
  id: string;
  organisation_id: string;
  role: string;
  property_id: string | null;
  space_id: string | null;
  invited_by: string | null;
};

/**
 * Deprecated no-op.
 * Pending organisation_access is activated only by invitation acceptance.
 * Kept so leftover clients cannot attach grants by email match.
 */
export async function activatePendingOrganisationAccess(
  _admin: SupabaseClient,
  _userId: string
): Promise<ActivatedOrganisationAccess[]> {
  return [];
}
