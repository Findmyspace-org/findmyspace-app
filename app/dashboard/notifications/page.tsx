"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Building2,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

type NotificationRow = {
  id: string;
  user_id: string;
  role: string | null;
  type: string;
  title: string | null;
  message: string | null;
  href: string | null;
  is_read: boolean;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
};

type CategoryKey =
  | "all"
  | "unread"
  | "bookings"
  | "listing_questions"
  | "listings"
  | "verification"
  | "payments"
  | "messages";

const CATEGORY_TYPES: Record<Exclude<CategoryKey, "all" | "unread">, string[]> =
  {
    bookings: [
      "booking_request",
      "booking_paid",
      "booking_confirmed",
      "booking_declined",
      "booking_expired",
      "payment_needed",
    ],
    listing_questions: ["listing_question", "listing_question_answered"],
    listings: [
      "listing_submitted",
      "listing_pending",
      "listing_rejected",
      "listing_activated",
      "ownership_proof_verified",
    ],
    verification: [
      "identity_submitted",
      "identity_verified",
      "identity_rejected",
      "bank_submitted",
      "bank_verified",
      "bank_rejected",
    ],
    payments: [
      "payment_needed",
      "payment_received",
      "booking_paid",
      "booking_confirmed",
    ],
    messages: ["booking_message"],
  };

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "bookings", label: "Bookings" },
  { key: "listing_questions", label: "Listing questions" },
  { key: "listings", label: "Listings" },
  { key: "verification", label: "Verification" },
  { key: "payments", label: "Payments" },
  { key: "messages", label: "Messages" },
];

const PAGE_SIZE = 25;

function formatRelative(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
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

/**
 * Mirrors the bell's icon-by-type branch but driven directly by DB `type`
 * values (not the bell's UI-mapped types).
 */
function NotificationIcon({ type }: { type: string }) {
  const t = type;
  if (t === "payment_needed") {
    return <Clock3 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;
  }
  if (t === "booking_request") {
    return <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />;
  }
  if (t === "booking_confirmed") {
    return (
      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
    );
  }
  if (t === "booking_paid") {
    return <Landmark className="h-4 w-4 shrink-0 text-green-700" aria-hidden />;
  }
  if (t === "payment_received") {
    return (
      <CreditCard className="h-4 w-4 shrink-0 text-green-700" aria-hidden />
    );
  }
  if (t === "booking_message") {
    return (
      <MessageSquare className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
    );
  }
  if (t === "listing_question" || t === "listing_question_answered") {
    return (
      <HelpCircle className="h-4 w-4 shrink-0 text-[#c1121f]" aria-hidden />
    );
  }
  if (
    t === "listing_submitted" ||
    t === "listing_pending" ||
    t === "listing_rejected" ||
    t === "listing_activated" ||
    t === "ownership_proof_verified"
  ) {
    return (
      <Building2 className="h-4 w-4 shrink-0 text-[#0f2740]" aria-hidden />
    );
  }
  if (
    t === "identity_submitted" ||
    t === "identity_verified" ||
    t === "identity_rejected" ||
    t === "bank_submitted" ||
    t === "bank_verified" ||
    t === "bank_rejected"
  ) {
    return (
      <ShieldCheck className="h-4 w-4 shrink-0 text-[#0f2740]" aria-hidden />
    );
  }
  if (t === "booking_declined" || t === "booking_expired") {
    return <CalendarDays className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />;
  }
  return <Tag className="h-4 w-4 shrink-0 text-[#192a3a]" aria-hidden />;
}

function categoryLabelForType(type: string): string {
  if (CATEGORY_TYPES.bookings.includes(type)) return "Bookings";
  if (CATEGORY_TYPES.listing_questions.includes(type)) return "Listing questions";
  if (CATEGORY_TYPES.listings.includes(type)) return "Listings";
  if (CATEGORY_TYPES.verification.includes(type)) return "Verification";
  if (CATEGORY_TYPES.messages.includes(type)) return "Messages";
  return "Other";
}

export default function NotificationsArchivePage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<CategoryKey>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reload when the category filter changes.
  const load = useCallback(
    async (opts: { reset: boolean; afterCursor?: string | null }) => {
      const isReset = opts.reset;
      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError("");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setItems([]);
          setHasMore(false);
          setError("Please sign in to view your notifications.");
          return;
        }

        let query = (supabase.from("notifications") as any)
          .select(
            "id, user_id, role, type, title, message, href, is_read, created_at, related_entity_type, related_entity_id"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (category === "unread") {
          query = query.eq("is_read", false);
        } else if (category !== "all") {
          query = query.in("type", CATEGORY_TYPES[category]);
        }

        if (opts.afterCursor) {
          query = query.lt("created_at", opts.afterCursor);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) {
          setError(fetchError.message || "Could not load notifications.");
          return;
        }

        const rows = (data || []) as NotificationRow[];
        setHasMore(rows.length === PAGE_SIZE);
        setItems((prev) => (isReset ? rows : [...prev, ...rows]));
      } catch (err) {
        setError("Could not load notifications.");
      } finally {
        if (isReset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [category]
  );

  useEffect(() => {
    void load({ reset: true });
  }, [load]);

  const oldestCursor = useMemo(() => {
    if (items.length === 0) return null;
    return items[items.length - 1].created_at;
  }, [items]);

  async function handleClick(n: NotificationRow) {
    setBusyId(n.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ notificationId: n.id }),
        });
      }
      setItems((prev) =>
        prev.map((row) => (row.id === n.id ? { ...row, is_read: true } : row))
      );
    } catch {
      /* non-fatal */
    } finally {
      setBusyId(null);
    }
    if (n.href) router.push(n.href);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const body: { types?: string[] } = {};
      if (category !== "all" && category !== "unread") {
        body.types = CATEGORY_TYPES[category];
      }

      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Could not mark all as read.");
        return;
      }
      setItems((prev) =>
        prev.map((row) => {
          if (body.types && !body.types.includes(row.type)) return row;
          return { ...row, is_read: true };
        })
      );
      // For the "Unread" filter, marking all read empties the list.
      if (category === "unread") {
        setItems([]);
        setHasMore(false);
      }
    } catch {
      setError("Could not mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  const hasUnreadInList = items.some((n) => !n.is_read);
  const filterCount = items.length;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-4 py-8 text-[#0f172a] sm:px-6 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/dashboard/comms"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Comms Center
          </Link>
          {/* Header */}
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#0f2740]" aria-hidden />
                <h1 className="text-2xl font-semibold sm:text-3xl">
                  Notifications
                </h1>
              </div>
              <p className="mt-1 text-sm text-[#475569]">
                Your full notification history. Older items remain here even
                after they’ve been read.
              </p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll || !hasUnreadInList}
              className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-medium text-[#0f172a] shadow-sm transition hover:border-[#cbd5e1] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCheck className="h-4 w-4" aria-hidden />
              )}
              Mark all as read
            </button>
          </div>

          {/* Filters */}
          <div
            role="tablist"
            aria-label="Filter notifications"
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c.key)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                    active
                      ? "border-[#0f2740] bg-[#0f2740] text-white shadow-sm"
                      : "border-[#e2e8f0] bg-white text-[#475569] hover:border-[#cbd5e1] hover:text-[#0f172a]"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
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
              Loading your notifications…
            </div>
          ) : items.length === 0 ? (
            <EmptyState category={category} />
          ) : (
            <ul className="space-y-2.5">
              {items.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  isBusy={busyId === n.id}
                  onClick={() => void handleClick(n)}
                />
              ))}
            </ul>
          )}

          {/* Load more */}
          {!loading && hasMore && items.length > 0 ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  void load({ reset: false, afterCursor: oldestCursor })
                }
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-medium text-[#0f172a] shadow-sm transition hover:border-[#cbd5e1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Load more
              </button>
            </div>
          ) : null}

          {!loading && items.length > 0 && !hasMore ? (
            <p className="mt-4 text-center text-xs text-[#94a3b8]">
              You’ve reached the end of your notifications · {filterCount} shown
            </p>
          ) : null}

          <p className="mt-8 text-xs text-[#94a3b8]">
            Need to manage how you’re contacted?{" "}
            <Link
              href="/dashboard"
              className="font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
            >
              Back to dashboard
            </Link>
            .
          </p>
        </div>
      </main>
    </RequireAuth>
  );
}

function NotificationCard({
  notification,
  isBusy,
  onClick,
}: {
  notification: NotificationRow;
  isBusy: boolean;
  onClick: () => void;
}) {
  const { type, title, message, is_read, created_at, href } = notification;
  const tagLabel = categoryLabelForType(type);
  const interactive = Boolean(href);

  const baseClasses =
    "block w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition-all duration-200";
  const stateClasses = is_read
    ? "border-[#e2e8f0]"
    : "border-[#0f2740]/15 bg-[#f8fbff] shadow-md";
  const interactiveClasses = interactive
    ? "hover:border-[#cbd5e1] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0f2740]/20"
    : "";

  const body = (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          is_read ? "bg-[#f1f5f9]" : "bg-white shadow-inner"
        }`}
      >
        <NotificationIcon type={type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={`text-sm ${
              is_read
                ? "font-medium text-[#0f172a]"
                : "font-semibold text-[#0f172a]"
            }`}
          >
            {title || "Notification"}
          </p>
          {!is_read ? (
            <span
              className="inline-block h-2 w-2 rounded-full bg-[#c1121f]"
              aria-label="Unread"
            />
          ) : null}
          <span className="ml-auto text-[11px] text-[#94a3b8]">
            <span title={formatExact(created_at)}>
              {formatRelative(created_at)}
            </span>
          </span>
        </div>
        {message ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#475569]">
            {message}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-[#f8fafb] px-2 py-0.5 text-[11px] font-medium text-[#475569]">
            {tagLabel}
          </span>
          {interactive ? (
            <span className="text-[11px] font-medium text-[#0f2740]">
              {isBusy ? "Opening…" : "Open →"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          onClick={onClick}
          disabled={isBusy}
          className={`${baseClasses} ${stateClasses} ${interactiveClasses}`}
        >
          {body}
        </button>
      ) : (
        <div className={`${baseClasses} ${stateClasses}`}>{body}</div>
      )}
    </li>
  );
}

function EmptyState({ category }: { category: CategoryKey }) {
  const message =
    category === "unread"
      ? "You’re all caught up — nothing unread."
      : category === "all"
      ? "No notifications yet."
      : "No notifications in this category yet.";
  return (
    <div className="rounded-2xl border border-dashed border-[#e2e8f0] bg-white px-4 py-12 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f5f9] text-[#475569]">
        <BellOff className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[#0f172a]">{message}</p>
      <p className="mt-1 text-xs text-[#64748b]">
        New activity will show up here.
      </p>
    </div>
  );
}
