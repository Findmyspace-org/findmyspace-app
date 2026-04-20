import type { SupabaseClient } from "@supabase/supabase-js";

export type AdvisorRange = "all" | "7d" | "30d";

export function advisorRangeFromQuery(raw: string | null): AdvisorRange {
  if (raw === "7d" || raw === "30d") return raw;
  return "all";
}

export function rangeStartIso(range: AdvisorRange): string | null {
  if (range === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - (range === "7d" ? 7 : 30));
  return d.toISOString();
}

export type AdvisorMetrics = {
  linked_users_count: number;
  listings_created_count: number;
  active_listings_count: number;
  verified_listings_count: number;
  listings_with_bookings_count: number;
  total_bookings_count: number;
};

function emptyMetrics(): AdvisorMetrics {
  return {
    linked_users_count: 0,
    listings_created_count: 0,
    active_listings_count: 0,
    verified_listings_count: 0,
    listings_with_bookings_count: 0,
    total_bookings_count: 0,
  };
}

type SpaceRow = {
  id: string;
  advisor_id: string;
  status: string | null;
  verification_status: string | null;
  created_at: string;
};

type BookingRow = {
  space_id: string | null;
  created_at: string;
};

/**
 * Bulk metrics for many advisors: 3 queries (profiles, spaces, bookings) + in-memory aggregation.
 */
export async function computeAdvisorMetricsForIds(
  admin: SupabaseClient,
  advisorIds: string[],
  range: AdvisorRange
): Promise<Record<string, AdvisorMetrics>> {
  const out: Record<string, AdvisorMetrics> = {};
  for (const id of advisorIds) {
    out[id] = emptyMetrics();
  }
  if (advisorIds.length === 0) return out;

  const start = rangeStartIso(range);
  const inRange = (createdAt: string) =>
    !start || createdAt >= start;

  // --- Profiles: linked users in period ---
  let profQ = (admin.from("profiles") as any)
    .select("advisor_id, created_at")
    .in("advisor_id", advisorIds);
  if (start) profQ = profQ.gte("created_at", start);
  const { data: profRows, error: profErr } = await profQ;
  if (profErr) throw new Error(profErr.message);
  for (const row of profRows || []) {
    const aid = row.advisor_id as string;
    if (!out[aid]) continue;
    out[aid].linked_users_count += 1;
  }

  // --- Spaces: all listings for these advisors (for booking join + listing funnel) ---
  const { data: spaceRows, error: spaceErr } = await (admin.from("spaces") as any)
    .select("id, advisor_id, status, verification_status, created_at")
    .in("advisor_id", advisorIds);

  if (spaceErr) throw new Error(spaceErr.message);
  const spaces = (spaceRows || []) as SpaceRow[];
  const spaceIdToAdvisor = new Map<string, string>();
  for (const s of spaces) {
    spaceIdToAdvisor.set(s.id, s.advisor_id);
  }

  for (const s of spaces) {
    const aid = s.advisor_id;
    if (!out[aid] || !inRange(s.created_at)) continue;
    const m = out[aid];
    m.listings_created_count += 1;
    if (s.status === "active") m.active_listings_count += 1;
    if (s.verification_status === "verified") m.verified_listings_count += 1;
  }

  const spaceIds = spaces.map((s) => s.id);
  if (spaceIds.length === 0) return out;

  let bookQ = (admin.from("bookings") as any)
    .select("space_id, created_at")
    .in("space_id", spaceIds);
  if (start) bookQ = bookQ.gte("created_at", start);

  const { data: bookRows, error: bookErr } = await bookQ;
  if (bookErr) throw new Error(bookErr.message);

  const bookings = (bookRows || []) as BookingRow[];
  const advisorToSpacesWithBooking = new Map<string, Set<string>>();

  for (const b of bookings) {
    if (!b.space_id) continue;
    const aid = spaceIdToAdvisor.get(b.space_id);
    if (!aid || !out[aid]) continue;
    out[aid].total_bookings_count += 1;
    if (!advisorToSpacesWithBooking.has(aid)) {
      advisorToSpacesWithBooking.set(aid, new Set());
    }
    advisorToSpacesWithBooking.get(aid)!.add(b.space_id);
  }

  for (const aid of advisorIds) {
    const set = advisorToSpacesWithBooking.get(aid);
    out[aid].listings_with_bookings_count = set ? set.size : 0;
  }

  return out;
}
