import { ADMIN_UNCLAIMED_STATUSES } from "@/lib/admin-unclaimed-space";

export const UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR =
  "This listing has related activity and cannot be deleted from this screen.";

export function canDeleteUnclaimedListingByRecord(row: {
  created_by_admin: boolean | null;
  status: string | null;
  owner_id: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!row.created_by_admin) {
    return { ok: false, error: "Only admin-created listings can be deleted here." };
  }

  const status = row.status || "";
  if (!(ADMIN_UNCLAIMED_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      error: "Only draft or unclaimed listings can be deleted from this screen.",
    };
  }

  if (row.owner_id) {
    return { ok: false, error: UNCLAIMED_DELETE_BLOCKED_ACTIVITY_ERROR };
  }

  return { ok: true };
}
