"use client";

/**
 * /dashboard/comms — Comms Center.
 *
 * The single primary destination for all FindMySpace communication.
 *
 * Tabs:
 *   1. Platform              — FindMySpace ↔ user system notices.
 *   2. My space enquiries    — yes/no questions about MY listings (host side).
 *                              Owner can answer Yes / No / Not applicable /
 *                              Dismiss inline without leaving Comms.
 *   3. My bookings           — questions I asked about other people's spaces,
 *                              booking conversations, and booking status
 *                              updates. Renters can post a follow-up yes/no
 *                              question inline from an answered question card.
 *
 * Data sources (V1 — no new tables):
 *   - notifications (direct Supabase, RLS scoped to user)
 *   - /api/listing-questions?role=renter|owner (returns space_cover_url too)
 *   - /api/bookings/message-threads (returns spaceCoverUrl too)
 *
 * Old routes still work for deep links:
 *   - /dashboard/listing-questions
 *   - /dashboard/messages
 *   - /dashboard/notifications
 *
 * Focus deep link:
 *   - /dashboard/comms?focus={id}&type=listing_question
 *     Switches to the right tab and highlights the matching card.
 *
 * TODO: per-user read state for question/thread cards (V1 uses status +
 *   answered_at as a proxy).
 * TODO: pagination — V1 caps at 50 items per tab.
 */

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  HelpCircle,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV, RENTER_NAV } from "@/lib/dashboard-nav";
import {
  LISTING_QUESTION_BLOCKED_REPLY,
  LISTING_QUESTION_MAX_LENGTH,
  evaluateListingQuestionSafety,
} from "@/lib/listing-question-safety";
import {
  FOCUS_HIGHLIGHT_CLASS,
  useFocusHighlight,
} from "@/lib/use-focus-highlight";
import {
  isNotificationUnread,
  isApprovedNotificationType,
} from "@/lib/notification-state";
import {
  archiveNotificationClient,
  markNotificationReadClient,
} from "@/lib/mark-notifications-read-client";
import {
  cardMatchesCommsStatusFilter,
  type CommsStatusFilter,
} from "@/lib/comms-filters";
import { broadcastInboxRefresh } from "@/lib/inbox-refresh";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

type CommsTab = "platform" | "enquiries" | "bookings";

type NotificationRow = {
  id: string;
  user_id: string;
  role: string | null;
  type: string;
  title: string | null;
  message: string | null;
  href: string | null;
  is_read: boolean;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
};

type ListingQuestion = {
  id: string;
  space_id: string;
  booking_id: string | null;
  renter_id: string;
  owner_id: string;
  question: string;
  answer: "yes" | "no" | "not_applicable" | null;
  status: "pending" | "answered" | "dismissed";
  created_at: string;
  answered_at: string | null;
  space_title: string | null;
  space_cover_url: string | null;
  renter_first_name: string | null;
};

type MessageThread = {
  bookingId: string;
  spaceId: string;
  listingTitle: string;
  spaceCoverUrl: string | null;
  location: string | null;
  otherPartyName: string;
  viewerRole: "renter" | "owner";
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
  bookingUnit: string | null;
  startAt: string;
  endAt: string;
};

// ---------------------------------------------------------------------------
// Card models
// ---------------------------------------------------------------------------

type CardStatus =
  | "info"
  | "pending"
  | "answered_yes"
  | "answered_no"
  | "answered_na"
  | "approved"
  | "declined"
  | "action_required"
  | "completed"
  | "dismissed";

type FromLabel = "FindMySpace" | "Host" | "Renter" | "Admin";

type BaseCardChrome = {
  id: string; // unique key, used by focus highlight
  from: FromLabel;
  regarding: string;
  title: string;
  summary: string;
  timestamp: string;
  unread: boolean;
  status: CardStatus;
  spaceCoverUrl: string | null;
  iconType: CardIcon;
  /** Searchable text concatenation. */
  searchBlob: string;
};

type CardIcon =
  | "verification"
  | "listing"
  | "payment"
  | "booking"
  | "message"
  | "question"
  | "approved"
  | "declined";

type NotificationCard = BaseCardChrome & {
  kind: "notification";
  notificationId: string;
  notificationType: string;
  href: string;
  ctaLabel: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  archived: boolean;
};

type OwnerQuestionCard = BaseCardChrome & {
  kind: "owner_question";
  questionId: string;
  spaceId: string;
  spaceTitle: string;
  question: string;
  answer: "yes" | "no" | "not_applicable" | null;
  questionStatus: "pending" | "answered" | "dismissed";
  renterFirstName: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type RenterQuestionCard = BaseCardChrome & {
  kind: "renter_question";
  questionId: string;
  spaceId: string;
  spaceTitle: string;
  question: string;
  answer: "yes" | "no" | "not_applicable" | null;
  questionStatus: "pending" | "answered" | "dismissed";
  createdAt: string;
  answeredAt: string | null;
};

type BookingThreadCard = BaseCardChrome & {
  kind: "booking_thread";
  bookingId: string;
  spaceId: string;
  spaceTitle: string;
  otherPartyName: string;
  viewerRole: "renter" | "owner";
  unreadCount: number;
  href: string;
};

type CommsCard =
  | NotificationCard
  | OwnerQuestionCard
  | RenterQuestionCard
  | BookingThreadCard;

// ---------------------------------------------------------------------------
// Type → tab routing
// ---------------------------------------------------------------------------

const PLATFORM_NOTIF_TYPES = new Set<string>([
  "identity_submitted",
  "identity_verified",
  "identity_rejected",
  "bank_submitted",
  "bank_verified",
  "bank_rejected",
  "listing_submitted",
  "listing_pending",
  "listing_rejected",
  "listing_needs_changes",
  "listing_activated",
  "listing_claimed",
  "ownership_proof_verified",
  "payment_needed",
  "payment_received",
  "booking_paid",
  "listing_enquiry",
  "listing_enquiry_received",
  "listing_claim_interest",
]);

/** Booking-status notifications surface inside My bookings tab. */
const BOOKING_STATUS_NOTIF_TYPES = new Set<string>([
  "booking_request",
  "booking_confirmed",
  "booking_declined",
  "booking_expired",
  "listing_enquiry",
  "listing_enquiry_received",
  "listing_claim_interest",
]);

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function formatRelative(ts: string): string {
  const d = new Date(ts);
  const diff = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function formatExact(ts: string): string {
  return new Date(ts).toLocaleString();
}

const STATUS_LABEL: Record<CardStatus, string> = {
  info: "Info",
  pending: "Pending host response",
  answered_yes: "Answered: Yes",
  answered_no: "Answered: No",
  answered_na: "Not applicable",
  approved: "Approved",
  declined: "Declined",
  action_required: "Action required",
  completed: "Completed",
  dismissed: "Dismissed",
};

const STATUS_PILL: Record<CardStatus, string> = {
  info: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
  pending: "border-[#fde68a] bg-[#fef9c3] text-[#854d0e]",
  answered_yes: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  answered_no: "border-[#fecaca] bg-[#fef2f2] text-[#9f1239]",
  answered_na: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
  approved: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  declined: "border-[#fecaca] bg-[#fef2f2] text-[#9f1239]",
  action_required: "border-[#fecaca] bg-[#fff5f5] text-[#c1121f]",
  completed: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  dismissed: "border-[#e2e8f0] bg-[#f8fafb] text-[#94a3b8]",
};

const ANSWER_TO_STATUS: Record<"yes" | "no" | "not_applicable", CardStatus> = {
  yes: "answered_yes",
  no: "answered_no",
  not_applicable: "answered_na",
};

function CardIconDisplay({ type }: { type: CardIcon }) {
  switch (type) {
    case "verification":
      return (
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#0f2740]" aria-hidden />
      );
    case "listing":
      return (
        <Building2 className="h-4 w-4 shrink-0 text-[#0f2740]" aria-hidden />
      );
    case "payment":
      return (
        <CreditCard className="h-4 w-4 shrink-0 text-green-700" aria-hidden />
      );
    case "booking":
      return (
        <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
      );
    case "message":
      return (
        <MessageSquare
          className="h-4 w-4 shrink-0 text-blue-600"
          aria-hidden
        />
      );
    case "question":
      return (
        <HelpCircle className="h-4 w-4 shrink-0 text-[#c1121f]" aria-hidden />
      );
    case "approved":
      return (
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-green-600"
          aria-hidden
        />
      );
    case "declined":
      return (
        <XCircle className="h-4 w-4 shrink-0 text-[#c1121f]" aria-hidden />
      );
  }
}

// ---------------------------------------------------------------------------
// Notification → card mapper
// ---------------------------------------------------------------------------

function notificationToCard(n: NotificationRow): NotificationCard | null {
  const t = n.type;
  let from: FromLabel = "FindMySpace";
  let regarding = "Listing";
  let status: CardStatus = "info";
  let iconType: CardIcon = "listing";
  let ctaLabel = "Open";

  switch (t) {
    case "identity_submitted":
    case "bank_submitted":
      from = "FindMySpace";
      regarding = "Verification";
      status = "info";
      iconType = "verification";
      ctaLabel = "View verification";
      break;
    case "identity_verified":
    case "bank_verified":
      from = "FindMySpace";
      regarding = "Verification";
      status = "approved";
      iconType = "approved";
      ctaLabel = "View verification";
      break;
    case "identity_rejected":
    case "bank_rejected":
      from = "FindMySpace";
      regarding = "Verification";
      status = "action_required";
      iconType = "declined";
      ctaLabel = "Upload document";
      break;
    case "listing_submitted":
    case "listing_pending":
      from = "FindMySpace";
      regarding = "Listing";
      if (t === "listing_submitted" && n.role === "admin") {
        status = "action_required";
        ctaLabel = "Review listing";
      } else {
        status = t === "listing_submitted" ? "info" : "action_required";
        ctaLabel = "View listing";
      }
      iconType = "listing";
      break;
    case "listing_rejected":
      from = "FindMySpace";
      regarding = "Listing";
      status = "declined";
      iconType = "declined";
      ctaLabel = "View listing";
      break;
    case "listing_needs_changes":
      from = "FindMySpace";
      regarding = "Listing";
      status = "action_required";
      iconType = "listing";
      ctaLabel = "View listing";
      break;
    case "listing_claimed":
      from = "FindMySpace";
      regarding = "Listing";
      status = "info";
      iconType = "listing";
      ctaLabel = "View listing";
      break;
    case "listing_activated":
    case "ownership_proof_verified":
      from = "FindMySpace";
      regarding = "Listing";
      status = "approved";
      iconType = "approved";
      ctaLabel = "View listing";
      break;
    case "payment_needed":
      from = "FindMySpace";
      regarding = "Payment";
      status = "action_required";
      iconType = "payment";
      ctaLabel = "Complete payment";
      break;
    case "payment_received":
      from = "FindMySpace";
      regarding = "Payment";
      status = "completed";
      iconType = "payment";
      ctaLabel = "View booking";
      break;
    case "booking_paid":
      from = "Renter";
      regarding = "Payment";
      status = "completed";
      iconType = "payment";
      ctaLabel = "View request";
      break;
    case "booking_request":
      from = "Renter";
      regarding = "Booking";
      status = "action_required";
      iconType = "booking";
      ctaLabel = "View request";
      break;
    case "booking_confirmed":
      from = "FindMySpace";
      regarding = "Booking";
      status = "approved";
      iconType = "approved";
      ctaLabel = "View booking";
      break;
    case "booking_declined":
      from = "Host";
      regarding = "Booking";
      status = "declined";
      iconType = "declined";
      ctaLabel = "View booking";
      break;
    case "booking_expired":
      from = "FindMySpace";
      regarding = "Booking";
      status = "info";
      iconType = "booking";
      ctaLabel = "View booking";
      break;
    case "listing_enquiry":
    case "listing_enquiry_received":
      from = "FindMySpace";
      regarding = "Listing enquiry";
      status = "action_required";
      iconType = "booking";
      ctaLabel = "View enquiry";
      break;
    case "listing_claim_interest":
      from = "FindMySpace";
      regarding = "Claim request";
      status = "action_required";
      iconType = "listing";
      ctaLabel = "View claim";
      break;
    default:
      return null;
  }

  const title = n.title || "Notification";
  const summary = n.message || "";
  const unread = isNotificationUnread(n);
  if (isApprovedNotificationType(t) && !unread) {
    status = "approved";
    iconType = "approved";
  }
  return {
    kind: "notification",
    id: `notif-${n.id}`,
    notificationId: n.id,
    notificationType: t,
    from,
    regarding,
    status,
    title,
    summary,
    timestamp: n.created_at,
    unread,
    archived: Boolean(n.archived_at),
    href: n.href || "/dashboard",
    ctaLabel,
    iconType,
    spaceCoverUrl: null,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    searchBlob: `${title} ${summary} ${regarding} ${from}`.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Listing-question → card mappers
// ---------------------------------------------------------------------------

function ownerQuestionToCard(q: ListingQuestion): OwnerQuestionCard {
  const space = q.space_title || "this listing";
  const renterFirst = q.renter_first_name?.trim() || "A renter";
  const isPending = q.status === "pending";
  const isAnswered = q.status === "answered";
  const status: CardStatus =
    isAnswered && q.answer
      ? ANSWER_TO_STATUS[q.answer]
      : isPending
      ? "pending"
      : "dismissed";
  const ts = isAnswered && q.answered_at ? q.answered_at : q.created_at;

  return {
    kind: "owner_question",
    id: `q-${q.id}`,
    questionId: q.id,
    spaceId: q.space_id,
    spaceTitle: space,
    spaceCoverUrl: q.space_cover_url || null,
    renterFirstName: q.renter_first_name,
    question: q.question,
    answer: q.answer,
    questionStatus: q.status,
    createdAt: q.created_at,
    answeredAt: q.answered_at,
    from: "Renter",
    regarding: "Question about your space",
    title: isPending
      ? `${renterFirst} asked a yes/no question · ${space}`
      : `Question · ${space}`,
    summary: q.question,
    timestamp: ts,
    unread: isPending,
    status,
    iconType: "question",
    searchBlob: `${space} ${q.question} ${renterFirst} ${
      q.answer || ""
    } yes no question`.toLowerCase(),
  };
}

function renterQuestionToCard(q: ListingQuestion): RenterQuestionCard {
  const space = q.space_title || "this listing";
  const isPending = q.status === "pending";
  const isAnswered = q.status === "answered";
  const status: CardStatus =
    isAnswered && q.answer
      ? ANSWER_TO_STATUS[q.answer]
      : isPending
      ? "pending"
      : "dismissed";
  const ts = isAnswered && q.answered_at ? q.answered_at : q.created_at;

  // Renter-side: pending = unread; answered/dismissed = read.
  const unread = isPending;

  return {
    kind: "renter_question",
    id: `q-${q.id}`,
    questionId: q.id,
    spaceId: q.space_id,
    spaceTitle: space,
    spaceCoverUrl: q.space_cover_url || null,
    question: q.question,
    answer: q.answer,
    questionStatus: q.status,
    createdAt: q.created_at,
    answeredAt: q.answered_at,
    from: "Host",
    regarding: "Your question to the host",
    title: isPending
      ? `Awaiting host answer · ${space}`
      : isAnswered
      ? `Host answered · ${space}`
      : `Question · ${space}`,
    summary: q.question,
    timestamp: ts,
    unread,
    status,
    iconType: isAnswered ? "approved" : "question",
    searchBlob: `${space} ${q.question} ${q.answer || ""} host answer`.toLowerCase(),
  };
}

function threadToCard(t: MessageThread): BookingThreadCard {
  const space = t.listingTitle || "Booking";
  const preview = (t.lastMessagePreview || "").slice(0, 240);
  const ts = t.lastMessageAt || new Date().toISOString();
  const otherSide: FromLabel = t.viewerRole === "owner" ? "Renter" : "Host";

  return {
    kind: "booking_thread",
    id: `thread-${t.bookingId}`,
    bookingId: t.bookingId,
    spaceId: t.spaceId,
    spaceTitle: space,
    spaceCoverUrl: t.spaceCoverUrl,
    otherPartyName: t.otherPartyName,
    viewerRole: t.viewerRole,
    unreadCount: t.unreadCount,
    href: `/dashboard/messages/${t.bookingId}`,
    from: otherSide,
    regarding: "Booking conversation",
    title: `Conversation with ${t.otherPartyName} · ${space}`,
    summary: preview || "Open the booking conversation to continue.",
    timestamp: ts,
    unread: t.unreadCount > 0,
    status: t.unreadCount > 0 ? "action_required" : "info",
    iconType: "message",
    searchBlob: `${space} ${t.otherPartyName} ${preview}`.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Page (Suspense wrapper around the client content)
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 50;

export default function CommsCenterPage() {
  return (
    <Suspense fallback={null}>
      <CommsCenterContent />
    </Suspense>
  );
}

function CommsCenterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const focusId = searchParams.get("focus");
  const focusType = searchParams.get("type");
  // Workspace deep links: ?view=platform | bookings | hosting
  //   - bookings → "My bookings" tab (renter workspace shortcut)
  //   - hosting  → "My space enquiries" tab (host workspace shortcut)
  //   - platform → Platform tab
  // Mapping is one-shot: once the user clicks a different tab we lock and
  // never override again, so URL params don't fight manual navigation.
  const viewParam = (searchParams.get("view") || "").toLowerCase();
  const initialTabFromView: CommsTab | null =
    viewParam === "platform"
      ? "platform"
      : viewParam === "bookings"
        ? "bookings"
        : viewParam === "hosting"
          ? "enquiries"
          : null;

  const [tab, setTab] = useState<CommsTab>(
    initialTabFromView ?? "platform"
  );
  const [tabLocked, setTabLocked] = useState(Boolean(initialTabFromView));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<CommsStatusFilter>("all");

  const [platformCards, setPlatformCards] = useState<NotificationCard[]>([]);
  const [enquiryCards, setEnquiryCards] = useState<OwnerQuestionCard[]>([]);
  const [bookingCards, setBookingCards] = useState<CommsCard[]>([]);

  const accessTokenRef = useRef<string | null>(null);

  // Auto-pick the appropriate tab when ?focus is provided. Listing-question
  // focus heuristic: if the focused id appears under enquiries, open that tab,
  // otherwise default to bookings (renter side).
  useEffect(() => {
    if (!focusId || tabLocked) return;
    if (focusType === "listing_question") {
      const hostMatch = enquiryCards.some((c) => c.questionId === focusId);
      if (hostMatch) setTab("enquiries");
      else setTab("bookings");
    }
  }, [focusId, focusType, enquiryCards, tabLocked]);

  // Focus highlight wiring per tab. The card id in the DOM is `card-${id}`.
  const { highlightedId } = useFocusHighlight({
    focusId: focusId ? `q-${focusId}` : null,
    ready: !loading,
    prefix: "card",
  });

  const loadAll = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setError("Please sign in to view your Comms Center.");
        setPlatformCards([]);
        setEnquiryCards([]);
        setBookingCards([]);
        return;
      }
      const userId = session.user.id;
      const accessToken = session.access_token;
      accessTokenRef.current = accessToken;

      const authHeaders = {
        Authorization: `Bearer ${accessToken}`,
      } as const;

      const [
        notifResult,
        renterQRes,
        ownerQRes,
        threadsRes,
      ] = await Promise.all([
        (supabase.from("notifications") as any)
          .select(
            "id, user_id, role, type, title, message, href, is_read, read_at, archived_at, created_at, related_entity_type, related_entity_id"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(150),
        fetch("/api/listing-questions?role=renter", {
          headers: authHeaders,
        }).catch(() => null),
        fetch("/api/listing-questions?role=owner", {
          headers: authHeaders,
        }).catch(() => null),
        fetch("/api/bookings/message-threads", {
          headers: authHeaders,
        }).catch(() => null),
      ]);

      const notifications = (notifResult?.data || []) as NotificationRow[];
      const renterQuestions: ListingQuestion[] =
        renterQRes && renterQRes.ok
          ? (await renterQRes.json()).questions || []
          : [];
      const ownerQuestions: ListingQuestion[] =
        ownerQRes && ownerQRes.ok ? (await ownerQRes.json()).questions || [] : [];
      const threads: MessageThread[] =
        threadsRes && threadsRes.ok ? (await threadsRes.json()).threads || [] : [];

      // Platform tab cards
      const platform = notifications
        .filter((n) => PLATFORM_NOTIF_TYPES.has(n.type))
        .map(notificationToCard)
        .filter((c): c is NotificationCard => Boolean(c))
        .slice(0, PAGE_LIMIT);

      // Enquiries tab cards (host side: questions about MY listings)
      const enquiries = ownerQuestions
        .map(ownerQuestionToCard)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, PAGE_LIMIT);

      // Bookings tab cards (renter side: my questions, my conversations,
      // my booking-status notifications)
      const bookingsList: CommsCard[] = [];
      for (const q of renterQuestions) {
        bookingsList.push(renterQuestionToCard(q));
      }
      for (const t of threads) {
        if (!t.lastMessageAt && t.unreadCount === 0) continue;
        bookingsList.push(threadToCard(t));
      }
      for (const n of notifications) {
        if (!BOOKING_STATUS_NOTIF_TYPES.has(n.type)) continue;
        const card = notificationToCard(n);
        if (card) bookingsList.push(card);
      }
      bookingsList.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setPlatformCards(platform);
      setEnquiryCards(enquiries);
      setBookingCards(bookingsList.slice(0, PAGE_LIMIT));
    } catch (err) {
      console.error("Comms feed load failed:", err);
      setError("Could not load your Comms Center.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  // -------------------------------------------------------------------------
  // Notification-card click — mark read + navigate.
  // -------------------------------------------------------------------------

  async function handleNotificationClick(card: NotificationCard) {
    setBusyCardId(card.id);
    try {
      await markNotificationReadClient(card.notificationId);
      const updater = (cards: CommsCard[]): CommsCard[] =>
        cards.map((c) =>
          c.id === card.id && c.kind === "notification"
            ? { ...c, unread: false, archived: c.archived }
            : c
        );
      setPlatformCards((prev) => updater(prev) as NotificationCard[]);
      setBookingCards(updater);
      broadcastInboxRefresh();
    } catch {
      /* best-effort */
    } finally {
      setBusyCardId(null);
    }
    router.push(card.href);
  }

  async function handleArchiveNotification(card: NotificationCard) {
    setBusyCardId(card.id);
    try {
      await archiveNotificationClient(card.notificationId);
      setPlatformCards((prev) => prev.filter((c) => c.id !== card.id));
      setBookingCards((prev) => prev.filter((c) => c.id !== card.id));
      broadcastInboxRefresh();
    } catch {
      /* best-effort */
    } finally {
      setBusyCardId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Owner answer/dismiss — inline.
  // -------------------------------------------------------------------------

  async function handleOwnerAnswer(
    card: OwnerQuestionCard,
    action: "yes" | "no" | "not_applicable" | "dismiss"
  ): Promise<{ ok: boolean; error?: string }> {
    setBusyCardId(card.id);
    try {
      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        return { ok: false, error: "Please sign in to answer this question." };
      }
      const body =
        action === "dismiss"
          ? { action: "dismiss" as const }
          : { action: "answer" as const, answer: action };

      const res = await fetch(
        `/api/listing-questions/${card.questionId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return {
          ok: false,
          error: json.error || "Could not save your answer.",
        };
      }

      // Update local card immediately.
      setEnquiryCards((prev) =>
        prev.map((c) => {
          if (c.id !== card.id) return c;
          if (action === "dismiss") {
            return {
              ...c,
              questionStatus: "dismissed",
              status: "dismissed",
              unread: false,
              answer: null,
              answeredAt: new Date().toISOString(),
              timestamp: new Date().toISOString(),
            };
          }
          return {
            ...c,
            questionStatus: "answered",
            status: ANSWER_TO_STATUS[action],
            unread: false,
            answer: action,
            answeredAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
          };
        })
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not save your answer." };
    } finally {
      setBusyCardId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Renter follow-up question — inline.
  // -------------------------------------------------------------------------

  async function handleRenterFollowUp(
    card: RenterQuestionCard,
    text: string
  ): Promise<{ ok: boolean; error?: string }> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: "Please enter a question." };
    }
    if (trimmed.length > LISTING_QUESTION_MAX_LENGTH) {
      return {
        ok: false,
        error: `Questions must be ${LISTING_QUESTION_MAX_LENGTH} characters or fewer.`,
      };
    }
    const safety = evaluateListingQuestionSafety(trimmed);
    if (!safety.ok) {
      return { ok: false, error: safety.reason };
    }

    setBusyCardId(card.id);
    try {
      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        return { ok: false, error: "Please sign in to send a question." };
      }
      const res = await fetch("/api/listing-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ spaceId: card.spaceId, question: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        // Server-side safety reply uses 400. Surface its `error` verbatim
        // because it equals LISTING_QUESTION_BLOCKED_REPLY in those cases.
        return {
          ok: false,
          error: json.error || "Could not send your question.",
        };
      }
      // Reload bookings tab so the new pending question appears at the top.
      await loadAll(false);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: LISTING_QUESTION_BLOCKED_REPLY,
      };
    } finally {
      setBusyCardId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Filtering / search
  // -------------------------------------------------------------------------

  const search = searchTerm.trim().toLowerCase();
  function applySearch<T extends BaseCardChrome>(cards: T[]): T[] {
    if (!search) return cards;
    return cards.filter((c) => c.searchBlob.includes(search));
  }

  function applyStatusFilter<T extends CommsCard>(cards: T[]): T[] {
    return cards.filter((c) => {
      const filterable = {
        unread: c.unread,
        archived: c.kind === "notification" ? c.archived : false,
        kind: c.kind,
        status: c.status,
        notificationType:
          c.kind === "notification" ? c.notificationType : undefined,
        questionStatus:
          c.kind === "owner_question" || c.kind === "renter_question"
            ? c.questionStatus
            : undefined,
        unreadCount: c.kind === "booking_thread" ? c.unreadCount : undefined,
      };
      return cardMatchesCommsStatusFilter(filterable, statusFilter);
    });
  }

  const filteredPlatform = useMemo(
    () => applyStatusFilter(applySearch(platformCards)),
    [platformCards, search, statusFilter]
  );
  const filteredEnquiries = useMemo(
    () => applyStatusFilter(applySearch(enquiryCards)),
    [enquiryCards, search, statusFilter]
  );
  const filteredBookings = useMemo(
    () => applyStatusFilter(applySearch(bookingCards)),
    [bookingCards, search, statusFilter]
  );

  const platformUnread = platformCards.filter((c) => c.unread).length;
  const enquiriesUnread = enquiryCards.filter((c) => c.unread).length;
  const bookingsUnread = bookingCards.filter((c) => c.unread).length;

  // Pick currently-visible cards based on tab.
  let visibleCards: CommsCard[] = [];
  if (tab === "platform") visibleCards = filteredPlatform;
  else if (tab === "enquiries") visibleCards = filteredEnquiries;
  else visibleCards = filteredBookings;

  // Comms is shared across both workspaces. The `?view=` param tells us which
  // workspace the user came from so we can wrap the page in the matching nav.
  // If no view is supplied we default to the renter workspace — most users
  // are renters and the renter nav covers the common path; hosts entering
  // through the host overview always carry `view=hosting`.
  const isHostWorkspace = viewParam === "hosting";
  const navItems = isHostWorkspace ? HOST_NAV : RENTER_NAV;
  const navActiveHref = isHostWorkspace
    ? "/dashboard/comms?view=hosting"
    : "/dashboard/comms?view=bookings";

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel={isHostWorkspace ? "Hosting" : "My account"}
        pageTitle="Comms Center"
        pageSubtitle="Platform updates, listing questions, booking messages, and actions in one place."
        navItems={navItems}
        activeHref={navActiveHref}
      >
        <>
          {/* Refresh action lives inline so it stays near the content while
              the shell owns the page title. */}
          <div className="-mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => void loadAll(false)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium text-[#0f172a] shadow-sm transition hover:border-[#cbd5e1] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh comms"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Search */}
          <div className="mb-4">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"
                aria-hidden
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search messages, questions, listings…"
                className="w-full rounded-xl border border-[#e2e8f0] bg-white py-2.5 pl-9 pr-3 text-sm text-[#0f172a] shadow-sm placeholder:text-[#94a3b8] focus:border-[#0f2740]/30 focus:outline-none focus:ring-2 focus:ring-[#0f2740]/15"
              />
            </label>
          </div>

          {/* Status filters */}
          <div
            role="tablist"
            aria-label="Message status"
            className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0"
          >
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["action_required", "Action required"],
                ["read", "Read"],
                ["archived", "Archived"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === key
                    ? "border-[#c1121f] bg-[#fff1f2] text-[#9f1239]"
                    : "border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Comms tabs"
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0"
          >
            <CommsTabButton
              active={tab === "platform"}
              label="Platform"
              count={platformUnread}
              onClick={() => {
                setTab("platform");
                setTabLocked(true);
              }}
            />
            <CommsTabButton
              active={tab === "enquiries"}
              label="My space enquiries"
              count={enquiriesUnread}
              onClick={() => {
                setTab("enquiries");
                setTabLocked(true);
              }}
            />
            <CommsTabButton
              active={tab === "bookings"}
              label="My bookings"
              count={bookingsUnread}
              onClick={() => {
                setTab("bookings");
                setTabLocked(true);
              }}
            />
          </div>

          {error ? (
            <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#9f1239]">
              {error}
            </div>
          ) : null}

          {/* List */}
          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-8 text-sm text-[#475569] shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading your Comms Center…
            </div>
          ) : visibleCards.length === 0 ? (
            <EmptyState tab={tab} hasSearch={Boolean(search)} />
          ) : (
            <ul className="space-y-2.5">
              {visibleCards.map((card) => (
                <CommsCardRow
                  key={card.id}
                  card={card}
                  busy={busyCardId === card.id}
                  highlight={highlightedId === card.id}
                  onNotificationClick={handleNotificationClick}
                  onArchiveNotification={handleArchiveNotification}
                  onOwnerAnswer={handleOwnerAnswer}
                  onRenterFollowUp={handleRenterFollowUp}
                />
              ))}
            </ul>
          )}

          {!loading && visibleCards.length >= PAGE_LIMIT ? (
            <p className="mt-4 text-center text-xs text-[#94a3b8]">
              Showing the {PAGE_LIMIT} most recent items · older items remain
              in their dedicated pages.
            </p>
          ) : null}

          {/* Subtle helper links */}
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94a3b8]">
            <Link
              href="/dashboard/notifications"
              className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
            >
              View all notifications →
            </Link>
            <Link
              href="/dashboard/messages"
              className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
            >
              Open all message threads →
            </Link>
            <Link
              href="/dashboard/listing-questions"
              className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
            >
              Manage listing questions →
            </Link>
          </div>
        </>
      </DashboardShell>
    </RequireAuth>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function CommsTabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
        active
          ? "border-[#0f2740] bg-[#0f2740] text-white shadow-sm"
          : "border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a]"
      }`}
    >
      {label}
      {count > 0 ? (
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
            active ? "bg-white text-[#0f2740]" : "bg-[#c1121f] text-white"
          }`}
          aria-label={`${count} unread`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card row dispatcher
// ---------------------------------------------------------------------------

function CommsCardRow({
  card,
  busy,
  highlight,
  onNotificationClick,
  onArchiveNotification,
  onOwnerAnswer,
  onRenterFollowUp,
}: {
  card: CommsCard;
  busy: boolean;
  highlight: boolean;
  onNotificationClick: (card: NotificationCard) => void;
  onArchiveNotification: (card: NotificationCard) => void;
  onOwnerAnswer: (
    card: OwnerQuestionCard,
    action: "yes" | "no" | "not_applicable" | "dismiss"
  ) => Promise<{ ok: boolean; error?: string }>;
  onRenterFollowUp: (
    card: RenterQuestionCard,
    text: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const baseClasses =
    "block w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition-all duration-200";
  const stateClasses = card.unread
    ? "border-[#0f2740]/15 bg-[#f8fbff] shadow-md"
    : "border-[#e2e8f0]";
  const highlightClasses = highlight ? FOCUS_HIGHLIGHT_CLASS : "";

  const liId = `card-${card.id.replace(/^q-/, "")}`;

  return (
    <li id={liId} className={`${baseClasses} ${stateClasses} ${highlightClasses}`}>
      <CardChrome card={card} />
      {card.kind === "owner_question" ? (
        <OwnerQuestionActions
          card={card}
          busy={busy}
          onAnswer={onOwnerAnswer}
        />
      ) : null}
      {card.kind === "renter_question" ? (
        <RenterQuestionActions
          card={card}
          busy={busy}
          onFollowUp={onRenterFollowUp}
        />
      ) : null}
      {card.kind === "booking_thread" ? (
        <ThreadCardCta card={card} />
      ) : null}
      {card.kind === "notification" ? (
        <NotificationCardCta
          card={card}
          busy={busy}
          onClick={onNotificationClick}
          onArchive={onArchiveNotification}
        />
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Card chrome (thumbnail + meta + title + summary + status pill)
// ---------------------------------------------------------------------------

function CardChrome({ card }: { card: CommsCard }) {
  return (
    <div className="flex items-start gap-3">
      {/* Thumbnail / icon */}
      <div className="shrink-0">
        {card.spaceCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.spaceCoverUrl}
            alt={`${card.regarding} thumbnail`}
            className="h-12 w-12 rounded-lg object-cover sm:h-14 sm:w-14"
          />
        ) : (
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-lg sm:h-14 sm:w-14 ${
              card.unread ? "bg-white shadow-inner" : "bg-[#f1f5f9]"
            }`}
          >
            <CardIconDisplay type={card.iconType} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Top meta */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wide text-[#64748b]">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Bell className="h-3 w-3" aria-hidden />
            From {card.from}
          </span>
          <span aria-hidden>·</span>
          <span>{card.regarding}</span>
          <span className="ml-auto normal-case tracking-normal text-[11px] text-[#94a3b8]">
            <span title={formatExact(card.timestamp)}>
              {formatRelative(card.timestamp)}
            </span>
          </span>
        </div>

        {/* Title row */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={`text-sm ${
              card.unread
                ? "font-semibold text-[#0f172a]"
                : "font-medium text-[#0f172a]"
            }`}
          >
            {card.title}
          </p>
          {card.unread ? (
            <span
              className="inline-block h-2 w-2 rounded-full bg-[#c1121f]"
              aria-label="Unread"
            />
          ) : (
            <span className="inline-flex rounded-full border border-[#e2e8f0] bg-[#f8fafb] px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#64748b]">
              Read
            </span>
          )}
        </div>

        {/* Summary */}
        {card.summary ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#475569]">
            {card.summary}
          </p>
        ) : null}

        {/* Status pill */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[card.status]}`}
          >
            {STATUS_LABEL[card.status]}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner-side inline actions
// ---------------------------------------------------------------------------

function OwnerQuestionActions({
  card,
  busy,
  onAnswer,
}: {
  card: OwnerQuestionCard;
  busy: boolean;
  onAnswer: (
    card: OwnerQuestionCard,
    action: "yes" | "no" | "not_applicable" | "dismiss"
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, setPending] = useState<
    "yes" | "no" | "not_applicable" | "dismiss" | null
  >(null);
  const [errorText, setErrorText] = useState("");

  async function go(action: "yes" | "no" | "not_applicable" | "dismiss") {
    setPending(action);
    setErrorText("");
    const result = await onAnswer(card, action);
    setPending(null);
    if (!result.ok) {
      setErrorText(result.error || "Could not save your answer.");
    }
  }

  if (card.questionStatus !== "pending") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#475569]">
        <Link
          href={`/spaces/${card.spaceId}`}
          className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
        >
          View listing →
        </Link>
        <Link
          href={`/dashboard/listing-questions?focus=${card.questionId}&tab=owner`}
          className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
        >
          Open in legacy view →
        </Link>
      </div>
    );
  }

  const options = [
    { id: "yes" as const, label: "Yes", tone: "primary" as const },
    { id: "no" as const, label: "No", tone: "primary" as const },
    {
      id: "not_applicable" as const,
      label: "Not applicable",
      tone: "ghost" as const,
    },
    { id: "dismiss" as const, label: "Dismiss", tone: "ghost" as const },
  ];

  return (
    <div className="mt-3 border-t border-[#f1f5f9] pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
        Answer this question
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isPrimary = opt.tone === "primary";
          const isThisBusy = pending === opt.id || busy;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => void go(opt.id)}
              disabled={Boolean(pending) || busy}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                isPrimary
                  ? "border-[#c1121f] bg-[#c1121f] text-white hover:bg-[#a40e1a]"
                  : "border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isThisBusy && pending === opt.id ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {opt.label}
            </button>
          );
        })}
        <Link
          href={`/spaces/${card.spaceId}`}
          className="ml-auto self-center text-xs font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
        >
          View listing →
        </Link>
      </div>
      {errorText ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#9f1239]">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renter-side follow-up form (only on answered questions)
// ---------------------------------------------------------------------------

function RenterQuestionActions({
  card,
  busy,
  onFollowUp,
}: {
  card: RenterQuestionCard;
  busy: boolean;
  onFollowUp: (
    card: RenterQuestionCard,
    text: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setErrorText("");
    const result = await onFollowUp(card, text);
    setSubmitting(false);
    if (!result.ok) {
      setErrorText(result.error || "Could not send your question.");
      return;
    }
    setSuccess(true);
    setText("");
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
    }, 1200);
  }

  return (
    <div className="mt-3 border-t border-[#f1f5f9] pt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {card.questionStatus === "answered" ? (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setErrorText("");
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c1121f] bg-[#c1121f] px-3 py-1.5 font-semibold text-white transition-colors duration-150 hover:bg-[#a40e1a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HelpCircle className="h-3 w-3" aria-hidden />
            Ask another yes/no question
          </button>
        ) : (
          <span className="text-[#64748b]">Awaiting host response.</span>
        )}
        <Link
          href={`/spaces/${card.spaceId}`}
          className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
        >
          View listing →
        </Link>
        <Link
          href={`/dashboard/listing-questions?focus=${card.questionId}&tab=renter`}
          className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
        >
          Open in legacy view →
        </Link>
      </div>

      {open ? (
        <div className="mt-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafb] p-3">
          <label
            htmlFor={`followup-${card.questionId}`}
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#64748b]"
          >
            Ask the host another yes/no question
          </label>
          <textarea
            id={`followup-${card.questionId}`}
            rows={3}
            maxLength={LISTING_QUESTION_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Phrase your question so the host can answer with Yes, No, or Not applicable."
            className="w-full resize-none rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#0f2740]/30 focus:outline-none focus:ring-2 focus:ring-[#0f2740]/15"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#94a3b8]">
              {text.length}/{LISTING_QUESTION_MAX_LENGTH}
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setText("");
                setErrorText("");
              }}
              disabled={submitting}
              className="ml-auto rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] hover:border-[#cbd5e1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || text.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#c1121f] bg-[#c1121f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a40e1a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Send className="h-3 w-3" aria-hidden />
              )}
              Send
            </button>
          </div>
          {errorText ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#9f1239]">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {errorText}
            </p>
          ) : null}
          {success ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#166534]">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Sent — the host will be notified.
            </p>
          ) : null}
          <p className="mt-2 text-[11px] text-[#94a3b8]">
            For your safety, contact details and exact addresses can only be
            shared once a booking is approved and paid.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread card CTA (open conversation)
// ---------------------------------------------------------------------------

function ThreadCardCta({ card }: { card: BookingThreadCard }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f5f9] pt-3 text-xs">
      <span className="text-[#64748b]">
        {card.unreadCount > 0
          ? `${card.unreadCount} unread message${card.unreadCount > 1 ? "s" : ""}`
          : "All caught up"}
      </span>
      <Link
        href={card.href}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#c1121f] bg-[#c1121f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a40e1a]"
      >
        Open booking conversation
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification CTA (Comms-internal click handler — marks read + navigates)
// ---------------------------------------------------------------------------

function NotificationCardCta({
  card,
  busy,
  onClick,
  onArchive,
}: {
  card: NotificationCard;
  busy: boolean;
  onClick: (card: NotificationCard) => void;
  onArchive: (card: NotificationCard) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-[#f1f5f9] pt-3">
      {!card.unread && !card.archived ? (
        <button
          type="button"
          onClick={() => onArchive(card)}
          disabled={busy}
          className="text-xs font-medium text-[#64748b] underline-offset-2 hover:text-[#0f172a] hover:underline disabled:opacity-60"
        >
          Archive
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onClick(card)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c1121f] transition-colors hover:text-[#a40e1a] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Opening…
          </>
        ) : (
          <>
            {card.ctaLabel}
            <span aria-hidden>→</span>
          </>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  tab,
  hasSearch,
}: {
  tab: CommsTab;
  hasSearch: boolean;
}) {
  if (hasSearch) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-4 py-12 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f5f9] text-[#475569]">
          <Search className="h-5 w-5" aria-hidden />
        </div>
        <p className="text-sm font-medium text-[#0f172a]">No matches.</p>
        <p className="mt-1 text-xs text-[#64748b]">
          Try a different search term.
        </p>
      </div>
    );
  }

  let message = "No platform messages yet.";
  let helper =
    "Verification, listing approval, and payment notices will appear here.";
  let Icon: typeof ShieldCheck = ShieldCheck;
  if (tab === "enquiries") {
    message = "No enquiries about your spaces yet.";
    helper =
      "When renters ask yes/no questions about your listings, they’ll appear here.";
    Icon = HelpCircle;
  } else if (tab === "bookings") {
    message = "No space or booking conversations yet.";
    helper =
      "Your questions to hosts and your booking conversations will appear here.";
    Icon = MessageSquare;
  }

  return (
    <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-4 py-12 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f5f9] text-[#475569]">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[#0f172a]">{message}</p>
      <p className="mt-1 text-xs text-[#64748b]">{helper}</p>
    </div>
  );
}
