"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type {
  AppliedWhen,
  WhenDatePresetId,
  WhenDurationUnit,
  WhenPresetId,
} from "@/lib/browse-when-filter";
import { formatWhenFilterLabel } from "@/lib/browse-when-filter";
import type { BrowsePanelSignal } from "@/lib/browse-availability-signals";

type Props = {
  applied: AppliedWhen | null;
  onApply: (value: AppliedWhen) => void;
  onClear: () => void;
  availabilitySignal?: BrowsePanelSignal | null;
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

export function BrowseWhenFilter({
  applied,
  onApply,
  onClear,
  availabilitySignal,
  suggestedUnit,
}: Props) {
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
  const applyButtonLabel = useMemo(() => {
    if (draft.datePreset === "today") return "Apply (Today)";
    if (draft.datePreset === "tomorrow") return "Apply (Tomorrow)";
    if (draft.datePreset === "weekend") return "Apply (This weekend)";
    if (draft.datePreset === "nextweek") return "Apply (Next week)";

    if (draft.startDate && draft.endDate) {
      const start = new Date(draft.startDate + "T12:00:00");
      const end = new Date(draft.endDate + "T12:00:00");
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const s = start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
        const e = end.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
        return `Apply (${s} – ${e})`;
      }
    }

    if (draft.unit === "month" && draft.preset) {
      const map: Record<WhenPresetId, string> = {
        "1h": "1 hour",
        "2h": "2 hours",
        halfday: "Half day",
        fullday: "Full day",
        "1d": "1 day",
        "3d": "3 days",
        "1w": "1 week",
        "1m": "1 month",
        "3m": "3 months",
        "6m": "6 months",
        "1y": "1 year",
      };
      if (map[draft.preset]) return `Apply (${map[draft.preset]})`;
    }

    return "Apply filters";
  }, [draft.datePreset, draft.endDate, draft.preset, draft.startDate, draft.unit]);

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
          className="absolute right-0 z-50 mt-2 flex max-h-[80vh] w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-lg ring-1 ring-black/5"
        >
          <div className="overflow-y-auto p-4">
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

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                      ? "border-gray-400 bg-gray-100 text-gray-900 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                      ? "border-gray-400 bg-gray-100 text-gray-900 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-gray-200/70 pt-4">
              <p className="text-xs text-gray-600">Dates</p>
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

            {availabilitySignal ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-700">{availabilitySignal.text}</p>
                    {availabilitySignal.suggestion ? (
                      <p className="mt-1 text-xs text-slate-600">{availabilitySignal.suggestion}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 z-10 mt-1 flex items-center justify-between gap-3 border-t border-gray-200/80 bg-white px-4 py-3">
            <button
              type="button"
              onClick={() => {
                onClear();
                setDraft({
                  unit: suggestedUnit ?? "day",
                  preset: null,
                  datePreset: null,
                  startDate: null,
                  endDate: null,
                });
              }}
              className="text-center text-sm font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onApply({ ...draft });
                setOpen(false);
              }}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-auto"
            >
              {applyButtonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
