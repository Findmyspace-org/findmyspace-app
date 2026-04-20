"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  History,
  LayoutDashboard,
  MessageSquare,
  Search,
  Send,
  Users,
} from "lucide-react";

type ConversationRow = {
  bookingId: string;
  listingId: string | null;
  listingName: string;
  ownerName: string;
  renterName: string;
  bookingStatus: string;
  paymentStatus: string;
  bookingUnit?: string | null;
  latestMessage: string;
  latestTimestamp: string | null;
  unread: boolean;
  messageCount: number;
  location: string;
};

type ThreadMessage = {
  id: string;
  message: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderRole: string;
};

type ThreadPayload = {
  booking: {
    id: string;
    status: string;
    paymentStatus: string;
    bookingUnit?: string | null;
    startAt: string | null;
    endAt: string | null;
    totalPrice: number | null;
    viewBookingUrl: string | null;
    viewListingUrl: string | null;
  };
  listing: {
    id: string | null;
    title: string;
    location: string;
    imageUrl: string | null;
  };
  owner: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  renter: {
    id: string;
    name: string;
    email: string | null;
  };
  messages: ThreadMessage[];
};

function badgeClass(status: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("paid") || normalized === "active" || normalized === "confirmed") {
    return "border-green-300 bg-green-50 text-green-700";
  }
  if (normalized.includes("reject") || normalized.includes("declin")) {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (normalized.includes("pause")) {
    return "border-yellow-300 bg-yellow-50 text-yellow-700";
  }
  return "border-gray-300 bg-gray-100 text-gray-700";
}

function roleBubbleClass(role: string) {
  const normalized = (role || "").toLowerCase();
  if (normalized === "admin") return "border-blue-200 bg-blue-50";
  if (normalized === "owner") return "border-emerald-200 bg-emerald-50";
  if (normalized === "renter") return "border-purple-200 bg-purple-50";
  return "border-gray-200 bg-gray-50";
}

function roleChipClass(role: string) {
  const normalized = (role || "").toLowerCase();
  if (normalized === "admin") return "bg-blue-100 text-blue-700";
  if (normalized === "owner") return "bg-emerald-100 text-emerald-700";
  if (normalized === "renter") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-700";
}

function prettyLabel(value: string | null | undefined) {
  return (value || "not set").replace(/_/g, " ");
}

export default function AdminMessagesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [threadData, setThreadData] = useState<ThreadPayload | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [readBookingIds, setReadBookingIds] = useState<Record<string, true>>({});

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  async function loadConversations(nextSelectedBookingId?: string | null) {
    const token = await getAccessToken();
    if (!token) {
      setMessage("Please log in first.");
      return;
    }

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (unreadOnly) params.set("unread", "1");

    setLoadingConversations(true);
    setConversationError("");
    const res = await fetch(`/api/admin/messages/conversations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      conversations?: ConversationRow[];
    };

    if (!res.ok) {
      setConversationError(json.error || "Could not load conversations.");
      setLoadingConversations(false);
      return;
    }

    const rows = json.conversations || [];
    setConversations(rows);

    const selected =
      nextSelectedBookingId ||
      (rows.find((item) => item.bookingId === selectedBookingId)?.bookingId ?? rows[0]?.bookingId ?? null);
    setSelectedBookingId(selected);
    setLoadingConversations(false);
  }

  async function loadThread(bookingId: string) {
    const token = await getAccessToken();
    if (!token) {
      setMessage("Please log in first.");
      return;
    }
    setThreadLoading(true);
    setThreadError("");
    setMessage("");

    const res = await fetch(`/api/admin/messages/${bookingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as ThreadPayload & { error?: string };

    if (!res.ok) {
      setThreadError(json.error || "Could not load thread.");
      setThreadLoading(false);
      return;
    }

    setThreadData(json);
    setReadBookingIds((current) => ({ ...current, [bookingId]: true }));
    setThreadLoading(false);
  }

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setLoading(false);
        return;
      }

      const { data: profile, error } = await (supabase.from("profiles") as any)
        .select("role")
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      setRole(profile?.role || "user");
      if (profile?.role !== "admin") {
        setLoading(false);
        return;
      }

      await loadConversations();
      setLoading(false);
    }
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedBookingId) {
      setThreadData(null);
      return;
    }
    void loadThread(selectedBookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookingId]);

  useEffect(() => {
    if (role !== "admin") return;
    const id = setTimeout(() => {
      void loadConversations(selectedBookingId);
    }, 220);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, unreadOnly]);

  async function sendReply() {
    if (!selectedBookingId || !threadData) return;
    const text = replyDraft.trim();
    if (!text) {
      setMessage("Type a message before sending.");
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setMessage("Please log in first.");
      return;
    }

    setSendingReply(true);
    setMessage("");
    const res = await fetch(`/api/admin/messages/${selectedBookingId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: text }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: ThreadMessage;
    };

    if (!res.ok || !json.message) {
      setMessage(json.error || "Could not send message.");
      setSendingReply(false);
      return;
    }

    setThreadData((current) =>
      current
        ? {
            ...current,
            messages: [...current.messages, json.message!],
          }
        : current
    );
    setReplyDraft("");
    setSendingReply(false);
    await loadConversations(selectedBookingId);
  }

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.bookingId === selectedBookingId) || null,
    [conversations, selectedBookingId]
  );

  const decoratedConversations = useMemo(
    () =>
      conversations.map((row) => ({
        ...row,
        unread: row.unread && !readBookingIds[row.bookingId],
      })),
    [conversations, readBookingIds]
  );

  const unreadCount = useMemo(
    () => decoratedConversations.filter((item) => item.unread).length,
    [decoratedConversations]
  );

  const visibleConversations = useMemo(
    () =>
      decoratedConversations.filter((item) => {
        if (!unreadOnly) return true;
        return item.unread;
      }),
    [decoratedConversations, unreadOnly]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-7xl rounded-md border border-gray-300 p-6 shadow-sm">
          Loading admin messages...
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-red-700">You do not have admin access to this area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-[1500px]">
        <h1 className="mb-2 text-4xl font-bold">Admin - Messages</h1>
        <p className="mb-6 text-gray-600">
          Operations inbox for renter, owner, and admin communication.
        </p>

        <div className="mb-5 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/activity"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Activity
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Bookings
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
            {unreadCount > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                {unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Finance
          </Link>
        </div>

        {message && (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-800">
            {message}
          </div>
        )}

        <div className="grid h-[calc(100vh-250px)] min-h-[620px] gap-3 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <section className="flex min-h-0 flex-col rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-3">
              <div className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
                <Search className="h-4 w-4 text-gray-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search listing, owner, renter, message"
                  className="w-full border-0 bg-transparent text-sm outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["all", "pending_owner", "accepted_awaiting_payment", "paid_confirmed", "declined"].map(
                  (status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        statusFilter === status ? "bg-[#192a3a] text-white" : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      {status === "all" ? "All" : status.replace(/_/g, " ")}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setUnreadOnly((current) => !current)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    unreadOnly ? "bg-[#192a3a] text-white" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  Unread only
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loadingConversations ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="animate-pulse rounded-md border border-gray-200 p-3">
                      <div className="h-3 w-2/3 rounded bg-gray-200" />
                      <div className="mt-2 h-2.5 w-5/6 rounded bg-gray-100" />
                      <div className="mt-2 h-2.5 w-3/4 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : conversationError ? (
                <div className="p-4 text-sm text-red-700">{conversationError}</div>
              ) : visibleConversations.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">
                  {query.trim() || statusFilter !== "all" || unreadOnly
                    ? "No conversations match your current search/filter."
                    : "No active conversations yet."}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visibleConversations.map((item) => (
                    <button
                      key={item.bookingId}
                      type="button"
                      onClick={() => setSelectedBookingId(item.bookingId)}
                      className={`w-full border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                        selectedBookingId === item.bookingId
                          ? "border-l-[#192a3a] bg-[#f6f8fb]"
                          : "border-l-transparent bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {item.unread && <span className="h-1.5 w-1.5 rounded-full bg-[#192a3a]" />}
                          <p className="truncate text-sm font-semibold text-[#192a3a]">
                            {item.listingName}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-500">
                          {item.latestTimestamp
                            ? new Date(item.latestTimestamp).toLocaleString()
                            : "No date"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-600">
                        Renter: {item.renterName} • Owner: {item.ownerName}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.latestMessage}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeClass(
                            item.bookingStatus
                          )}`}
                        >
                          {prettyLabel(item.bookingStatus)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeClass(
                            item.paymentStatus
                          )}`}
                        >
                          {prettyLabel(item.paymentStatus)}
                        </span>
                        {item.unread && (
                          <span className="rounded-full bg-[#192a3a] px-2 py-0.5 text-[10px] font-medium text-white">
                            Unread
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-semibold text-[#192a3a]">
                {selectedConversation?.listingName || "Select a conversation"}
              </p>
              <p className="text-xs text-gray-600">
                Booking #{selectedConversation?.bookingId || "—"}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {threadLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="animate-pulse rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="h-2.5 w-1/3 rounded bg-gray-200" />
                      <div className="mt-2 h-2.5 w-11/12 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : threadError ? (
                <p className="text-sm text-red-700">{threadError}</p>
              ) : !threadData ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                  Select a conversation to view details.
                </div>
              ) : threadData.messages.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                  No messages yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {threadData.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`max-w-[92%] rounded-md border px-3 py-2 ${roleBubbleClass(msg.senderRole)} ${
                        msg.senderRole === "Admin" ? "ml-auto" : ""
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-[#192a3a]">{msg.senderName}</p>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${roleChipClass(
                              msg.senderRole
                            )}`}
                          >
                            {msg.senderRole}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 p-3">
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Reply as admin..."
                className="min-h-[78px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#192a3a]/30"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={sendingReply || !selectedBookingId || !replyDraft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#192a3a] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingReply ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-semibold text-[#192a3a]">Context</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {!threadData ? (
                <p className="text-sm text-gray-600">Context appears after selecting a conversation.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                      Booking
                    </p>
                    <p className="mt-1 text-[#192a3a]">#{threadData.booking.id}</p>
                    <p className="text-xs text-gray-600">Status: {prettyLabel(threadData.booking.status)}</p>
                    <p className="text-xs text-gray-600">
                      Payment: {prettyLabel(threadData.booking.paymentStatus)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Unit: {prettyLabel(threadData.booking.bookingUnit)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Dates:{" "}
                      {[threadData.booking.startAt, threadData.booking.endAt]
                        .filter(Boolean)
                        .map((d) => new Date(d as string).toLocaleString())
                        .join(" → ") || "Not set"}
                    </p>
                    <p className="text-xs text-gray-600">
                      Total amount:{" "}
                      {threadData.booking.totalPrice !== null
                        ? `R${Number(threadData.booking.totalPrice).toFixed(2)}`
                        : "Not set"}
                    </p>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                      Listing
                    </p>
                    <div className="mt-2 flex items-start gap-2">
                      <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-sm bg-gray-100">
                        {threadData.listing.imageUrl ? (
                          <Image
                            src={threadData.listing.imageUrl}
                            alt={threadData.listing.title}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-gray-500">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[#192a3a]">{threadData.listing.title}</p>
                        <p className="text-xs text-gray-600">{threadData.listing.location || "Location not set"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                      Owner
                    </p>
                    <p className="mt-1 font-medium text-[#192a3a]">{threadData.owner.name}</p>
                    <p className="text-xs text-gray-600">{threadData.owner.email || "Email not set"}</p>
                    <p className="text-xs text-gray-600">{threadData.owner.phone || "Phone not set"}</p>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                      Renter
                    </p>
                    <p className="mt-1 font-medium text-[#192a3a]">{threadData.renter.name}</p>
                    <p className="text-xs text-gray-600">{threadData.renter.email || "Email not set"}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {threadData.booking.viewBookingUrl && (
                      <Link
                        href={threadData.booking.viewBookingUrl}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-[#192a3a] hover:bg-gray-50"
                      >
                        View booking
                      </Link>
                    )}
                    {threadData.booking.viewListingUrl && (
                      <Link
                        href={threadData.booking.viewListingUrl}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-[#192a3a] hover:bg-gray-50"
                      >
                        View listing
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
