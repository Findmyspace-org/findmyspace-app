"use client";

import { useEffect, useState } from "react";
import { ownerApiFetch } from "@/lib/owner-api-client";

type SessionRow = {
  id: string;
  date: string;
  startAt: string;
  endAt: string;
  excluded: boolean;
  cancelled?: boolean;
};

type ChangeEvent = {
  id: string;
  actor_role: string | null;
  change_scope: string | null;
  action: string | null;
  reason: string | null;
  financial_effect: string | null;
  agreement_status: string | null;
  notice_text: string | null;
  created_at: string;
};

type PendingRequest = { id: string; status: string; created_at: string };

type PreviewState = {
  sessions: SessionRow[];
  events: ChangeEvent[];
  pendingRequests?: PendingRequest[];
  notice: string | null;
  conflict: string | null;
  paidProtection: string | null;
};

type Props = {
  bookingId: string;
  occurrenceId: string | null;
  occurrenceStart: string;
  occurrenceEnd: string;
  canDecide?: boolean;
  preview?: PreviewState;
  onChanged?: () => void;
};

function localInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
}

export default function SeriesManagementPanel({
  bookingId,
  occurrenceId,
  occurrenceStart,
  occurrenceEnd,
  canDecide = false,
  preview,
  onChanged,
}: Props) {
  const [scope, setScope] = useState("occurrence");
  const [selectedSession, setSelectedSession] = useState(occurrenceId || "");
  const [newStart, setNewStart] = useState(localInput(occurrenceStart));
  const [newEnd, setNewEnd] = useState(localInput(occurrenceEnd));
  const [reason, setReason] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>(preview?.sessions ?? []);
  const [events, setEvents] = useState<ChangeEvent[]>(preview?.events ?? []);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>(preview?.pendingRequests ?? []);
  const [notice, setNotice] = useState<string | null>(preview?.notice ?? null);
  const [conflict, setConflict] = useState<string | null>(preview?.conflict ?? null);
  const [paidProtection, setPaidProtection] = useState<string | null>(preview?.paidProtection ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void (async () => {
      try {
        const [series, history] = await Promise.all([
          ownerApiFetch(`/api/bookings/${bookingId}/recurring-series`) as Promise<{
            sessions?: SessionRow[];
          }>,
          ownerApiFetch(`/api/bookings/${bookingId}/change-events`) as Promise<{
            events?: ChangeEvent[];
            pendingRequests?: PendingRequest[];
          }>,
        ]);
        if (cancelled) return;
        const loaded = series.sessions ?? [];
        setSessions(loaded);
        setEvents(history.events ?? []);
        setPendingRequests(history.pendingRequests ?? []);
        setSelectedSession((current) => current || loaded.find((session) => !session.excluded && !session.cancelled)?.id || "");
      } catch {
        if (!cancelled) setNotice("The schedule could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, preview]);

  async function decide(requestId: string, accept: boolean) {
    if (preview) return;
    setSaving(true);
    setNotice(null);
    setConflict(null);
    try {
      await ownerApiFetch(`/api/bookings/change-requests/${requestId}`, {
        method: "POST",
        body: JSON.stringify({ accept }),
      });
      setNotice(accept ? "The renter accepted the move. The paid total is unchanged." : "The renter declined the move. The original time remains.");
      setPendingRequests((current) => current.filter((request) => request.id !== requestId));
      onChanged?.();
    } catch (error) {
      setConflict(error instanceof Error ? error.message : "The original booking was kept.");
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(requestId: string) {
    if (preview) return;
    setSaving(true);
    setNotice(null);
    setConflict(null);
    try {
      await ownerApiFetch(`/api/bookings/change-requests/${requestId}`, {
        method: "POST",
        body: JSON.stringify({ withdraw: true }),
      });
      setNotice("The proposal was withdrawn. The original time stays reserved.");
      setPendingRequests((current) => current.filter((request) => request.id !== requestId));
      onChanged?.();
    } catch (error) {
      setConflict(error instanceof Error ? error.message : "The proposal was kept.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(action: "reschedule" | "exclude") {
    if (preview) return;
    setSaving(true);
    setNotice(null);
    setConflict(null);
    setPaidProtection(null);
    try {
      const result = (await ownerApiFetch(`/api/bookings/${bookingId}/series-change`, {
        method: "POST",
        body: JSON.stringify({
          action,
          scope,
          occurrenceId: selectedSession || occurrenceId,
          newStart: action === "reschedule" ? new Date(newStart).toISOString() : null,
          newEnd: action === "reschedule" ? new Date(newEnd).toISOString() : null,
          reason,
        }),
      })) as { applied?: boolean; message?: string };
      setNotice(result.message || (result.applied ? "The booking was updated." : "The original booking was kept."));
      onChanged?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The original booking was kept.";
      if (/paid|refund|amount already paid/i.test(message)) setPaidProtection(message);
      else setConflict(message);
    } finally {
      setSaving(false);
    }
  }

  const included = sessions.filter((session) => !session.excluded && !session.cancelled);
  const leftOut = sessions.filter((session) => session.excluded || session.cancelled);

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
      <h3 className="text-sm font-semibold text-[#192a3a]">Manage this recurring booking</h3>
      <p className="text-sm text-gray-700">
        {included.length} included session{included.length === 1 ? "" : "s"}
        {leftOut.length ? `, ${leftOut.length} excluded or cancelled` : ""}. Completed sessions stay as they were.
      </p>
      {sessions.length > 0 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#192a3a]">Session</span>
          <select value={selectedSession} onChange={(event) => setSelectedSession(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5">
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.date}{session.excluded || session.cancelled ? " (not included)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset className="space-y-2 text-sm text-gray-800">
        <legend className="mb-1 font-medium text-[#192a3a]">Which sessions</legend>
        <label className="flex gap-2">
          <input type="radio" name={`${bookingId}-scope`} checked={scope === "occurrence"} onChange={() => setScope("occurrence")} />
          This occurrence only
        </label>
        <label className="flex gap-2">
          <input type="radio" name={`${bookingId}-scope`} checked={scope === "this_and_future"} onChange={() => setScope("this_and_future")} />
          This and all future occurrences
        </label>
        <label className="flex gap-2">
          <input type="radio" name={`${bookingId}-scope`} checked={scope === "series"} onChange={() => setScope("series")} />
          Entire series
        </label>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[#192a3a]">New start</span>
          <input type="datetime-local" value={newStart} onChange={(event) => setNewStart(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-[#192a3a]">New end</span>
          <input type="datetime-local" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#192a3a]">Reason</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving || Boolean(preview)} onClick={() => void submit("reschedule")} className="rounded-md bg-[#192a3a] px-3 py-2 text-sm text-white disabled:opacity-60">
          Check and reschedule
        </button>
        <button type="button" disabled={saving || Boolean(preview)} onClick={() => void submit("exclude")} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] disabled:opacity-60">
          Cancel selected sessions
        </button>
      </div>
      {pendingRequests.map((request) => (
        <div key={request.id} className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          <p>A move is waiting for the renter. Accepting it changes the calendar and leaves the paid total as it is. Declining it keeps the original time.</p>
          {canDecide ? (
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={saving || Boolean(preview)} onClick={() => void decide(request.id, true)} className="rounded-md bg-[#192a3a] px-3 py-1.5 text-white">Accept</button>
              <button type="button" disabled={saving || Boolean(preview)} onClick={() => void decide(request.id, false)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5">Decline</button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p>The renter accepts or declines this from My bookings. This notice is not acceptance.</p>
              <button
                type="button"
                disabled={saving || Boolean(preview)}
                onClick={() => void withdraw(request.id)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5"
              >
                Withdraw proposal
              </button>
            </div>
          )}
        </div>
      ))}
      {notice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</p> : null}
      {conflict ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{conflict}</p> : null}
      {paidProtection ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{paidProtection}</p> : null}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-[#192a3a]">Change history</h4>
        {events.length === 0 ? <p className="text-sm text-gray-600">No changes have been recorded.</p> : null}
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-gray-200 p-3 text-sm text-gray-700">
              <p className="font-medium text-[#192a3a]">{formatWhen(event.created_at)} · {event.actor_role || "User"}</p>
              <p>{event.action || "Change"} · {event.change_scope || "series"}{event.reason ? ` · ${event.reason}` : ""}</p>
              <p>{event.financial_effect || "No financial change"}. {event.agreement_status || "Recorded"}. {event.notice_text || "No customer email was sent."}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
