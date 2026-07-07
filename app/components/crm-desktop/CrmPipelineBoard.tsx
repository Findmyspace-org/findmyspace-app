"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/space-place/constants";
import type {
  CrmOrganisationListRow,
  CrmPipelineStageCounts,
} from "@/lib/crm-desktop/types";
import { CrmPipelineColumn } from "./CrmPipelineColumn";
import { CrmPipelineCardPreview } from "./CrmPipelineCard";
import { CrmPipelineCardDrawer } from "./CrmPipelineCardDrawer";
import { CrmPipelineClosedLostConfirmation } from "./CrmPipelineClosedLostConfirmation";
import {
  sortPipelineBoardRows,
  type CrmPipelineBoardSortMode,
} from "@/lib/crm-desktop/pipeline-ordering";
import { useCrmPipelineDrag } from "./useCrmPipelineDrag";
import { useCrmQuickAction } from "./CrmQuickActionProvider";
import { organisationRowToActionContext } from "./crm-action-context";
import { useSpacePlace } from "@/app/space-place/SpacePlaceContext";
import { fetchCrmDesktopProfiles } from "@/lib/crm-desktop/api-client";

type Props = {
  rows: CrmOrganisationListRow[];
  stageCounts: CrmPipelineStageCounts;
  loading?: boolean;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  onRowsChange: React.Dispatch<React.SetStateAction<CrmOrganisationListRow[]>>;
  sortMode?: CrmPipelineBoardSortMode;
};

const TERMINAL_STAGE: PipelineStage = "closed_lost";

export function CrmPipelineBoard({
  rows,
  stageCounts,
  loading = false,
  total,
  hasMore,
  onLoadMore,
  onRefresh,
  onRowsChange,
  sortMode = "smart",
}: Props) {
  const { profile } = useSpacePlace();
  const { openQuickAction } = useCrmQuickAction();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSnapshot = useRef({ left: 0, top: 0 });
  const [selectedRow, setSelectedRow] = useState<CrmOrganisationListRow | null>(null);
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [assignees, setAssignees] = useState<
    { id: string; full_name: string | null }[]
  >([]);

  useEffect(() => {
    void fetchCrmDesktopProfiles().then(setAssignees);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const dragEnabled = !isMobile;

  const {
    activeRow,
    pendingMove,
    saving,
    moveError,
    noTaskPromptOrgId,
    clearNoTaskPrompt,
    clearMoveError,
    onDragStart,
    onDragOver,
    onDragEnd,
    confirmClosedLost,
    cancelPendingMove,
  } = useCrmPipelineDrag({
    rows,
    setRows: onRowsChange,
    profileId: profile?.id,
    onMoveComplete: () => {
      const el = scrollRef.current;
      if (el) {
        scrollSnapshot.current = { left: el.scrollLeft, top: el.scrollTop };
      }
      onRefresh();
    },
    dragEnabled,
    sortMode,
    onDragOverStage: (stage) => {
      setDragOverStage(stage);
      if (stage === TERMINAL_STAGE) setTerminalCollapsed(false);
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = scrollSnapshot.current.left;
    el.scrollTop = scrollSnapshot.current.top;
  }, [rows, stageCounts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, CrmOrganisationListRow[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage, []);
    for (const row of rows) {
      const stage = row.pipeline_stage as PipelineStage;
      const list = map.get(stage) || [];
      list.push(row);
      map.set(stage, list);
    }
    for (const stage of PIPELINE_STAGES) {
      const list = map.get(stage) || [];
      map.set(stage, sortPipelineBoardRows(list, sortMode));
    }
    return map;
  }, [rows, sortMode]);

  const noTaskPromptRow = useMemo(
    () => rows.find((r) => r.id === noTaskPromptOrgId) ?? null,
    [rows, noTaskPromptOrgId]
  );

  const handleOpenCard = useCallback((row: CrmOrganisationListRow) => {
    setSelectedRow(row);
  }, []);

  const handleRowPatched = useCallback(
    (patched: CrmOrganisationListRow) => {
      onRowsChange((current) =>
        current.map((row) => (row.id === patched.id ? patched : row))
      );
    },
    [onRowsChange]
  );

  const activeStages = PIPELINE_STAGES.filter((s) => s !== TERMINAL_STAGE);
  const terminalStages = PIPELINE_STAGES.filter((s) => s === TERMINAL_STAGE);
  const isDragActive = Boolean(activeRow);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div ref={scrollRef} className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {activeStages.map((stage) => (
              <CrmPipelineColumn
                key={stage}
                stage={stage}
                rows={byStage.get(stage) || []}
                count={stageCounts[stage] ?? (byStage.get(stage)?.length || 0)}
                isDragActive={isDragActive}
                isDropTarget={dragOverStage === stage}
                onOpenCard={handleOpenCard}
                onRowPatched={handleRowPatched}
                onRefresh={onRefresh}
                dragEnabled={dragEnabled}
                activeRow={activeRow}
                sortMode={sortMode}
              />
            ))}
            {terminalStages.map((stage) => (
              <CrmPipelineColumn
                key={stage}
                stage={stage}
                rows={byStage.get(stage) || []}
                count={stageCounts[stage] ?? (byStage.get(stage)?.length || 0)}
                collapsed={terminalCollapsed && dragOverStage !== stage}
                isDragActive={isDragActive}
                isDropTarget={dragOverStage === stage}
                onToggleCollapse={() => setTerminalCollapsed((v) => !v)}
                onOpenCard={handleOpenCard}
                onRowPatched={handleRowPatched}
                onRefresh={onRefresh}
                dragEnabled={dragEnabled}
                activeRow={activeRow}
                sortMode={sortMode}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeRow ? <CrmPipelineCardPreview row={activeRow} /> : null}
        </DragOverlay>
      </DndContext>

      {isMobile ? (
        <p className="text-xs text-gray-500" role="status">
          Drag and drop is limited on small screens. Use quick actions to change pipeline stage.
        </p>
      ) : null}

      {moveError && !pendingMove ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {moveError}{" "}
          <button
            type="button"
            onClick={clearMoveError}
            className="font-medium underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">Loading pipeline…</p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            Load more ({rows.length} of {total})
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-gray-400">
          Showing {rows.length} of {total} organisations
        </p>
      )}

      {noTaskPromptRow ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No next task is scheduled for{" "}
          <span className="font-medium">{noTaskPromptRow.name}</span>.{" "}
          <button
            type="button"
            onClick={() => {
              openQuickAction(
                "add_task",
                {
                  ...organisationRowToActionContext(noTaskPromptRow),
                  prefillTaskTitle: `Follow up: ${noTaskPromptRow.name}`,
                },
                () => {
                  clearNoTaskPrompt();
                  onRefresh();
                }
              );
            }}
            className="font-semibold text-[#c1121f] hover:underline"
          >
            Add one now?
          </button>
          <button
            type="button"
            onClick={clearNoTaskPrompt}
            className="ml-3 text-gray-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <CrmPipelineCardDrawer
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onRefresh={onRefresh}
        onRowPatched={(patched) => {
          onRowsChange((current) =>
            current.map((item) => (item.id === patched.id ? patched : item))
          );
          setSelectedRow(patched);
        }}
      />

      {pendingMove && profile ? (
        <CrmPipelineClosedLostConfirmation
          row={pendingMove.row}
          fromStage={pendingMove.fromStage}
          saving={saving}
          error={moveError}
          assignees={assignees}
          profileId={profile.id}
          onConfirm={(payload) => void confirmClosedLost(payload)}
          onCancel={cancelPendingMove}
        />
      ) : null}
    </>
  );
}
