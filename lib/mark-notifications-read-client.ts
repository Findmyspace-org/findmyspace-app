import { supabase } from "@/lib/supabase";
import { broadcastInboxRefresh } from "@/lib/inbox-refresh";

type MarkReadByRelatedInput = {
  relatedEntityType: string;
  relatedEntityId: string;
  types: string[];
};

type MarkReadByTypesInput = {
  types: string[];
};

/** Mark one notification read (fire-and-forget). */
export async function markNotificationReadClient(
  notificationId: string
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch("/api/notifications/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ notificationId }),
  });
  broadcastInboxRefresh();
}

/** Bulk mark by related entity (booking, profile, listing_enquiry, …). */
export async function markNotificationsReadByRelatedClient(
  input: MarkReadByRelatedInput
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch("/api/notifications/read-by-related", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  broadcastInboxRefresh();
}

/** Mark all unread notifications of given types for the current user. */
export async function markNotificationsReadByTypesClient(
  input: MarkReadByTypesInput
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !input.types.length) return;

  await fetch("/api/notifications/read-by-types", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  broadcastInboxRefresh();
}

/** Archive a notification (hides from default Comms / list views). */
export async function archiveNotificationClient(
  notificationId: string
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch("/api/notifications/archive", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ notificationId }),
  });
  broadcastInboxRefresh();
}
