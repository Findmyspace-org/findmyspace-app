"use client";

import { useEffect, useId, useState } from "react";
import { addMonths, formatISO } from "date-fns";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  CLOSED_LOST_OUTCOME_CATEGORIES,
  CLOSED_LOST_OUTCOME_LABELS,
  MARKETING_AUDIENCE_MODE_LABELS,
  MARKETING_AUDIENCE_MODES,
  type ClosedLostOutcomeCategory,
  type MarketingAudienceMode,
} from "@/lib/crm-marketing/constants";
import { PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/space-place/constants";
import type { MarketingContactPreview } from "@/lib/crm-marketing/types";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import type { ClosePipelineLostFormPayload } from "@/lib/crm-marketing/types";

type Props = {
  row: CrmOrganisationListRow;
  fromStage: PipelineStage;
  saving?: boolean;
  error?: string | null;
  assignees: { id: string; full_name: string | null }[];
  profileId: string;
  onConfirm: (payload: ClosePipelineLostFormPayload) => void;
  onCancel: () => void;
};

function defaultFollowUpDate(category: ClosedLostOutcomeCategory): string {
  if (category === "not_now") {
    return formatISO(addMonths(new Date(), 3), { representation: "date" });
  }
  return formatISO(addMonths(new Date(), 6), { representation: "date" });
}

export function CrmPipelineClosedLostConfirmation({
  row,
  fromStage,
  saving = false,
  error,
  assignees,
  profileId,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const [lostReason, setLostReason] = useState("");
  const [outcomeCategory, setOutcomeCategory] =
    useState<ClosedLostOutcomeCategory>("not_now");
  const [detailNote, setDetailNote] = useState("");
  const [marketingMode, setMarketingMode] =
    useState<MarketingAudienceMode>("store_only");
  const [contacts, setContacts] = useState<MarketingContactPreview[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(`Revisit ${row.name}`);
  const [taskDueDate, setTaskDueDate] = useState(defaultFollowUpDate("not_now"));
  const [taskOwnerId, setTaskOwnerId] = useState(
    row.assigned_to || profileId
  );
  const [taskContactId, setTaskContactId] = useState(
    row.primary_contact_id || ""
  );
  const [idempotencyKey] = useState(
    () => `close-${row.id}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, saving]);

  useEffect(() => {
    void (async () => {
      setLoadingContacts(true);
      try {
        const json = await adminApiFetch(
          `/api/admin/crm/desktop/pipeline/close-lost?organisationId=${row.id}`
        );
        const list = (json.contacts || []) as MarketingContactPreview[];
        setContacts(list);
        const selectable = list.filter((c) => !c.locked).map((c) => c.id);
        setSelectedContactIds(new Set(selectable));
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, [row.id]);

  function handleOutcomeChange(category: ClosedLostOutcomeCategory) {
    setOutcomeCategory(category);
    setTaskDueDate(defaultFollowUpDate(category));
    if (category === "not_now") setCreateTask(true);
  }

  function toggleContact(id: string, locked: boolean) {
    if (locked) return;
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    if (!lostReason.trim()) return;
    onConfirm({
      idempotencyKey,
      lostReason: lostReason.trim(),
      outcomeCategory,
      detailNote: detailNote.trim() || undefined,
      marketingAudienceMode: marketingMode,
      selectedContactIds:
        marketingMode === "none" ? [] : [...selectedContactIds],
      createFollowUpTask: createTask,
      taskTitle: createTask ? taskTitle.trim() : undefined,
      taskDueDate: createTask ? taskDueDate : undefined,
      taskOwnerId: createTask ? taskOwnerId : undefined,
      taskContactId: createTask ? taskContactId || undefined : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="crm-closed-lost-confirmation"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <h3 id={titleId} className="text-lg font-semibold text-[#192a3a]">
          Closed / Not Now — {row.name}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          From {PIPELINE_STAGE_LABELS[fromStage]} to{" "}
          {PIPELINE_STAGE_LABELS.closed_lost}
        </p>

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Reason (required)</span>
            <textarea
              data-testid="crm-closed-lost-reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
              placeholder="Why is this organisation closed or not now?"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium">Outcome category</span>
            <select
              data-testid="crm-closed-lost-outcome"
              value={outcomeCategory}
              onChange={(e) =>
                handleOutcomeChange(e.target.value as ClosedLostOutcomeCategory)
              }
              className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
            >
              {CLOSED_LOST_OUTCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CLOSED_LOST_OUTCOME_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium">Detail note (optional)</span>
            <textarea
              value={detailNote}
              onChange={(e) => setDetailNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
            />
          </label>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-sm font-semibold">Future communication</legend>
            <div className="mt-2 space-y-2">
              {MARKETING_AUDIENCE_MODES.map((mode) => (
                <label key={mode} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="marketingMode"
                    checked={marketingMode === mode}
                    onChange={() => setMarketingMode(mode)}
                    className="mt-1"
                  />
                  <span>{MARKETING_AUDIENCE_MODE_LABELS[mode]}</span>
                </label>
              ))}
            </div>
            {marketingMode !== "none" ? (
              <div className="mt-3">
                {loadingContacts ? (
                  <p className="text-xs text-gray-500">Loading contacts…</p>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-gray-500">No contacts on this organisation.</p>
                ) : (
                  <ul className="max-h-40 space-y-2 overflow-y-auto">
                    {contacts.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedContactIds.has(c.id)}
                          disabled={c.locked}
                          onChange={() => toggleContact(c.id, c.locked)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-gray-500">
                            {c.role || "No role"} · {c.email || "No email"}
                          </p>
                          <p className="text-gray-500">
                            Marketing: {c.marketingStatus || "none"} · Consent:{" "}
                            {c.consentStatus || "unknown"}
                            {c.unsubscribeAt ? " · Unsubscribed" : ""}
                            {c.suppressedAt ? " · Suppressed" : ""}
                          </p>
                          {c.locked ? (
                            <p className="text-amber-800">
                              Cannot change subscription status from pipeline move
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={createTask}
                onChange={(e) => setCreateTask(e.target.checked)}
              />
              Create a future follow-up task
            </label>
            {createTask ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  Task title
                  <input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  Due date
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  Assigned to
                  <select
                    value={taskOwnerId}
                    onChange={(e) => setTaskOwnerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                  >
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2">
                  Related contact
                  <select
                    value={taskContactId}
                    onChange={(e) => setTaskContactId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
                  >
                    <option value="">Organisation only</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </fieldset>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600" role="alert">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="crm-closed-lost-cancel"
            disabled={saving}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="crm-closed-lost-confirm"
            disabled={saving || !lostReason.trim()}
            onClick={handleSubmit}
            className="rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm move"}
          </button>
        </div>
      </div>
    </div>
  );
}
