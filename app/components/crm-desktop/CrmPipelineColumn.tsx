"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/space-place/constants";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { CrmPipelineCard } from "./CrmPipelineCard";

type Props = {
  stage: PipelineStage;
  rows: CrmOrganisationListRow[];
  count: number;
  collapsed?: boolean;
  isDragActive?: boolean;
  isDropTarget?: boolean;
  onToggleCollapse?: () => void;
  onOpenCard: (row: CrmOrganisationListRow) => void;
  onRefresh?: () => void;
  dragEnabled?: boolean;
};

export function CrmPipelineColumn({
  stage,
  rows,
  count,
  collapsed = false,
  isDragActive = false,
  isDropTarget = false,
  onToggleCollapse,
  onOpenCard,
  onRefresh,
  dragEnabled = true,
}: Props) {
  const { setNodeRef, isOver: droppableOver } = useDroppable({
    id: stage,
    data: { stage, type: "column" },
  });

  const highlight = isDropTarget || droppableOver;
  const isTerminal = stage === "closed_lost";
  const showBody = !collapsed || isDragActive || highlight;

  return (
    <section
      data-pipeline-stage={stage}
      aria-label={`${PIPELINE_STAGE_LABELS[stage]} column, ${count} organisations`}
      className={`flex w-[280px] shrink-0 flex-col rounded-lg border ${
        highlight
          ? "border-[#c1121f]/50 bg-[#c1121f]/5 ring-2 ring-[#c1121f]/20"
          : isTerminal
            ? "border-gray-300 bg-gray-100"
            : "border-gray-200 bg-gray-50/80"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-200/80 px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700">
            {PIPELINE_STAGE_LABELS[stage]}
          </h3>
          <p className="text-[11px] text-gray-500">
            {count} organisation{count === 1 ? "" : "s"}
          </p>
        </div>
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded p-1 text-gray-500 hover:bg-white"
            aria-label={collapsed ? "Expand column" : "Collapse column"}
          >
            {collapsed && !showBody ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </header>

      {/* Always mount droppable zone so collapsed terminal column accepts drops */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 p-2 ${
          showBody ? "overflow-y-auto" : "min-h-[72px]"
        }`}
        style={showBody ? { maxHeight: "calc(100vh - 280px)" } : undefined}
        aria-label={`${PIPELINE_STAGE_LABELS[stage]} drop zone`}
      >
        {collapsed && !showBody ? (
          <p className="flex min-h-[56px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-white/70 px-2 text-center text-[11px] text-gray-500">
            {highlight ? "Release to move here" : "Expand or drop here"}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-white/60 px-2 py-6 text-center text-xs text-gray-400">
            Drop organisations here
          </p>
        ) : (
          rows.map((row) => (
            <CrmPipelineCard
              key={row.id}
              row={row}
              onOpen={onOpenCard}
              onRefresh={onRefresh}
              dragEnabled={dragEnabled}
            />
          ))
        )}
      </div>
    </section>
  );
}
