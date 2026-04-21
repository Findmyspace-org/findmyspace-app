"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  AppliedWhen,
  WhenDatePresetId,
  WhenDurationUnit,
  WhenPresetId,
} from "@/lib/browse-when-filter";
import { formatWhenFilterLabel } from "@/lib/browse-when-filter";

type Props = {
  applied: AppliedWhen | null;
  onApply: (value: AppliedWhen) => void;
  onClear: () => void;
  /** Optional: suggest duration unit when user picks a space type (does not auto-apply). */
  suggestedUnit?: WhenDurationUnit | null;
};

const PRESETS_HOUR: { id: WhenPresetId; label: string }[] = [
  { id: "1h", label: "1 hour" },
  { id: "2h", label: "2 hours" },
  { id: "halfday", label: "Half day" },
  { id: "fullday", label: "Full day" },
];

const PRESETS_DAY: { id: WhenPresetId; label: string }[] = [
  { id: "1d", label: "1 day" },
  { id: "3d", label: "3 days" },
  { id: "1w", label: "1 week" },
];

const PRESETS_MONTH: { id: WhenPresetId; label: string }[] = [
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
];

const DATE_CHIPS: { id: WhenDatePresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "nextweek", label: "Next week" },
];

function defaultDraftFromApplied(
  applied: AppliedWhen | null,
  suggested: WhenDurationUnit | null | undefined
): AppliedWhen {
  const unit =
    applied?.unit ??
    suggested ??
    "day";
  return {
    unit,
    preset: applied?.preset ?? null,
    datePreset: applied?.datePreset ?? null,
    startDate: applied?.startDate ?? null,
    endDate: applied?.endDate ?? null,
  };
}

function presetsForUnit(u: WhenDurationUnit) {
  if (u === "hour") return PRESETS_HOUR;
  if (u === "day") return PRESETS_DAY;
  return PRESETS_MONTH;
}

function presetValidForUnit(
  unit: WhenDurationUnit,
  preset: WhenPresetId | null
): boolean {
  if (!preset) return true;
  return presetsForUnit(unit).some((p) => p.id === preset);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function getQuickWindow(preset: WhenDatePresetId): { startDate: string; endDate: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0 Sun ... 6 Sat

  if (preset === "today") {
    const iso = toIsoDate(today);
    return { startDate: iso, endDate: iso };
  }

  if (preset === "tomorrow") {
    const d = addDays(today, 1);
    const iso = toIsoDate(d);
    return { startDate: iso, endDate: iso };
  }

  if (preset === "weekend") {
    if (day === 6) {
      return { startDate: toIsoDate(today), endDate: toIsoDate(addDays(today, 1)) };
    }
    if (day === 0) {
      const iso = toIsoDate(today);
      return { startDate: iso, endDate: iso };
    }
    const start = addDays(today, 6 - day);
    return { startDate: toIsoDate(start), endDate: toIsoDate(addDays(start, 1)) };
  }

  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const monday = addDays(today, daysUntilMonday);
  const sunday = addDays(monday, 6);
  return { startDate: toIsoDate(monday), endDate: toIsoDate(sunday) };
}

export function BrowseWhenFilter({ applied, onApply, onClear, suggestedUnit }: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppliedWhen>(() =>
    defaultDraftFromApplied(applied, suggestedUnit)
  );

  useEffect(() => {
    if (!open) return;
    setDraft((d) => {
      const base = defaultDraftFromApplied(applied, suggestedUnit);
      if (applied) return { ...base, preset: applied.preset };
      return {
        ...base,
        preset: presetValidForUnit(base.unit, d.preset) ? d.preset : null,
      };
    });
  }, [open, applied, suggestedUnit]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);

  const setUnit = (unit: WhenDurationUnit) => {
    setDraft((d) => ({
      ...d,
      unit,
      preset: presetValidForUnit(unit, d.preset) ? d.preset : null,
    }));
  };

  const triggerLabel = formatWhenFilterLabel(applied);
  const hasApplied = applied !== null;
  const isUsingQuickWindow = Boolean(draft.datePreset);
  const isUsingCustomDates =
    !draft.datePreset && Boolean(draft.startDate || draft.endDate);

  const activeWindowLabel = useMemo(() => {
    if (draft.datePreset === "today") return "Using: Today";
    if (draft.datePreset === "tomorrow") return "Using: Tomorrow";
    if (draft.datePreset === "weekend") return "Using: This weekend";
    if (draft.datePreset === "nextweek") return "Using: Next week";
    if (isUsingCustomDates) return "Using: Custom dates";
    return "Use a quick option or choose exact dates";
  }, [draft.datePreset, isUsingCustomDates]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={panelId}
          className={`flex min-h-[42px] w-full min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
            hasApplied
              ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
              : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
          }`}
        >
          <span className="truncate">{triggerLabel}</span>
          <svg
            className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="When do you need the space?"
          className="absolute right-0 z-50 mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-gray-200/90 bg-white p-4 shadow-lg ring-1 ring-black/5"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            How do you need it?
          </p>
          <div className="mt-2 flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(["hour", "day", "month"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                  draft.unit === u
                    ? "bg-white text-emerald-800 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {u === "hour" ? "Hourly" : u === "day" ? "Daily" : "Monthly"}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            How long do you need it?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {presetsForUnit(draft.unit).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    preset: d.preset === id ? null : id,
                  }))
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                  draft.preset === id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            When do you need it?
          </p>
          <p className="mt-1 text-xs text-gray-500">Quick options</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DATE_CHIPS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setDraft((d) => {
                    if (d.datePreset === id) {
                      return { ...d, datePreset: null, startDate: null, endDate: null };
                    }
                    const range = getQuickWindow(id);
                    return {
                      ...d,
                      datePreset: id,
                      startDate: range.startDate,
                      endDate: range.endDate,
                    };
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                  draft.datePreset === id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-500">Or choose exact dates</p>
          <p className="mt-0.5 text-xs text-gray-500">
            We&apos;ll use this as your booking window
          </p>

          <div
            className={`mt-2 rounded-lg p-2 transition ${
              isUsingCustomDates ? "bg-emerald-50/50 ring-1 ring-emerald-200" : "bg-gray-50/40"
            }`}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="font-medium text-gray-700">Start date</span>
              <input
                type="date"
                value={draft.startDate ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    datePreset: null,
                    startDate: e.target.value || null,
                  }))
                }
                className="rounded-lg border border-gray-200 px-2 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              <span className="font-medium text-gray-700">End date</span>
              <input
                type="date"
                value={draft.endDate ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    datePreset: null,
                    endDate: e.target.value || null,
                  }))
                }
                className="rounded-lg border border-gray-200 px-2 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
            </div>
          </div>

          <p
            className={`mt-2 text-xs ${
              isUsingQuickWindow || isUsingCustomDates ? "text-emerald-700" : "text-gray-500"
            }`}
          >
            {activeWindowLabel}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {hasApplied ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="order-2 text-center text-sm font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline sm:order-1"
              >
                Clear
              </button>
            ) : (
              <span className="hidden sm:block sm:w-16" />
            )}
            <button
              type="button"
              onClick={() => {
                onApply({ ...draft });
                setOpen(false);
              }}
              className="order-1 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:order-2 sm:w-auto"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
