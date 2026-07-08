"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMPLETED_ACTIONS_HELPER_TEXT,
  STANDARD_COMPLETED_ACTIONS,
  getStandardCompletedAction,
  quickStandardActionsForScope,
  type CompletedActionScope,
} from "@/lib/crm-desktop/completed-actions";
import {
  createCompletedActionApi,
  fetchCompletedActionState,
  fetchCompletedActions,
  removeCompletedActionApi,
  updateCompletedActionApi,
} from "@/lib/crm-desktop/completed-actions-api";
import type { CrmCompletedActionRow } from "@/lib/crm-desktop/completed-actions-mutations";
import { formatActivityDate } from "@/lib/space-place/format";

type PropertyOption = { id: string; name: string };
type SpaceOption = { id: string; title: string | null; propertyId?: string | null };

type Props = {
  organisationId: string;
  organisationName?: string;
  propertyId?: string | null;
  spaceId?: string | null;
  properties?: PropertyOption[];
  spaces?: SpaceOption[];
  compact?: boolean;
  onChanged?: () => void;
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string) {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function ActionForm({
  organisationId,
  propertyId,
  spaceId,
  properties,
  spaces,
  initial,
  onClose,
  onSaved,
}: {
  organisationId: string;
  propertyId?: string | null;
  spaceId?: string | null;
  properties: PropertyOption[];
  spaces: SpaceOption[];
  initial?: CrmCompletedActionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"standard" | "custom">(
    initial?.is_custom ? "custom" : "standard"
  );
  const [actionKey, setActionKey] = useState(initial?.action_key || "");
  const [customLabel, setCustomLabel] = useState(
    initial?.is_custom ? initial.action_label : ""
  );
  const [note, setNote] = useState(initial?.note || "");
  const [completedLocal, setCompletedLocal] = useState(
    toLocalInputValue(initial?.completed_at || new Date().toISOString())
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initial?.property_id || propertyId || ""
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState(
    initial?.space_id || spaceId || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredSpaces = useMemo(() => {
    if (!selectedPropertyId) return spaces;
    return spaces.filter(
      (s) => !s.propertyId || s.propertyId === selectedPropertyId
    );
  }, [spaces, selectedPropertyId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateCompletedActionApi(initial.id, {
          actionLabel: mode === "custom" ? customLabel : undefined,
          note,
          completedAt: fromLocalInputValue(completedLocal),
          propertyId: selectedPropertyId || null,
          spaceId: selectedSpaceId || null,
        });
      } else {
        await createCompletedActionApi({
          organisationId,
          propertyId: selectedPropertyId || null,
          spaceId: selectedSpaceId || null,
          isCustom: mode === "custom",
          actionKey: mode === "standard" ? actionKey : null,
          actionLabel: mode === "custom" ? customLabel : null,
          note,
          completedAt: fromLocalInputValue(completedLocal),
          source: "crm_desktop",
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold text-[#192a3a]">
          {initial ? "Edit completed action" : "Add completed action"}
        </h3>
        <p className="mt-1 text-sm text-gray-600">{COMPLETED_ACTIONS_HELPER_TEXT}</p>

        {!initial ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("standard")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                mode === "standard" ? "bg-[#192a3a] text-white" : "bg-gray-100"
              }`}
            >
              Standard action
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                mode === "custom" ? "bg-[#192a3a] text-white" : "bg-gray-100"
              }`}
            >
              Custom action
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {mode === "standard" && !initial ? (
            <label className="block text-sm">
              <span className="text-gray-600">Action</span>
              <select
                value={actionKey}
                onChange={(e) => setActionKey(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">Select an action…</option>
                {STANDARD_COMPLETED_ACTIONS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {(mode === "custom" || initial?.is_custom) ? (
            <label className="block text-sm">
              <span className="text-gray-600">Action label</span>
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="e.g. Met the facilities manager"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="text-gray-600">Completed date & time</span>
            <input
              type="datetime-local"
              value={completedLocal}
              max={toLocalInputValue(new Date().toISOString())}
              onChange={(e) => setCompletedLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          {!spaceId ? (
            <label className="block text-sm">
              <span className="text-gray-600">Property (optional)</span>
              <select
                value={selectedPropertyId}
                onChange={(e) => {
                  setSelectedPropertyId(e.target.value);
                  setSelectedSpaceId("");
                }}
                disabled={Boolean(propertyId)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">None</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!spaceId ? (
            <label className="block text-sm">
              <span className="text-gray-600">Space (optional)</span>
              <select
                value={selectedSpaceId}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">None</option>
                {filteredSpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || "Untitled space"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="text-gray-600">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-[#192a3a] px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CrmCompletedActionsPanel({
  organisationId,
  propertyId,
  spaceId,
  properties = [],
  spaces = [],
  compact = false,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<CrmCompletedActionRow[]>([]);
  const [state, setState] = useState<Record<string, CrmCompletedActionRow | null>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "standard" | "custom">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmCompletedActionRow | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const scope: CompletedActionScope = spaceId
    ? "space"
    : propertyId
      ? "property"
      : "organisation";

  const quickActions = useMemo(
    () => quickStandardActionsForScope(scope),
    [scope]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stdState] = await Promise.all([
        fetchCompletedActions({
          organisationId,
          propertyId: propertyId || undefined,
          spaceId: spaceId || undefined,
          q: q || undefined,
          kind,
        }),
        fetchCompletedActionState({
          organisationId,
          propertyId,
          spaceId,
          actionKeys: quickActions.map((a) => a.key),
        }),
      ]);
      setRows(list);
      setState(stdState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [organisationId, propertyId, spaceId, q, kind, quickActions]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDone(key: string) {
    if (state[key]) return;
    setBusyKey(key);
    try {
      await createCompletedActionApi({
        organisationId,
        propertyId: propertyId || null,
        spaceId: spaceId || null,
        actionKey: key,
        source: "crm_desktop_quick",
      });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark as done.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeRow(row: CrmCompletedActionRow) {
    if (
      !window.confirm(
        `Remove completed action “${row.action_label}”? This cannot be undone silently — an audit event will be recorded.`
      )
    ) {
      return;
    }
    setBusyKey(row.id);
    try {
      await removeCompletedActionApi(row.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove.");
    } finally {
      setBusyKey(null);
    }
  }

  const displayRows = compact ? rows.slice(0, 3) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#192a3a]">Completed actions</h3>
          <p className="mt-1 text-xs text-gray-600">{COMPLETED_ACTIONS_HELPER_TEXT}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded-lg bg-[#192a3a] px-3 py-2 text-sm text-white"
        >
          Add completed action
        </button>
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actions…"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="standard">Standard</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Mark as done
        </p>
        <ul className="mt-2 space-y-2">
          {quickActions.map((action) => {
            const recorded = state[action.key];
            return (
              <li
                key={action.key}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium text-[#192a3a]">{action.label}</p>
                  {recorded ? (
                    <p className="text-xs text-gray-500">
                      Recorded · Completed on{" "}
                      {formatActivityDate(recorded.completed_at)}
                      {recorded.completed_by_name
                        ? ` · ${recorded.completed_by_name}`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Optional — not recorded yet</p>
                  )}
                </div>
                {recorded ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    Recorded
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyKey === action.key}
                    onClick={() => void markDone(action.key)}
                    className="rounded-lg border border-[#192a3a] px-3 py-1.5 text-xs font-medium text-[#192a3a] disabled:opacity-50"
                  >
                    Mark as done
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-500">Loading completed actions…</p>
      ) : (
        <ul className="space-y-2">
          {displayRows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-[#192a3a]">{row.action_label}</p>
                  <p className="text-xs text-gray-500">
                    Completed on {formatActivityDate(row.completed_at)}
                    {row.completed_by_name ? ` · ${row.completed_by_name}` : ""}
                    {row.is_custom ? " · Custom" : ""}
                  </p>
                  {row.property_name || row.space_title ? (
                    <p className="mt-1 text-xs text-gray-600">
                      {[row.property_name, row.space_title].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {row.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-gray-700">{row.note}</p>
                  ) : null}
                </div>
                {!compact ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-[#192a3a] underline"
                      onClick={() => {
                        setEditing(row);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      disabled={busyKey === row.id}
                      onClick={() => void removeRow(row)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          {!displayRows.length ? (
            <li className="text-sm text-gray-500">No completed actions yet.</li>
          ) : null}
        </ul>
      )}

      {compact && rows.length > 3 ? (
        <p className="text-xs text-gray-500">
          Showing latest 3 of {rows.length}. Open the Completed actions tab to view all.
        </p>
      ) : null}

      {formOpen ? (
        <ActionForm
          organisationId={organisationId}
          propertyId={propertyId}
          spaceId={spaceId}
          properties={properties}
          spaces={spaces}
          initial={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            void load();
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}

export function CrmCompletedActionsSummaryCard({
  organisationId,
  onViewAll,
}: {
  organisationId: string;
  onViewAll: () => void;
}) {
  const [rows, setRows] = useState<CrmCompletedActionRow[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    void fetchCompletedActions({ organisationId })
      .then((list) => {
        setRows(list.slice(0, 3));
        setTotal(list.length);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      });
  }, [organisationId]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Completed actions</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm text-[#c1121f] hover:underline"
        >
          View all
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">{total} recorded</p>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.id}>
            {row.action_label}
            <span className="text-gray-500">
              {" "}
              · {formatActivityDate(row.completed_at)}
            </span>
          </li>
        ))}
        {!rows.length ? (
          <li className="text-gray-500">No completed actions yet.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** Tiny helper for property/space admin menus */
export function completedActionHref(input: {
  organisationId: string;
  propertyId?: string;
  spaceId?: string;
}) {
  const params = new URLSearchParams({ tab: "completed" });
  if (input.propertyId) params.set("propertyId", input.propertyId);
  if (input.spaceId) params.set("spaceId", input.spaceId);
  return `/admin/crm/organisations/${input.organisationId}?${params.toString()}`;
}

export function standardActionLabel(key: string) {
  return getStandardCompletedAction(key)?.label || key;
}
