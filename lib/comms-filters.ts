import {
  ACTION_REQUIRED_NOTIFICATION_TYPES,
  isNotificationUnread,
  type NotificationLifecycleRow,
} from "@/lib/notification-state";

export type CommsStatusFilter =
  | "all"
  | "unread"
  | "action_required"
  | "read"
  | "archived";

export type CommsFilterableCard = {
  unread: boolean;
  archived?: boolean;
  kind: string;
  status: string;
  notificationType?: string;
  questionStatus?: "pending" | "answered" | "dismissed";
  unreadCount?: number;
};

export function cardMatchesCommsStatusFilter(
  card: CommsFilterableCard,
  filter: CommsStatusFilter
): boolean {
  const isArchived = card.archived === true;

  if (filter === "archived") {
    return isArchived;
  }

  if (isArchived) {
    return false;
  }

  if (filter === "unread") {
    return card.unread;
  }

  if (filter === "read") {
    return !card.unread;
  }

  if (filter === "action_required") {
    if (card.kind === "owner_question" && card.questionStatus === "pending") {
      return true;
    }
    if (card.kind === "booking_thread" && (card.unreadCount ?? 0) > 0) {
      return true;
    }
    if (card.kind === "notification") {
      const type = card.notificationType || "";
      if (
        ACTION_REQUIRED_NOTIFICATION_TYPES.has(type) &&
        card.unread
      ) {
        return true;
      }
      if (card.status === "action_required" && card.unread) {
        return true;
      }
    }
    return false;
  }

  // "all" — non-archived only
  return true;
}

export function notificationRowToUnread(row: NotificationLifecycleRow): boolean {
  return isNotificationUnread(row);
}
