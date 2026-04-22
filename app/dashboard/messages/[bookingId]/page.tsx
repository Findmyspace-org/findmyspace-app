"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail, Phone, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import { broadcastInboxRefresh } from "@/lib/inbox-refresh";

type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
};

type ThreadPayload = {
  messages: BookingMessage[];
  viewerRole: "renter" | "owner";
  counterpartyContact: { email: string | null; phone: string | null };
  booking: {
    id: string;
    space_id: string;
    renter_id: string;
    owner_id: string;
    status: string | null;
    payment_status: string | null;
    start_at: string | null;
    end_at: string | null;
    booking_unit: string | null;
  };
  space: { id: string; title: string | null } | null;
};

export default function MessageThreadPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = typeof params?.bookingId === "string" ? params.bookingId : "";

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [data, setData] = useState<ThreadPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const markRead = useCallback(async () => {
    if (!bookingId) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/notifications/read-for-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      });
      broadcastInboxRefresh();
    } catch {
      /* non-fatal */
    }
  }, [bookingId]);

  const loadThread = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSessionUserId(user?.id || null);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in.");
        setData(null);
        return;
      }

      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json()) as ThreadPayload & { error?: string };
      if (!res.ok) {
        setError(json.error || "Could not load this conversation.");
        setData(null);
        return;
      }
      setError("");
      setData(json);
      void markRead();
    } catch {
      setError("Could not load this conversation.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId, markRead]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !bookingId) return;
    setSending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error || "Send failed.");
        return;
      }
      setError("");
      setDraft("");
      await loadThread();
      broadcastInboxRefresh();
    } catch {
      setError("Send failed.");
    } finally {
      setSending(false);
    }
  }

  const bookingHref =
    data?.viewerRole === "renter"
      ? `/dashboard/my-bookings/${bookingId}/pay`
      : "/dashboard/requests";

  const listingHref = data?.space?.id ? `/spaces/${data.space.id}` : null;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-4 py-6 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => router.push("/dashboard/messages")}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#192a3a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All messages
          </button>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Loading conversation…
            </div>
          ) : error && !data ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : data ? (
            <>
              <div className="mb-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                <h1 className="text-xl font-semibold">
                  {data.space?.title || "Booking conversation"}
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  {data.viewerRole === "renter" ? "Messaging the host" : "Messaging the renter"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={bookingHref}
                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
                  >
                    View booking
                  </Link>
                  {listingHref ? (
                    <Link
                      href={listingHref}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
                    >
                      View listing
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="mb-4 grid gap-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
                <div className="flex items-start gap-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <div>
                    <p className="text-xs font-medium text-gray-500">Email</p>
                    <p className="break-all text-[#192a3a]">
                      {data.counterpartyContact?.email || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <div>
                    <p className="text-xs font-medium text-gray-500">Phone</p>
                    <p className="text-[#192a3a]">{data.counterpartyContact?.phone || "—"}</p>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mb-3 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mb-4 max-h-[50vh] space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                {(data.messages || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No messages yet.</p>
                ) : (
                  data.messages.map((item) => {
                    const isMine = item.sender_id === sessionUserId;
                    return (
                      <div
                        key={item.id}
                        className={`max-w-[90%] rounded-md px-3 py-2 text-sm ${
                          isMine
                            ? "ml-auto bg-[#192a3a] text-white"
                            : "mr-auto border border-gray-200 bg-gray-50 text-[#192a3a]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{item.message}</p>
                        <p
                          className={`mt-1 text-[11px] ${isMine ? "text-gray-200" : "text-gray-500"}`}
                        >
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : ""}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(e) => void handleSend(e)}
                className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
              >
                <label htmlFor="thread-reply" className="sr-only">
                  Message
                </label>
                <textarea
                  id="thread-reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a]"
                  placeholder="Write a message…"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-[#192a3a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  Send
                </button>
              </form>
            </>
          ) : null}
        </div>
      </main>
    </RequireAuth>
  );
}
