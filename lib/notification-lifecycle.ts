/**
 * Server-side helpers to mark in-app notifications read when linked entities resolve.
 * Call with a Supabase client that has permission to update `public.notifications` (service role).
 */

import { markNotificationReadPayload } from "@/lib/notification-state";

const UNREAD_FILTER = { read_at: null, archived_at: null };

export async function markNotificationsReadByBooking(
  supabaseAdmin: any,
  input: {
    bookingId: string;
    types: string[];
    userIds?: string[];
  }
) {
  const { bookingId, types, userIds } = input;
  if (!bookingId || !types.length) return;

  let q = supabaseAdmin
    .from("notifications")
    .update(markNotificationReadPayload())
    .eq("related_entity_type", "booking")
    .eq("related_entity_id", bookingId)
    .in("type", types)
    .is("read_at", null);

  if (userIds?.length) {
    q = q.in("user_id", userIds);
  }

  const { error } = await q;
  if (error) {
    console.error("markNotificationsReadByBooking failed:", error);
  }
}

export async function markMessageNotificationsReadForBooking(
  supabaseAdmin: any,
  input: { userId: string; bookingId: string }
) {
  const { userId, bookingId } = input;
  if (!userId || !bookingId) return;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update(markNotificationReadPayload())
    .eq("user_id", userId)
    .eq("related_entity_type", "booking")
    .eq("related_entity_id", bookingId)
    .eq("type", "booking_message")
    .is("read_at", null);

  if (error) {
    console.error("markMessageNotificationsReadForBooking failed:", error);
  }
}

export async function markNotificationsReadByProfile(
  supabaseAdmin: any,
  input: {
    profileId: string;
    types: string[];
  }
) {
  const { profileId, types } = input;
  if (!profileId || !types.length) return;

  const { error } = await supabaseAdmin
    .from("notifications")
    .update(markNotificationReadPayload())
    .eq("related_entity_type", "profile")
    .eq("related_entity_id", profileId)
    .in("type", types)
    .is("read_at", null);

  if (error) {
    console.error("markNotificationsReadByProfile failed:", error);
  }
}

export { UNREAD_FILTER as NOTIFICATION_UNREAD_DB_FILTER };
