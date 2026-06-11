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

export function mapArchiveMigrationError(message: string): string {
  if (
    /column .* does not exist|could not find the .* column|schema cache/i.test(
      message
    )
  ) {
    return `Database migration required. Apply migrations 030 (public_listing_mode) and 031 (space_archive) with supabase db push, then retry. Details: ${message}`;
  }
  return message;
}

export function isMigrationRequiredError(message: string): boolean {
  return message.includes("Database migration required");
}

export async function assertArchiveSchemaReady(
  admin: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("spaces")
    .select(
      "id, status, public_listing_mode, archived_at, archived_by, archive_restore_status, archive_restore_public_listing_mode"
    )
    .limit(1);

  if (error) {
    return { ok: false, error: mapArchiveMigrationError(error.message) };
  }

  return { ok: true };
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

export type ArchivePatch = {
  status: typeof ARCHIVED_SPACE_STATUS;
  public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
  archived_at: string;
  archived_by: string;
  archive_restore_status: string | null;
  archive_restore_public_listing_mode: string | null;
};

export type ArchiveValidationResult =
  | { ok: true; patch: ArchivePatch }
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

  if (error) {
    return { ok: false, error: mapArchiveMigrationError(error.message) };
  }

  if (!space) {
    return { ok: false, error: "Space not found." };
  }

  const row = space as {
    status: string | null;
    public_listing_mode: string | null;
  };

  if (isArchivedSpace(row.status)) {
    return { ok: false, error: "This space is already archived." };
  }

  try {
    const { count, statuses } = await countOpenBookingsForSpace(admin, spaceId);
    if (count > 0) {
      return {
        ok: false,
        error: `Cannot archive: ${count} open booking${count === 1 ? "" : "s"} still in progress.`,
        openBookingCount: count,
        openBookingStatuses: statuses,
      };
    }
  } catch (bookingErr) {
    const message =
      bookingErr instanceof Error ? bookingErr.message : "Could not check bookings.";
    return { ok: false, error: message };
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

export type ArchiveApplyResult =
  | {
      ok: true;
      spaceId: string;
      status: typeof ARCHIVED_SPACE_STATUS;
      public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
    }
  | { ok: false; error: string; migrationRequired?: boolean };

export async function applyAdminArchiveSpace(
  admin: SupabaseClient,
  spaceId: string,
  patch: ArchivePatch
): Promise<ArchiveApplyResult> {
  const { data: updated, error: updateErr } = await admin
    .from("spaces")
    .update(patch)
    .eq("id", spaceId)
    .select("id, status, public_listing_mode")
    .maybeSingle();

  if (updateErr) {
    const mapped = mapArchiveMigrationError(updateErr.message);
    return {
      ok: false,
      error: mapped,
      migrationRequired: isMigrationRequiredError(mapped),
    };
  }

  if (!updated) {
    return {
      ok: false,
      error:
        "Archive update did not apply. The space was not found or the update was blocked.",
    };
  }

  const row = updated as {
    id: string;
    status: string | null;
    public_listing_mode: string | null;
  };

  if (
    row.status !== ARCHIVED_SPACE_STATUS ||
    row.public_listing_mode !== PUBLIC_LISTING_MODE_OFF
  ) {
    return {
      ok: false,
      error: `Archive incomplete after update (status=${row.status ?? "null"}, public_listing_mode=${row.public_listing_mode ?? "null"}). Check database triggers and migrations.`,
    };
  }

  return {
    ok: true,
    spaceId: row.id,
    status: ARCHIVED_SPACE_STATUS,
    public_listing_mode: PUBLIC_LISTING_MODE_OFF,
  };
}

export type RestorePatch = {
  status: "draft";
  public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
  archived_at: null;
  archived_by: null;
};

export type RestoreValidationResult =
  | { ok: true; patch: RestorePatch }
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

  if (error) {
    return { ok: false, error: mapArchiveMigrationError(error.message) };
  }

  if (!space) {
    return { ok: false, error: "Space not found." };
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

export type RestoreApplyResult =
  | {
      ok: true;
      spaceId: string;
      status: "draft";
      public_listing_mode: typeof PUBLIC_LISTING_MODE_OFF;
    }
  | { ok: false; error: string; migrationRequired?: boolean };

export async function applyAdminRestoreSpace(
  admin: SupabaseClient,
  spaceId: string,
  patch: RestorePatch
): Promise<RestoreApplyResult> {
  const { data: updated, error: updateErr } = await admin
    .from("spaces")
    .update(patch)
    .eq("id", spaceId)
    .select("id, status, public_listing_mode")
    .maybeSingle();

  if (updateErr) {
    const mapped = mapArchiveMigrationError(updateErr.message);
    return {
      ok: false,
      error: mapped,
      migrationRequired: isMigrationRequiredError(mapped),
    };
  }

  if (!updated) {
    return {
      ok: false,
      error: "Restore update did not apply. The space was not found.",
    };
  }

  const row = updated as {
    id: string;
    status: string | null;
    public_listing_mode: string | null;
  };

  return {
    ok: true,
    spaceId: row.id,
    status: "draft",
    public_listing_mode: PUBLIC_LISTING_MODE_OFF,
  };
}
