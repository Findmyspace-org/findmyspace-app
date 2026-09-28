import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listManagedSpaceIdsForHostingContext,
  type HostingContext,
} from "@/lib/access/hosting-context";
import type { FinanceBookingInput } from "@/lib/finance-booking-lines";
import { FINANCE_BOOKINGS_QUERY_LIMIT } from "@/lib/finance-query-limits";

export const HOST_FINANCE_BOOKING_SELECT = `
  id,
  space_id,
  booking_unit,
  total_price,
  platform_fee,
  owner_earnings,
  status,
  payment_status,
  paid_at,
  created_at,
  monthly_rent,
  months_total,
  months_paid,
  deposit_amount,
  initial_payment_amount,
  next_payment_date,
  renter:profiles!bookings_renter_id_fkey(first_name, last_name, email),
  space:spaces(title),
  booking_charges(
    id,
    charge_type,
    description,
    billing_period_start,
    billing_period_end,
    amount,
    status,
    paid_at,
    payment_reference,
    statement_month
  )
`;

export type HostFinanceSpaceOption = { id: string; title: string | null };

export type HostFinancePayload = {
  spaces: HostFinanceSpaceOption[];
  bookings: FinanceBookingInput[];
};

const EMPTY_HOST_FINANCE: HostFinancePayload = { spaces: [], bookings: [] };

/**
 * Hosting Finance totals + transactions. Service-role read scoped to managed
 * spaces. Does not read or create organisation_payouts — an empty payout
 * ledger is a valid loaded state, not a loading condition.
 */
export async function loadHostFinancePayload(
  admin: SupabaseClient,
  userId: string,
  context: HostingContext,
  options?: { isGlobalAdmin?: boolean }
): Promise<HostFinancePayload> {
  if (context.kind === "unavailable" || context.kind === "none") {
    return EMPTY_HOST_FINANCE;
  }

  const spaceIds = await listManagedSpaceIdsForHostingContext(
    admin,
    userId,
    context,
    { isGlobalAdmin: options?.isGlobalAdmin }
  );
  if (spaceIds.length === 0) return EMPTY_HOST_FINANCE;

  const { data: spaceRows, error: spaceError } = await admin
    .from("spaces")
    .select("id, title, status")
    .in("id", spaceIds)
    .order("title", { ascending: true });

  if (spaceError) {
    throw new Error(spaceError.message || "Could not load finance spaces.");
  }

  const spaces = ((spaceRows || []) as Array<{
    id: string;
    title: string | null;
    status: string | null;
  }>)
    .filter((space) => (space.status || "pending") !== "deleted")
    .map((space) => ({ id: space.id, title: space.title }));

  if (spaces.length === 0) return EMPTY_HOST_FINANCE;

  const { data: bookingRows, error: bookingError } = await (
    // Nested renter/space/charge embeds are wider than generated Row types.
    admin.from("bookings") as unknown as {
      select: (columns: string) => {
        in: (column: string, values: string[]) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => {
            limit: (count: number) => Promise<{
              data: FinanceBookingInput[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .select(HOST_FINANCE_BOOKING_SELECT)
    .in(
      "space_id",
      spaces.map((space) => space.id)
    )
    .order("created_at", { ascending: false })
    .limit(FINANCE_BOOKINGS_QUERY_LIMIT);

  if (bookingError) {
    throw new Error(bookingError.message || "Could not load finance bookings.");
  }

  return {
    spaces,
    bookings: (bookingRows || []) as FinanceBookingInput[],
  };
}
