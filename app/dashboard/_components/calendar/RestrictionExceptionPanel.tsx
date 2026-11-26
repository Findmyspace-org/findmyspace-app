"use client";

import { useState } from "react";
import { ownerApiFetch } from "@/lib/owner-api-client";
import type { AvailabilityRule } from "@/lib/availability-rules";

type Props = {
  spaceId: string;
  rule: AvailabilityRule;
  occurrenceStart: string;
  preview?: boolean;
  onChanged?: () => void;
};

function johannesburgDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function RestrictionExceptionPanel({
  spaceId,
  rule,
  occurrenceStart,
  preview = false,
  onChanged,
}: Props) {
  const date = johannesburgDate(occurrenceStart);
  const [localStart, setLocalStart] = useState(rule.localStart || "08:00");
  const [localEnd, setLocalEnd] = useState(rule.localEnd || "12:00");
  const [endDate, setEndDate] = useState(rule.endsOn || "");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function run(work: () => Promise<void>) {
    if (preview) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    setNeedsConfirm(false);
    try {
      await work();
      onChanged?.();
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "The restriction was not changed.";
      setNeedsConfirm(text.includes("exceptions_need_confirmation"));
      setError(text.replace(/^exceptions_need_confirmation:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-amber-200 pt-3">
      <p className="text-sm text-gray-700">
        Opening or changing one date leaves the recurring restriction in place. Later dates stay blocked unless you change them too.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#192a3a]">Reason</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Changed start</span>
          <input type="time" value={localStart} onChange={(event) => setLocalStart(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Changed end</span>
          <input type="time" value={localEnd} onChange={(event) => setLocalEnd(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={saving || preview}
          onClick={() => void run(async () => {
            await ownerApiFetch(`/api/host/spaces/${spaceId}/availability-exceptions`, {
              method: "POST",
              body: JSON.stringify({ ruleId: rule.id, date, action: "open", reason }),
            });
            setMessage(`${date} is open. The restriction remains for the other dates.`);
          })}
          className="rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-[#192a3a] disabled:opacity-60"
        >
          Open this date only
        </button>
        <button
          type="button"
          disabled={saving || preview}
          onClick={() => void run(async () => {
            await ownerApiFetch(`/api/host/spaces/${spaceId}/availability-exceptions`, {
              method: "POST",
              body: JSON.stringify({ ruleId: rule.id, date, action: "override", localStart, localEnd, wholeDay: false, reason }),
            });
            setMessage(`${date} now uses the changed hours. The rest of the restriction is unchanged.`);
          })}
          className="rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-[#192a3a] disabled:opacity-60"
        >
          Change this date only
        </button>
        <button
          type="button"
          disabled={saving || preview}
          onClick={() => void run(async () => {
            await ownerApiFetch(`/api/host/spaces/${spaceId}/availability-exceptions`, {
              method: "POST",
              body: JSON.stringify({
                ruleId: rule.id,
                fromDate: date,
                weekdays: rule.weekdays,
                localStart,
                localEnd,
                wholeDay: false,
                reason,
                confirmIncompatible: needsConfirm,
              }),
            });
            setMessage(`Dates before ${date} keep the original restriction. This date and later dates use the new hours.`);
          })}
          className="rounded-md border border-gray-300 px-3 py-2 text-left text-sm text-[#192a3a] disabled:opacity-60"
        >
          {needsConfirm ? "Confirm and change future dates" : "Change this date and future dates"}
        </button>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-[#192a3a]">End an indefinite restriction</span>
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5" />
      </label>
      <button
        type="button"
        disabled={saving || preview || !endDate}
        onClick={() => void run(async () => {
          await ownerApiFetch(`/api/host/spaces/${spaceId}/availability-rules`, {
            method: "POST",
            body: JSON.stringify({
              id: rule.id,
              reason: rule.reason || "",
              weekdays: rule.weekdays,
              wholeDay: rule.wholeDay,
              localStart: rule.localStart || "",
              localEnd: rule.localEnd || "",
              startsOn: rule.startsOn,
              endsOn: endDate,
              noEnd: false,
            }),
          });
          setMessage(`The restriction now ends on ${endDate}.`);
        })}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] disabled:opacity-60"
      >
        Save end date
      </button>
      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
