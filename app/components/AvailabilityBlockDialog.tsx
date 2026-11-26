"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  describeAvailabilityRule,
  emptyAvailabilityRuleDraft,
  parseAvailabilityRuleDraft,
  weekdaysPreset,
  type AvailabilityRule,
  type AvailabilityRuleDraft,
} from "@/lib/availability-rules";

const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

type OnceInputType = "datetime-local" | "date" | "month";

export default function AvailabilityBlockDialog({
  open,
  spaceTitle,
  saving,
  error,
  onceStart,
  onceEnd,
  onceInputType,
  reason,
  onReasonChange,
  onOnceStartChange,
  onOnceEndChange,
  onClose,
  onSaveOnce,
  onSaveRecurring,
  editingRule = null,
  embedded = false,
}: {
  open: boolean;
  spaceTitle: string;
  saving: boolean;
  error: string;
  onceStart: string;
  onceEnd: string;
  onceInputType: OnceInputType;
  reason: string;
  onReasonChange: (value: string) => void;
  onOnceStartChange: (value: string) => void;
  onOnceEndChange: (value: string) => void;
  onClose: () => void;
  onSaveOnce: () => void;
  onSaveRecurring: (rule: AvailabilityRule) => void;
  editingRule?: AvailabilityRule | null;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<"once" | "recurring">(editingRule ? "recurring" : "once");
  const [draft, setDraft] = useState<AvailabilityRuleDraft>(emptyAvailabilityRuleDraft());
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingRule) {
      setMode("recurring");
      setDraft({
        reason: editingRule.reason || "",
        weekdays: editingRule.weekdays,
        wholeDay: editingRule.wholeDay,
        localStart: editingRule.localStart || "08:00",
        localEnd: editingRule.localEnd || "15:00",
        startsOn: editingRule.startsOn,
        endsOn: editingRule.endsOn || "",
        noEnd: !editingRule.endsOn,
      });
    } else {
      setMode("once");
      setDraft(emptyAvailabilityRuleDraft(onceStart.slice(0, 10)));
    }
    setLocalError("");
  }, [editingRule, open, onceStart]);

  const summary = useMemo(() => {
    const parsed = parseAvailabilityRuleDraft({ ...draft, reason }, "preview");
    return parsed.ok ? describeAvailabilityRule(parsed.rule) : "";
  }, [draft, reason]);

  if (!open) return null;

  function toggleDay(day: number) {
    setDraft((current) => {
      const selected = current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day];
      return { ...current, weekdays: selected.sort((a, b) => a - b) };
    });
  }

  function saveRecurring() {
    const parsed = parseAvailabilityRuleDraft(
      { ...draft, reason },
      editingRule?.spaceId || "space",
      editingRule?.id || ""
    );
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError("");
    onSaveRecurring(parsed.rule);
  }

  const panel = (
    <div
      role="dialog"
      aria-modal={!embedded}
      aria-labelledby="availability-block-title"
      className={
        embedded
          ? "w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          : "fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,820px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            Block availability
          </p>
          <h3 id="availability-block-title" className="mt-1 text-lg font-semibold text-[#192a3a]">
            {spaceTitle || "Untitled space"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(error || localError) && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {localError || error}
        </div>
      )}

      {!editingRule && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("once")}
            className={`rounded-md border px-3 py-2 text-sm ${
              mode === "once" ? "border-[#192a3a] bg-[#192a3a] text-white" : "border-gray-300 bg-white"
            }`}
          >
            Once-off
          </button>
          <button
            type="button"
            onClick={() => setMode("recurring")}
            className={`rounded-md border px-3 py-2 text-sm ${
              mode === "recurring" ? "border-[#192a3a] bg-[#192a3a] text-white" : "border-gray-300 bg-white"
            }`}
          >
            Recurring
          </button>
        </div>
      )}

      {mode === "once" ? (
        <div className="mt-4 grid gap-4">
          <label className="block text-sm font-medium text-[#192a3a]">
            Start
            <input
              type={onceInputType}
              value={onceStart}
              onChange={(event) => onOnceStartChange(event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
            />
          </label>
          <label className="block text-sm font-medium text-[#192a3a]">
            End
            <input
              type={onceInputType}
              value={onceEnd}
              onChange={(event) => onOnceEndChange(event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
            />
          </label>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[#192a3a]">Days</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs" onClick={() => setDraft((current) => ({ ...current, weekdays: weekdaysPreset("weekdays") }))}>
                Weekdays
              </button>
              <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs" onClick={() => setDraft((current) => ({ ...current, weekdays: weekdaysPreset("weekends") }))}>
                Weekends
              </button>
              <button type="button" className="rounded-md border border-gray-300 px-2 py-1 text-xs" onClick={() => setDraft((current) => ({ ...current, weekdays: weekdaysPreset("every-day") }))}>
                Every day
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const selected = draft.weekdays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      selected ? "border-[#192a3a] bg-[#192a3a] text-white" : "border-gray-300 bg-white"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#192a3a]">
            <input
              type="checkbox"
              checked={draft.wholeDay}
              onChange={(event) => setDraft((current) => ({ ...current, wholeDay: event.target.checked }))}
            />
            Whole day
          </label>

          {!draft.wholeDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-[#192a3a]">
                Start time
                <input
                  type="time"
                  value={draft.localStart}
                  onChange={(event) => setDraft((current) => ({ ...current, localStart: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium text-[#192a3a]">
                End time
                <input
                  type="time"
                  value={draft.localEnd}
                  onChange={(event) => setDraft((current) => ({ ...current, localEnd: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          <label className="block text-sm font-medium text-[#192a3a]">
            Starts
            <input
              type="date"
              value={draft.startsOn}
              onChange={(event) => setDraft((current) => ({ ...current, startsOn: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[#192a3a]">
            <input
              type="checkbox"
              checked={draft.noEnd}
              onChange={(event) => setDraft((current) => ({ ...current, noEnd: event.target.checked }))}
            />
            No end date — until manually changed
          </label>

          {!draft.noEnd && (
            <label className="block text-sm font-medium text-[#192a3a]">
              Last date
              <input
                type="date"
                value={draft.endsOn}
                onChange={(event) => setDraft((current) => ({ ...current, endsOn: event.target.value }))}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          {summary && (
            <p className="rounded-md border border-gray-200 bg-[#f8fafb] px-3 py-2 text-sm text-[#192a3a]">
              {summary}
            </p>
          )}
        </div>
      )}

      <label className="mt-4 block text-sm font-medium text-[#192a3a]">
        Reason for blocking
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={3}
          disabled={saving}
          placeholder="School day, service, maintenance, or another reason"
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
        />
      </label>

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-[#192a3a] hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={mode === "once" ? onSaveOnce : saveRecurring}
          className="rounded-md bg-[#192a3a] px-4 py-2 text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : mode === "once" ? "Block availability" : editingRule ? "Save changes" : "Save restriction"}
        </button>
      </div>
    </div>
  );

  if (embedded) return panel;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { if (!saving) onClose(); }} />
      {panel}
    </>
  );
}
