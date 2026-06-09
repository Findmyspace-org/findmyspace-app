import { HEADER_DROPDOWN_NOTIFICATION_TYPES } from "@/lib/header-notification-types";
import { supabase } from "@/lib/supabase";

/** Unread, non-archived notifications visible in Comms / header dropdown. */
export async function fetchAdminCommsUnreadCount(
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", [...HEADER_DROPDOWN_NOTIFICATION_TYPES])
    .is("read_at", null)
    .is("archived_at", null);

  if (error) return 0;
  return count ?? 0;
}
