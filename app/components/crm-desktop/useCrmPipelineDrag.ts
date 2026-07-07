"use client";

import { useCallback, useState } from "react";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { PipelineStage } from "@/lib/space-place/constants";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { updateCrmPipelineStage } from "@/lib/space-place/crm-mutations";
import { useCrmRefresh } from "@/lib/crm-desktop/crm-refresh";
import { pipelineStageRequiresReason } from "@/lib/crm-marketing/pipeline";
import type { ClosePipelineLostFormPayload } from "@/lib/crm-marketing/types";
import { adminApiFetch } from "@/lib/admin-api-client";
import { reorderCrmPipelineCard } from "@/lib/crm-desktop/api-client";
import {
  clampSmartReorderIndex,
  isValidSmartReorderTarget,
  resolveInsertRank,
  sortPipelineBoardRows,
  type CrmPipelineBoardSortMode,
} from "@/lib/crm-desktop/pipeline-ordering";

export type PendingPipelineMove = {
  row: CrmOrganisationListRow;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  overOrganisationId?: string | null;
};

type UseCrmPipelineDragOptions = {
  rows: CrmOrganisationListRow[];
  setRows: React.Dispatch<React.SetStateAction<CrmOrganisationListRow[]>>;
  profileId?: string;
  onMoveComplete?: () => void;
  dragEnabled?: boolean;
  sortMode?: CrmPipelineBoardSortMode;
  onDragOverStage?: (stage: PipelineStage | null) => void;
};

function resolveDropStage(
  over: DragEndEvent["over"] | DragOverEvent["over"],
  rows: CrmOrganisationListRow[]
): PipelineStage | null {
  if (!over) return null;

  const overData = over.data.current;
  if (overData?.type === "column" && typeof overData.stage === "string") {
    return overData.stage as PipelineStage;
  }

  const overRow = rows.find((r) => r.id === over.id);
  if (overRow) return overRow.pipeline_stage as PipelineStage;

  if (PIPELINE_STAGES.includes(over.id as PipelineStage)) {
    return over.id as PipelineStage;
  }

  return null;
}

function resolveOverOrganisationId(
  over: DragEndEvent["over"],
  rows: CrmOrganisationListRow[]
): string | null {
  if (!over) return null;
  if (rows.some((row) => row.id === over.id)) return String(over.id);
  return null;
}

export function useCrmPipelineDrag({
  rows,
  setRows,
  profileId,
  onMoveComplete,
  dragEnabled = true,
  sortMode = "smart",
  onDragOverStage,
}: UseCrmPipelineDragOptions) {
  const { invalidate } = useCrmRefresh();
  const [activeRow, setActiveRow] = useState<CrmOrganisationListRow | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingPipelineMove | null>(null);
  const [saving, setSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [noTaskPromptOrgId, setNoTaskPromptOrgId] = useState<string | null>(null);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!dragEnabled) return;
      const row = rows.find((r) => r.id === event.active.id);
      if (row) setActiveRow(row);
    },
    [rows, dragEnabled]
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      onDragOverStage?.(resolveDropStage(event.over, rows));
    },
    [rows, onDragOverStage]
  );

  const applyOptimisticMove = useCallback(
    (orgId: string, toStage: PipelineStage, rank?: number | null) => {
      setRows((current) =>
        current.map((r) =>
          r.id === orgId
            ? {
                ...r,
                pipeline_stage: toStage,
                pipeline_manual_rank:
                  rank === undefined ? r.pipeline_manual_rank : rank,
              }
            : r
        )
      );
    },
    [setRows]
  );

  const revertMove = useCallback(
    (orgId: string, fromStage: PipelineStage, previousRank: number | null) => {
      setRows((current) =>
        current.map((r) =>
          r.id === orgId
            ? { ...r, pipeline_stage: fromStage, pipeline_manual_rank: previousRank }
            : r
        )
      );
    },
    [setRows]
  );

  const persistReorder = useCallback(
    async (
      row: CrmOrganisationListRow,
      stage: PipelineStage,
      overOrganisationId: string | null
    ) => {
      const stageRows = rows.filter((item) => item.pipeline_stage === stage);
      const { rank } = resolveInsertRank(
        stageRows,
        row.id,
        overOrganisationId,
        sortMode
      );

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, pipeline_manual_rank: rank, pipeline_stage: stage }
            : item
        )
      );

      const result = await reorderCrmPipelineCard({
        organisationId: row.id,
        pipelineStage: stage,
        beforeOrganisationId: overOrganisationId,
        sortMode,
      });

      if (!result.ok) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Failed to save order."
        );
      }

      const savedRank =
        typeof result.pipeline_manual_rank === "number"
          ? result.pipeline_manual_rank
          : rank;

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, pipeline_manual_rank: savedRank }
            : item
        )
      );
    },
    [rows, setRows, sortMode]
  );

  const commitMove = useCallback(
    async (
      row: CrmOrganisationListRow,
      fromStage: PipelineStage,
      toStage: PipelineStage,
      overOrganisationId: string | null
    ) => {
      setSaving(true);
      setMoveError(null);
      const previousRank = row.pipeline_manual_rank;
      applyOptimisticMove(row.id, toStage);

      const { error } = await updateCrmPipelineStage({
        organisationId: row.id,
        pipelineStage: toStage,
        previousStage: fromStage,
        profileId: profileId ?? null,
        contactId: row.primary_contact_id,
      });

      if (error) {
        setSaving(false);
        revertMove(row.id, fromStage, previousRank);
        setMoveError(error);
        return false;
      }

      try {
        await persistReorder(
          { ...row, pipeline_stage: toStage },
          toStage,
          overOrganisationId
        );
      } catch (reorderError) {
        setMoveError(
          reorderError instanceof Error
            ? reorderError.message
            : "Stage updated but order could not be saved."
        );
      }

      setSaving(false);
      invalidate();
      onMoveComplete?.();

      if (!row.next_action_title && !row.next_task_title && toStage !== "closed_lost") {
        setNoTaskPromptOrgId(row.id);
      }

      return true;
    },
    [
      applyOptimisticMove,
      revertMove,
      profileId,
      invalidate,
      onMoveComplete,
      persistReorder,
    ]
  );

  const confirmClosedLost = useCallback(
    async (payload: ClosePipelineLostFormPayload) => {
      if (!pendingMove) return false;
      const { row, fromStage, overOrganisationId } = pendingMove;

      setSaving(true);
      setMoveError(null);

      try {
        const result = await adminApiFetch(
          "/api/admin/crm/desktop/pipeline/close-lost",
          {
            method: "POST",
            body: JSON.stringify({
              organisationId: row.id,
              previousStage: fromStage,
              profileId,
              ...payload,
            }),
          }
        );

        if (!result.ok) {
          setMoveError(
            typeof result.error === "string"
              ? result.error
              : "Failed to close organisation."
          );
          return false;
        }

        applyOptimisticMove(row.id, "closed_lost");
        try {
          await persistReorder(
            { ...row, pipeline_stage: "closed_lost" },
            "closed_lost",
            overOrganisationId ?? null
          );
        } catch {
          // Stage change succeeded; rank is best-effort for terminal column.
        }
        setPendingMove(null);
        invalidate();
        onMoveComplete?.();
        return true;
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : "Failed to close organisation.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [pendingMove, profileId, applyOptimisticMove, invalidate, onMoveComplete, persistReorder]
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveRow(null);
      onDragOverStage?.(null);
      if (!dragEnabled) return;

      const orgId = String(event.active.id);
      const row = rows.find((r) => r.id === orgId);
      if (!row || !event.over) return;

      const fromStage = row.pipeline_stage as PipelineStage;
      const toStage = resolveDropStage(event.over, rows);
      const overOrganisationId = resolveOverOrganisationId(event.over, rows);

      if (!toStage) return;

      if (toStage === fromStage) {
        if (!overOrganisationId || overOrganisationId === orgId) return;

        const overRow = rows.find((item) => item.id === overOrganisationId);
        if (sortMode === "smart" && overRow && !isValidSmartReorderTarget(row, overRow)) {
          setMoveError(
            "In Smart priority mode, reorder cards within the same date group only."
          );
          return;
        }

        const stageRows = sortPipelineBoardRows(
          rows.filter((item) => item.pipeline_stage === fromStage),
          sortMode
        );
        let oldIndex = stageRows.findIndex((item) => item.id === orgId);
        let newIndex = stageRows.findIndex((item) => item.id === overOrganisationId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        if (sortMode === "smart") {
          newIndex = clampSmartReorderIndex(stageRows, orgId, newIndex);
          if (newIndex === oldIndex) return;
        }

        const reordered = arrayMove(stageRows, oldIndex, newIndex);
        const movedIndex = reordered.findIndex((item) => item.id === orgId);
        const beforeOrganisationId =
          movedIndex >= 0 && movedIndex < reordered.length - 1
            ? reordered[movedIndex + 1]?.id ?? null
            : null;

        setRows((current) => {
          const others = current.filter((item) => item.pipeline_stage !== fromStage);
          return [...others, ...reordered];
        });

        setSaving(true);
        setMoveError(null);
        try {
          await persistReorder(row, fromStage, beforeOrganisationId);
          invalidate();
          onMoveComplete?.();
        } catch (error) {
          setMoveError(
            error instanceof Error ? error.message : "Failed to save card order."
          );
          onMoveComplete?.();
        } finally {
          setSaving(false);
        }
        return;
      }

      if (pipelineStageRequiresReason(toStage)) {
        setPendingMove({ row, fromStage, toStage, overOrganisationId });
        return;
      }

      await commitMove(row, fromStage, toStage, overOrganisationId);
    },
    [
      rows,
      dragEnabled,
      commitMove,
      onDragOverStage,
      sortMode,
      setRows,
      persistReorder,
      invalidate,
      onMoveComplete,
    ]
  );

  const cancelPendingMove = useCallback(() => {
    setPendingMove(null);
    setMoveError(null);
  }, []);

  const clearMoveError = useCallback(() => setMoveError(null), []);

  return {
    activeRow,
    pendingMove,
    saving,
    moveError,
    noTaskPromptOrgId,
    clearNoTaskPrompt: () => setNoTaskPromptOrgId(null),
    clearMoveError,
    onDragStart,
    onDragOver,
    onDragEnd,
    confirmClosedLost,
    cancelPendingMove,
  };
}