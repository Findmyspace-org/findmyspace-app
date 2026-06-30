import {
  ACTION_REQUIRED_NOTIFICATION_TYPES,
  isNotificationUnread,
  type NotificationLifecycleRow,
} from "@/lib/notification-state";
import {
  isListingClaimInterestWorkflowOpen,
  isListingEnquiryRequesterWorkflowOpen,
  isListingEnquiryWorkflowOpen,
} from "@/lib/listing-lifecycle";
import { LISTING_REVIEW_ACTION_STATUSES } from "@/lib/admin-inbox-counts";

export type CommsWorkflowMaps = {
  enquiryById: Map<string, string>;
  claimInterestById: Map<string, string>;
  spaceStatusById: Map<string, string>;
  verificationActionByProfileId: Map<string, boolean>;
};

export type CommsActionCheckCard = {
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

export function notificationHasPendingAdminAction(
  card: CommsActionCheckCard,
  maps: CommsWorkflowMaps
): boolean {
  if (card.archived) return false;
  if (card.kind !== "notification" || !card.notificationType) return false;

  const type = card.notificationType;

  if (type === "listing_enquiry") {
    return isListingEnquiryWorkflowOpen(card.workflowStatus);
  }

  if (type === "listing_claim_interest") {
    return isListingClaimInterestWorkflowOpen(card.workflowStatus);
  }

  if (type === "listing_enquiry_received") {
    return isListingEnquiryRequesterWorkflowOpen(card.workflowStatus);
  }

  if (type === "identity_submitted" || type === "bank_submitted") {
    if (card.relatedEntityType === "profile" && card.relatedEntityId) {
      return maps.verificationActionByProfileId.get(card.relatedEntityId) === true;
    }
    return card.unread;
  }

  if (type === "listing_submitted" || type === "listing_pending") {
    if (card.relatedEntityType === "space" && card.relatedEntityId) {
      const status = maps.spaceStatusById.get(card.relatedEntityId);
      if (status) {
        return (LISTING_REVIEW_ACTION_STATUSES as readonly string[]).includes(
          status
        );
      }
    }
    return ACTION_REQUIRED_NOTIFICATION_TYPES.has(type);
  }

  if (type === "booking_request") {
    return card.workflowStatus === "pending_owner" || card.unread;
  }

  if (ACTION_REQUIRED_NOTIFICATION_TYPES.has(type)) {
    return true;
  }

  return false;
}

export function cardHasPendingAdminAction(
  card: CommsActionCheckCard,
  maps: CommsWorkflowMaps
): boolean {
  if (card.archived) return false;

  if (card.kind === "owner_question" && card.questionStatus === "pending") {
    return true;
  }

  if (card.kind === "booking_thread" && (card.unreadCount ?? 0) > 0) {
    return true;
  }

  if (card.kind === "notification") {
    return notificationHasPendingAdminAction(card, maps);
  }

  return card.status === "action_required";
}

export function cardMatchesAdminActionRequiredFilter(
  card: CommsActionCheckCard,
  maps: CommsWorkflowMaps
): boolean {
  return cardHasPendingAdminAction(card, maps);
}

export function notificationRowToUnread(row: NotificationLifecycleRow): boolean {
  return isNotificationUnread(row);
}
