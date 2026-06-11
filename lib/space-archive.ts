import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_LISTING_MODE_OFF } from "@/lib/public-listing-mode";

export const ARCHIVED_SPACE_STATUS = "deleted" as const;

/** Booking statuses that block admin archive (open / in-progress). */
export const OPEN_BOOKING_STATUSES_BLOCKING_ARCHIVE = [
  "pending_owner",
  "pending",
  "approved",
  "accepted_awaiting_payment",
  "awaiting_payment",
  "paid_confirmed",
  "confirmed",
] as const;

export type OpenBookingStatusBlockingArchive =
  (typeof OPEN_BOOKING_STATUSES_BLOCKING_ARCHIVE)[number];

export function isArchivedSpace(status: string | null | undefined): boolean {
  return (status || "") === ARCHIVED_SPACE_STATUS;
}

export function isOpenBookingStatusForArchive(
  status: string | null | undefined,
  paymentStatus?: string | null | undefined
): boolean {
  if ((OPEN_BOOKING_STATUSES_BLOCKING_ARCHIVE as readonly string[]).includes(status || "")) {
    return true;
  }
  return (paymentStatus || "") === "awaiting_payment";
}

export async function countOpenBookingsForSpace(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ count: number; statuses: string[] }> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, payment_status")
    .eq("space_id", spaceId);

  if (error) {
    throw new Error(error.message);
  }

  const open = ((data as { status: string | null; payment_status: string | null }[]) || []).filter(
    (row) => isOpenBookingStatusForArchive(row.status, row.payment_status)
  );

  const statuses = [...new Set(open.map((row) => row.status || "unknown"))];
  return { count: open.length, statuses };
}

export type ArchiveValidationResult =
  | {
      ok: true;
      patch: {
        status: typeof ARCHIVED_SPACE_STATUS;
        public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
        archived_at: string;
        archived_by: string;
        archive_restore_status: string | null;
        archive_restore_public_listing_mode: string | null;
      };
    }
  | { ok: false; error: string; openBookingCount?: number; openBookingStatuses?: string[] };

export async function validateAdminArchiveSpace(
  admin: SupabaseClient,
  spaceId: string,
  actorUserId: string
): Promise<ArchiveValidationResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, status, public_listing_mode")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Space not found." };
  }

  const row = space as {
    status: string | null;
    public_listing_mode: string | null;
  };

  if (isArchivedSpace(row.status)) {
    return { ok: false, error: "This space is already archived." };
  }

  const { count, statuses } = await countOpenBookingsForSpace(admin, spaceId);
  if (count > 0) {
    return {
      ok: false,
      error: `Cannot archive: ${count} open booking${count === 1 ? "" : "s"} still in progress.`,
      openBookingCount: count,
      openBookingStatuses: statuses,
    };
  }

  return {
    ok: true,
    patch: {
      status: ARCHIVED_SPACE_STATUS,
      public_listing_mode: PUBLIC_LISTING_MODE_OFF,
      archived_at: new Date().toISOString(),
      archived_by: actorUserId,
      archive_restore_status: row.status,
      archive_restore_public_listing_mode: row.public_listing_mode,
    },
  };
}

export type RestoreValidationResult =
  | {
      ok: true;
      patch: {
        status: "draft";
        public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
        archived_at: null;
        archived_by: null;
      };
    }
  | { ok: false; error: string };

export async function validateAdminRestoreSpace(
  admin: SupabaseClient,
  spaceId: string
): Promise<RestoreValidationResult> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, status")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Space not found." };
  }

  if (!isArchivedSpace((space as { status: string | null }).status)) {
    return { ok: false, error: "Only archived spaces can be restored." };
  }

  return {
    ok: true,
    patch: {
      status: "draft",
      public_listing_mode: PUBLIC_LISTING_MODE_OFF,
      archived_at: null,
      archived_by: null,
    },
  };
}
