import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyAdminArchiveSpace,
  assertArchiveSchemaReady,
  countOpenBookingsForSpace,
  isArchivedSpace,
  isOpenBookingStatusForArchive,
  validateAdminArchiveSpace,
  type ArchivePatch,
} from "@/lib/space-archive";

export function isArchivedProperty(
  property: { archived_at?: string | null } | null | undefined
): boolean {
  return Boolean(property?.archived_at);
}

export function mapPropertyArchiveMigrationError(message: string): string {
  if (
    /column .* does not exist|could not find the .* column|schema cache/i.test(
      message
    )
  ) {
    return `Database migration required. Apply migration 049 (property_archive) with supabase db push, then retry. Details: ${message}`;
  }
  return message;
}

export async function assertPropertyArchiveSchemaReady(
  admin: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const spaceSchema = await assertArchiveSchemaReady(admin);
  if (!spaceSchema.ok) {
    return spaceSchema;
  }

  const { error } = await admin
    .from("properties")
    .select("id, archived_at, archived_by")
    .limit(1);

  if (error) {
    return { ok: false, error: mapPropertyArchiveMigrationError(error.message) };
  }

  return { ok: true };
}

export type PropertyArchivePreview = {
  property_id: string;
  property_name: string;
  space_count: number;
  archivable_space_count: number;
  already_archived_space_count: number;
  open_booking_count: number;
  open_booking_statuses: string[];
  can_archive: boolean;
  block_reason: string | null;
};

export async function getPropertyArchivePreview(
  admin: SupabaseClient,
  propertyId: string
): Promise<
  | { ok: true; preview: PropertyArchivePreview }
  | { ok: false; error: string; status?: number }
> {
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("id, name, archived_at")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    return {
      ok: false,
      error: mapPropertyArchiveMigrationError(propertyError.message),
    };
  }

  if (!property) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  const row = property as {
    id: string;
    name: string;
    archived_at: string | null;
  };

  if (isArchivedProperty(row)) {
    return { ok: false, error: "This property is already archived.", status: 400 };
  }

  const { data: spaces, error: spacesError } = await admin
    .from("spaces")
    .select("id, status")
    .eq("property_id", propertyId);

  if (spacesError) {
    return { ok: false, error: spacesError.message };
  }

  const spaceRows = (spaces as { id: string; status: string | null }[]) || [];
  const activeSpaces = spaceRows.filter((space) => !isArchivedSpace(space.status));
  const alreadyArchived = spaceRows.length - activeSpaces.length;

  let openBookingCount = 0;
  const openStatuses = new Set<string>();

  for (const space of activeSpaces) {
    try {
      const { count, statuses } = await countOpenBookingsForSpace(admin, space.id);
      openBookingCount += count;
      statuses.forEach((status) => openStatuses.add(status));
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not check bookings.",
      };
    }
  }

  const blockReason =
    openBookingCount > 0
      ? "This property has active or upcoming bookings. Resolve or cancel them before archiving."
      : null;

  return {
    ok: true,
    preview: {
      property_id: row.id,
      property_name: row.name,
      space_count: spaceRows.length,
      archivable_space_count: activeSpaces.length,
      already_archived_space_count: alreadyArchived,
      open_booking_count: openBookingCount,
      open_booking_statuses: [...openStatuses],
      can_archive: openBookingCount === 0,
      block_reason: blockReason,
    },
  };
}

export type PropertyArchiveApplyResult =
  | {
      ok: true;
      property_id: string;
      property_name: string;
      spaces_archived: number;
      spaces_already_archived: number;
      archived_space_ids: string[];
    }
  | {
      ok: false;
      error: string;
      openBookingCount?: number;
      openBookingStatuses?: string[];
      migrationRequired?: boolean;
    };

export async function applyAdminArchiveProperty(
  admin: SupabaseClient,
  propertyId: string,
  actorUserId: string
): Promise<PropertyArchiveApplyResult> {
  const previewResult = await getPropertyArchivePreview(admin, propertyId);
  if (!previewResult.ok) {
    return {
      ok: false,
      error: previewResult.error,
      openBookingCount: undefined,
    };
  }

  const preview = previewResult.preview;
  if (!preview.can_archive) {
    return {
      ok: false,
      error:
        preview.block_reason ||
        "This property cannot be archived while bookings are in progress.",
      openBookingCount: preview.open_booking_count,
      openBookingStatuses: preview.open_booking_statuses,
    };
  }

  const { data: spaces, error: spacesError } = await admin
    .from("spaces")
    .select("id, status")
    .eq("property_id", propertyId);

  if (spacesError) {
    return { ok: false, error: spacesError.message };
  }

  const spaceRows = (spaces as { id: string; status: string | null }[]) || [];
  const archivedSpaceIds: string[] = [];
  let spacesArchived = 0;
  let spacesAlreadyArchived = 0;

  for (const space of spaceRows) {
    if (isArchivedSpace(space.status)) {
      spacesAlreadyArchived += 1;
      continue;
    }

    const validation = await validateAdminArchiveSpace(admin, space.id, actorUserId);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        openBookingCount: validation.openBookingCount,
        openBookingStatuses: validation.openBookingStatuses,
      };
    }

    const applied = await applyAdminArchiveSpace(
      admin,
      space.id,
      validation.patch as ArchivePatch
    );
    if (!applied.ok) {
      return {
        ok: false,
        error: applied.error,
        migrationRequired: applied.migrationRequired,
      };
    }

    await admin.from("spaces").update({ is_bookable: false }).eq("id", space.id);

    archivedSpaceIds.push(space.id);
    spacesArchived += 1;
  }

  const archivedAt = new Date().toISOString();
  const { data: updatedProperty, error: propertyUpdateError } = await admin
    .from("properties")
    .update({
      archived_at: archivedAt,
      archived_by: actorUserId,
    })
    .eq("id", propertyId)
    .is("archived_at", null)
    .select("id, name, archived_at")
    .maybeSingle();

  if (propertyUpdateError) {
    return {
      ok: false,
      error: mapPropertyArchiveMigrationError(propertyUpdateError.message),
      migrationRequired: propertyUpdateError.message.includes("archived_at"),
    };
  }

  if (!updatedProperty) {
    return { ok: false, error: "Property could not be archived." };
  }

  const propertyRow = updatedProperty as { id: string; name: string };

  return {
    ok: true,
    property_id: propertyRow.id,
    property_name: propertyRow.name,
    spaces_archived: spacesArchived,
    spaces_already_archived: spacesAlreadyArchived,
    archived_space_ids: archivedSpaceIds,
  };
}

/** Aggregate open bookings for property-linked spaces (used in tests). */
export async function countOpenBookingsForProperty(
  admin: SupabaseClient,
  propertyId: string
): Promise<{ count: number; statuses: string[] }> {
  const { data: spaces, error } = await admin
    .from("spaces")
    .select("id")
    .eq("property_id", propertyId);

  if (error) {
    throw new Error(error.message);
  }

  const spaceIds = ((spaces as { id: string }[]) || []).map((row) => row.id);
  if (spaceIds.length === 0) {
    return { count: 0, statuses: [] };
  }

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id, status, payment_status")
    .in("space_id", spaceIds);

  if (bookingsError) {
    throw new Error(bookingsError.message);
  }

  const open = (
    (bookings as { status: string | null; payment_status: string | null }[]) || []
  ).filter((row) => isOpenBookingStatusForArchive(row.status, row.payment_status));

  const statuses = [...new Set(open.map((row) => row.status || "unknown"))];
  return { count: open.length, statuses };
}
