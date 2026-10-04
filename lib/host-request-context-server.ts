import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listManagedSpaceIdsForHostingContext,
  type HostingContext,
} from "@/lib/access/hosting-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BOOKING_IDS = 200;

export type HostRequestRenter = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type HostRequestDetail = {
  booking_id: string;
  data: Record<string, unknown> | null;
};

export type HostRequestContextPayload = {
  renters: HostRequestRenter[];
  details: HostRequestDetail[];
};

function uniqueUuids(values: string[]): string[] {
  return Array.from(
    new Set(values.filter((value) => typeof value === "string" && UUID_RE.test(value)))
  );
}

/**
 * Renter names/emails and structured request answers for bookings the host
 * can manage. Service-role read, scoped to managed spaces. Avoids client
 * PostgREST on profiles / booking_request_details (those RLS paths are
 * still owner_id / self-row only).
 */
export async function loadHostRequestContext(
  admin: SupabaseClient,
  userId: string,
  context: HostingContext,
  bookingIds: string[],
  options?: { isGlobalAdmin?: boolean }
): Promise<HostRequestContextPayload> {
  const empty: HostRequestContextPayload = { renters: [], details: [] };
  if (context.kind === "unavailable" || context.kind === "none") {
    return empty;
  }

  const requestedIds = uniqueUuids(bookingIds).slice(0, MAX_BOOKING_IDS);
  if (requestedIds.length === 0) return empty;

  const spaceIds = await listManagedSpaceIdsForHostingContext(
    admin,
    userId,
    context,
    { isGlobalAdmin: options?.isGlobalAdmin }
  );
  if (spaceIds.length === 0) return empty;

  const { data: bookings, error: bookingError } = await admin
    .from("bookings")
    .select("id, space_id, renter_id")
    .in("id", requestedIds)
    .in("space_id", spaceIds);

  if (bookingError) {
    throw new Error(bookingError.message || "Could not load booking requests.");
  }

  const visible = (bookings || []) as Array<{
    id: string;
    space_id: string;
    renter_id: string;
  }>;
  if (visible.length === 0) return empty;

  const visibleBookingIds = visible.map((row) => row.id);
  const renterIds = Array.from(new Set(visible.map((row) => row.renter_id)));

  const [{ data: profileRows }, { data: detailRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", renterIds),
    admin
      .from("booking_request_details")
      .select("booking_id, data")
      .in("booking_id", visibleBookingIds),
  ]);

  const renters = ((profileRows || []) as HostRequestRenter[]).map((row) => ({
    id: row.id,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
  }));

  const details: HostRequestDetail[] = [];
  for (const row of (detailRows || []) as Array<{
    booking_id: string;
    data: unknown;
  }>) {
    details.push({
      booking_id: row.booking_id,
      data:
        row.data && typeof row.data === "object" && !Array.isArray(row.data)
          ? (row.data as Record<string, unknown>)
          : null,
    });
  }

  return { renters, details };
}
