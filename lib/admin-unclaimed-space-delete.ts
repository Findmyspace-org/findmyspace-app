import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canDeleteUnclaimedListingByRecord,
  UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR,
} from "@/lib/admin-unclaimed-space-delete-guards";
import { deleteAllAiKnowledgeForSpace } from "@/lib/space-ai-knowledge-server";
import { formatAiKnowledgeError } from "@/lib/space-ai-knowledge-errors";
import { isAiKnowledgeStorageBucketMissingError } from "@/lib/space-ai-knowledge-setup";

export type UnclaimedDeleteValidation =
  | { ok: true; spaceId: string; title: string }
  | { ok: false; error: string };

const LOG_PREFIX = "[admin-unclaimed-delete]";

type ActivityTable =
  | "bookings"
  | "listing_enquiries"
  | "listing_claim_interests"
  | "listing_ownership_documents";

const BLOCKED_ACTIVITY_TABLES: {
  table: ActivityTable;
  column: string;
  optional?: boolean;
}[] = [
  { table: "bookings", column: "space_id" },
  { table: "listing_enquiries", column: "listing_id" },
  { table: "listing_claim_interests", column: "listing_id" },
  { table: "listing_ownership_documents", column: "space_id", optional: true },
];

export function isOptionalAdminTableUnavailable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    lower.includes("schema cache") ||
    lower.includes("relation") && lower.includes("does not exist")
  );
}

export function isStorageObjectMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("object not found") ||
    lower.includes("not found") ||
    lower.includes("no such file") ||
    lower.includes("does not exist")
  );
}

export function mapUnclaimedDeleteErrorStatus(error: string): number {
  if (/not found/i.test(error)) return 404;
  if (/permission denied|migration 046|migration 047/i.test(error)) return 500;
  return 400;
}

export function publicUnclaimedDeleteErrorMessage(error: string): string {
  if (/permission denied/i.test(error)) {
    return "Delete failed because the database permission migration has not been applied. Apply migration 046 or 047 and retry.";
  }
  return error;
}

async function tableHasRowsForSpace(
  admin: SupabaseClient,
  table: ActivityTable,
  column: string,
  spaceId: string,
  optional = false
): Promise<{ hasRows: boolean; error: string | null }> {
  const { data, error } = await admin
    .from(table)
    .select("id")
    .eq(column, spaceId)
    .limit(1);

  if (error) {
    if (optional && isOptionalAdminTableUnavailable(error.message)) {
      console.warn(
        `${LOG_PREFIX} optional table check skipped (${table}):`,
        error.message
      );
      return { hasRows: false, error: null };
    }

    if (error.message.includes("permission denied")) {
      return {
        hasRows: false,
        error: `Cannot verify related activity (${table}): permission denied for service_role.`,
      };
    }

    return {
      hasRows: false,
      error: `Could not check related activity (${table}): ${error.message}`,
    };
  }

  return { hasRows: (data?.length ?? 0) > 0, error: null };
}

export async function validateAdminUnclaimedSpaceDelete(
  admin: SupabaseClient,
  spaceId: string
): Promise<UnclaimedDeleteValidation> {
  const { data: space, error } = await admin
    .from("spaces")
    .select("id, title, status, owner_id, created_by_admin")
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) {
    return { ok: false, error: error?.message || "Listing not found." };
  }

  const row = space as {
    id: string;
    title: string | null;
    status: string | null;
    owner_id: string | null;
    created_by_admin: boolean | null;
  };

  const recordCheck = canDeleteUnclaimedListingByRecord(row);
  if (!recordCheck.ok) {
    return recordCheck;
  }

  for (const { table, column, optional } of BLOCKED_ACTIVITY_TABLES) {
    const check = await tableHasRowsForSpace(admin, table, column, spaceId, optional);
    if (check.error) {
      return { ok: false, error: check.error };
    }
    if (check.hasRows) {
      return { ok: false, error: UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR };
    }
  }

  return {
    ok: true,
    spaceId: row.id,
    title: row.title?.trim() || "Untitled listing",
  };
}

async function removeStorageObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<string | null> {
  if (paths.length === 0) return null;

  const { error: storageErr } = await admin.storage.from(bucket).remove(paths);
  if (!storageErr) return null;

  if (isStorageObjectMissingError(storageErr.message)) {
    console.warn(`${LOG_PREFIX} storage objects already missing (${bucket}):`, storageErr.message, {
      paths,
    });
    return null;
  }

  if (isAiKnowledgeStorageBucketMissingError(storageErr.message)) {
    console.warn(`${LOG_PREFIX} storage bucket missing (${bucket}):`, storageErr.message);
    return null;
  }

  console.error(`${LOG_PREFIX} storage delete failed (${bucket}):`, storageErr.message, {
    paths,
  });
  return storageErr.message;
}

async function deleteAllSpaceImages(
  admin: SupabaseClient,
  spaceId: string
): Promise<string | null> {
  const { data: images, error } = await admin
    .from("space_images")
    .select("id, file_path")
    .eq("space_id", spaceId);

  if (error) {
    return error.message;
  }

  const paths = ((images as { file_path: string | null }[]) || [])
    .map((row) => row.file_path)
    .filter((path): path is string => Boolean(path));

  const storageErr = await removeStorageObjects(admin, "space-images", paths);
  if (storageErr) {
    return storageErr;
  }

  const { error: delErr } = await admin.from("space_images").delete().eq("space_id", spaceId);
  return delErr?.message ?? null;
}

function spacesDeletePermissionHint(message: string): string {
  if (!message.includes("permission denied")) return "";
  return " Apply migration 046 or 047 (spaces service_role DELETE grant) and retry.";
}

function foreignKeyDeleteHint(message: string): string {
  if (!/foreign key|violates.*constraint|still referenced/i.test(message)) return "";
  return " This listing has related records that must be removed first.";
}

export async function deleteAdminUnclaimedSpace(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const validation = await validateAdminUnclaimedSpaceDelete(admin, spaceId);
    if (!validation.ok) {
      return validation;
    }

    const imageErr = await deleteAllSpaceImages(admin, spaceId);
    if (imageErr) {
      return { ok: false, error: `Could not remove listing photos: ${imageErr}` };
    }

    try {
      await deleteAllAiKnowledgeForSpace(admin, spaceId);
    } catch (err) {
      const message = formatAiKnowledgeError(err);
      const nonFatal =
        isOptionalAdminTableUnavailable(message) ||
        isStorageObjectMissingError(message) ||
        isAiKnowledgeStorageBucketMissingError(message);
      if (!nonFatal) {
        return { ok: false, error: `Could not remove AI documents: ${message}` };
      }
      console.warn(`${LOG_PREFIX} AI knowledge cleanup skipped:`, message);
    }

    const { error: attrErr } = await admin
      .from("space_attributes")
      .delete()
      .eq("space_id", spaceId);
    if (attrErr) {
      return { ok: false, error: `Could not remove listing attributes: ${attrErr.message}` };
    }

    const { error: spaceErr } = await admin.from("spaces").delete().eq("id", spaceId);
    if (spaceErr) {
      const hint = spacesDeletePermissionHint(spaceErr.message) + foreignKeyDeleteHint(spaceErr.message);
      return {
        ok: false,
        error: `Could not delete listing: ${spaceErr.message}${hint}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} unexpected delete failure for ${spaceId}:`, message, err);
    return { ok: false, error: `Delete failed unexpectedly: ${message}` };
  }
}
