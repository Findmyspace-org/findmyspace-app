import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canDeleteUnclaimedListingByRecord,
  UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR,
} from "@/lib/admin-unclaimed-space-delete-guards";
import { deleteAllAiKnowledgeForSpace } from "@/lib/space-ai-knowledge-server";
import { formatAiKnowledgeError } from "@/lib/space-ai-knowledge-errors";

export type UnclaimedDeleteValidation =
  | { ok: true; spaceId: string; title: string }
  | { ok: false; error: string };

async function tableHasRowsForSpace(
  admin: SupabaseClient,
  table:
    | "bookings"
    | "listing_enquiries"
    | "listing_claim_interests"
    | "listing_ownership_documents",
  spaceId: string
): Promise<boolean> {
  const column =
    table === "bookings" || table === "listing_ownership_documents"
      ? "space_id"
      : "listing_id";

  const { data, error } = await admin.from(table).select("id").eq(column, spaceId).limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.length ?? 0) > 0;
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

  const activityChecks = await Promise.all([
    tableHasRowsForSpace(admin, "bookings", spaceId),
    tableHasRowsForSpace(admin, "listing_enquiries", spaceId),
    tableHasRowsForSpace(admin, "listing_claim_interests", spaceId),
    tableHasRowsForSpace(admin, "listing_ownership_documents", spaceId),
  ]);

  if (activityChecks.some(Boolean)) {
    return { ok: false, error: UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR };
  }

  return {
    ok: true,
    spaceId: row.id,
    title: row.title?.trim() || "Untitled listing",
  };
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

  if (paths.length > 0) {
    const { error: storageErr } = await admin.storage.from("space-images").remove(paths);
    if (storageErr) {
      return storageErr.message;
    }
  }

  const { error: delErr } = await admin.from("space_images").delete().eq("space_id", spaceId);
  return delErr?.message ?? null;
}

export async function deleteAdminUnclaimedSpace(
  admin: SupabaseClient,
  spaceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    if (!/does not exist|schema cache/i.test(message)) {
      return { ok: false, error: `Could not remove AI documents: ${message}` };
    }
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
    const hint = spaceErr.message.includes("permission denied")
      ? " Apply migration 046 (spaces service_role DELETE grant) and retry."
      : "";
    return {
      ok: false,
      error: `Could not delete listing: ${spaceErr.message}${hint}`,
    };
  }

  return { ok: true };
}
