import {
  ACTION_REQUIRED_NOTIFICATION_TYPES,
  isNotificationUnread,
  type NotificationLifecycleRow,
} from "@/lib/notification-state";
import {
  COMMS_COMPLETED_NOTIFICATION_TYPES,
  deriveCommsWorkflowState,
} from "@/lib/workflow-state";
import {
  isListingClaimInterestWorkflowOpen,
  isListingEnquiryRequesterWorkflowOpen,
  isListingEnquiryWorkflowOpen,
} from "@/lib/listing-lifecycle";
import type { CommsWorkflowMaps } from "@/lib/admin-comms-action";
import { cardMatchesAdminActionRequiredFilter } from "@/lib/admin-comms-action";

export type CommsStatusFilter =
  | "all"
  | "unread"
  | "action_required"
  | "completed"
  | "read"
  | "archived";

export type CommsFilterableCard = {
  unread: boolean;
  archived?: boolean;
  kind: string;
  status: string;
  notificationType?: string;
  workflowStatus?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  questionStatus?: "pending" | "answered" | "dismissed";
  unreadCount?: number;
};

export function cardMatchesCommsStatusFilter(
  card: CommsFilterableCard,
  filter: CommsStatusFilter,
  options?: { adminContext?: boolean; workflowMaps?: CommsWorkflowMaps }
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

  if (filter === "completed") {
    if (card.kind === "notification" && card.notificationType) {
      const workflow = deriveCommsWorkflowState({
        unread: card.unread,
        archived: isArchived,
        notificationType: card.notificationType,
      });
      return workflow === "completed" && !card.unread;
    }
    if (
      card.kind === "owner_question" &&
      card.questionStatus === "answered"
    ) {
      return true;
    }
    return card.status === "completed" || card.status === "approved";
  }

  if (filter === "action_required") {
    if (options?.adminContext && options.workflowMaps) {
      return cardMatchesAdminActionRequiredFilter(card, options.workflowMaps);
    }

    if (card.kind === "owner_question" && card.questionStatus === "pending") {
      return true;
    }
    if (card.kind === "booking_thread" && (card.unreadCount ?? 0) > 0) {
      return true;
    }
    if (card.kind === "notification") {
      const type = card.notificationType || "";
      if (type === "listing_enquiry" || type === "listing_claim_interest") {
        const openWorkflow =
          type === "listing_enquiry"
            ? isListingEnquiryWorkflowOpen(card.workflowStatus)
            : isListingClaimInterestWorkflowOpen(card.workflowStatus);
        return openWorkflow;
      }
      if (type === "listing_enquiry_received") {
        return isListingEnquiryRequesterWorkflowOpen(card.workflowStatus);
      }
      if (ACTION_REQUIRED_NOTIFICATION_TYPES.has(type) && card.unread) {
        const workflow = deriveCommsWorkflowState({
          unread: card.unread,
          archived: isArchived,
          notificationType: type,
        });
        if (workflow === "action_required") return true;
      }
      if (
        (type === "identity_submitted" || type === "bank_submitted") &&
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
