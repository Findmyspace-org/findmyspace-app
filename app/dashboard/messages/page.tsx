"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

export type MessageThreadSummary = {
  bookingId: string;
  spaceId: string;
  listingTitle: string;
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

export default function MessagesInboxPage() {
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadThreads();
  }, []);

  async function loadThreads() {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in to view messages.");
        setThreads([]);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/bookings/message-threads", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json()) as { threads?: MessageThreadSummary[]; error?: string };
      if (!res.ok) {
        setError(json.error || "Could not load conversations.");
        setThreads([]);
        return;
      }
      setThreads(json.threads || []);
    } catch {
      setError("Could not load conversations.");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }

  function formatWhen(iso: string | null) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "";
    }
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-4 py-8 text-[#192a3a] sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/dashboard/comms"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] underline-offset-2 hover:text-[#0f172a] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Comms Center
          </Link>
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
              <p className="text-sm text-gray-600">
                Conversations for bookings where messaging is unlocked (after payment confirmation).
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
              Loading conversations…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-600">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden />
              <p>No active message threads yet.</p>
              <p className="mt-2">
                After a booking is paid and confirmed, you can message the other party from{" "}
                <Link href="/dashboard/my-bookings" className="font-medium text-[#192a3a] underline">
                  My bookings
                </Link>{" "}
                or{" "}
                <Link href="/dashboard/requests" className="font-medium text-[#192a3a] underline">
                  Requests
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
              {threads.map((t) => (
                <li key={t.bookingId}>
                  <Link
                    href={`/dashboard/messages/${t.bookingId}`}
                    className="flex gap-3 px-4 py-4 transition hover:bg-gray-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#192a3a]/10 text-[#192a3a]">
                      <MessageSquare className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="truncate font-medium text-[#192a3a]">{t.listingTitle}</p>
                        <time
                          className="shrink-0 text-xs text-gray-500"
                          dateTime={t.lastMessageAt || undefined}
                        >
                          {formatWhen(t.lastMessageAt)}
                        </time>
                      </div>
                      <p className="truncate text-sm text-gray-600">
                        {t.viewerRole === "renter" ? "Host" : "Renter"}: {t.otherPartyName}
                        {t.location ? ` · ${t.location}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-700">
                        {t.lastMessagePreview ? (
                          t.lastMessagePreview
                        ) : (
                          <span className="italic text-gray-500">No messages yet — say hello</span>
                        )}
                      </p>
                    </div>
                    {t.unreadCount > 0 ? (
                      <span className="mt-1 inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 px-2 text-xs font-semibold text-white">
                        {t.unreadCount > 9 ? "9+" : t.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
