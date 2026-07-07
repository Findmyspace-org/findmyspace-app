"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, MapPin, Plus, User } from "lucide-react";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import {
  buildOrganisationQualityIndicators,
  CrmQualityIndicators,
} from "./CrmQualityIndicators";
import { CrmOverdueBadge } from "./CrmStatusBadge";
import { organisationRowToActionContext } from "./crm-action-context";
import { useCrmQuickAction } from "./CrmQuickActionProvider";
import { formatActivityDate, formatDueDate } from "@/lib/space-place/format";
import { isCrmTaskOverdue } from "@/lib/space-place/next-task";
import { isValidSmartReorderTarget } from "@/lib/crm-desktop/pipeline-ordering";

type Props = {
  row: CrmOrganisationListRow;
  onOpen: (row: CrmOrganisationListRow) => void;
  onRefresh?: () => void;
  dragEnabled?: boolean;
  isDragOverlay?: boolean;
  activeRow?: CrmOrganisationListRow | null;
  sortMode?: "smart" | "manual";
};

export function CrmPipelineCard({
  row,
  onOpen,
  onRefresh,
  dragEnabled = true,
  isDragOverlay = false,
  activeRow = null,
  sortMode = "smart",
}: Props) {
  const { openQuickAction } = useCrmQuickAction();
  const ctx = organisationRowToActionContext(row);
  const indicators = buildOrganisationQualityIndicators(row);
  const actionTitle = row.next_action_title ?? row.next_task_title;
  const actionDate = row.next_action_date ?? row.next_task_due;
  const overdue =
    actionDate && actionTitle && isCrmTaskOverdue(actionDate, "open");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: row.id,
    data: { row, type: "card", stage: row.pipeline_stage },
    disabled: !dragEnabled || isDragOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isDragOverlay ? 0.35 : 1,
  };

  const validSmartTarget =
    sortMode !== "smart" ||
    !activeRow ||
    activeRow.id === row.id ||
    isValidSmartReorderTarget(activeRow, row);
  const showDropHighlight = isOver && validSmartTarget;

  return (
    <article
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      data-organisation-id={row.id}
      aria-label={`${row.name}, ${row.pipeline_stage.replace(/_/g, " ")}`}
      className={`rounded-lg border bg-white p-3 shadow-sm transition ${
        isDragOverlay
          ? "border-[#c1121f]/30 shadow-lg"
          : showDropHighlight
            ? "border-[#c1121f]/40 ring-2 ring-[#c1121f]/15"
            : isDragging
              ? "border-[#c1121f]/40 shadow-md"
              : "border-gray-200 hover:border-[#c1121f]/25"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-drag-handle
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
          aria-label="Drag organisation card"
          {...listeners}
          {...attributes}
        >
          <span className="block text-xs leading-none text-gray-400">⋮⋮</span>
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => {
              if (isDragging) return;
              onOpen(row);
            }}
            className="block w-full text-left"
          >
            <h4 className="text-sm font-semibold leading-snug text-[#192a3a]">
              {row.name}
            </h4>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
            {row.type ? (
              <span className="inline-flex items-center gap-0.5 capitalize">
                <Building2 className="h-3 w-3" />
                {row.type}
              </span>
            ) : null}
            {row.address ? (
              <span className="inline-flex items-center gap-0.5 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {row.address}
              </span>
            ) : null}
          </div>
          {row.primary_contact_name ? (
            <p className="mt-1.5 text-xs text-gray-600">
              <User className="mr-0.5 inline h-3 w-3" />
              {row.primary_contact_name}
              {row.primary_contact_role ? (
                <span className="text-gray-400"> · {row.primary_contact_role}</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-700">No primary contact</p>
          )}
          <p className="mt-1 text-[11px] text-gray-500">
            Owner: {row.assigned_name || "Unassigned"}
          </p>
          {row.last_interaction_at ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">
              {formatActivityDate(row.last_interaction_at)}
              {row.last_interaction_summary
                ? ` · ${row.last_interaction_summary}`
                : ""}
            </p>
          ) : null}
          <div className="mt-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
            {actionTitle ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.next_task_id) {
                    openQuickAction("edit_task", ctx, onRefresh);
                  } else {
                    openQuickAction(
                      "add_task",
                      { ...ctx, prefillTaskTitle: actionTitle },
                      onRefresh
                    );
                  }
                }}
                className="block w-full text-left"
              >
                <p className="text-xs font-medium text-[#192a3a]">{actionTitle}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {actionDate ? (
                    <span className="text-[11px] text-gray-500">
                      {formatDueDate(actionDate)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">No dated action</span>
                  )}
                  {overdue ? <CrmOverdueBadge /> : null}
                </div>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">No dated action</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openQuickAction(
                      "add_task",
                      {
                        ...ctx,
                        prefillTaskTitle: `Follow up: ${row.name}`,
                      },
                      onRefresh
                    );
                  }}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#c1121f] hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add task
                </button>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              {row.space_count} space{row.space_count === 1 ? "" : "s"}
            </span>
            <CrmQualityIndicators
              items={indicators}
              onIndicatorClick={(action) =>
                openQuickAction(action, ctx, onRefresh)
              }
            />
          </div>
        </div>
      </div>
    </article>
  );
}

/** Static card preview used in drag overlay. */
export function CrmPipelineCardPreview({ row }: { row: CrmOrganisationListRow }) {
  return <CrmPipelineCard row={row} onOpen={() => {}} isDragOverlay dragEnabled={false} />;
}
