"use client";

import { useCallback, useState } from "react";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { PipelineStage } from "@/lib/space-place/constants";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import { updateCrmPipelineStage } from "@/lib/space-place/crm-mutations";
import { useCrmRefresh } from "@/lib/crm-desktop/crm-refresh";
import { pipelineStageRequiresReason } from "@/lib/crm-marketing/pipeline";
import type { ClosePipelineLostFormPayload } from "@/lib/crm-marketing/types";
import { adminApiFetch } from "@/lib/admin-api-client";

export type PendingPipelineMove = {
  row: CrmOrganisationListRow;
  fromStage: PipelineStage;
  toStage: PipelineStage;
};

type UseCrmPipelineDragOptions = {
  rows: CrmOrganisationListRow[];
  setRows: React.Dispatch<React.SetStateAction<CrmOrganisationListRow[]>>;
  profileId?: string;
  onMoveComplete?: () => void;
  dragEnabled?: boolean;
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

export function useCrmPipelineDrag({
  rows,
  setRows,
  profileId,
  onMoveComplete,
  dragEnabled = true,
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
    (orgId: string, toStage: PipelineStage) => {
      setRows((current) =>
        current.map((r) =>
          r.id === orgId ? { ...r, pipeline_stage: toStage } : r
        )
      );
    },
    [setRows]
  );

  const revertMove = useCallback(
    (orgId: string, fromStage: PipelineStage) => {
      setRows((current) =>
        current.map((r) =>
          r.id === orgId ? { ...r, pipeline_stage: fromStage } : r
        )
      );
    },
    [setRows]
  );

  const commitMove = useCallback(
    async (
      row: CrmOrganisationListRow,
      fromStage: PipelineStage,
      toStage: PipelineStage
    ) => {
      setSaving(true);
      setMoveError(null);
      applyOptimisticMove(row.id, toStage);

      const { error } = await updateCrmPipelineStage({
        organisationId: row.id,
        pipelineStage: toStage,
        previousStage: fromStage,
        profileId: profileId ?? null,
        contactId: row.primary_contact_id,
      });

      setSaving(false);

      if (error) {
        revertMove(row.id, fromStage);
        setMoveError(error);
        return false;
      }

      invalidate();
      onMoveComplete?.();

      if (!row.next_task_title && toStage !== "closed_lost") {
        setNoTaskPromptOrgId(row.id);
      }

      return true;
    },
    [applyOptimisticMove, revertMove, profileId, invalidate, onMoveComplete]
  );

  const confirmClosedLost = useCallback(
    async (payload: ClosePipelineLostFormPayload) => {
      if (!pendingMove) return false;
      const { row, fromStage } = pendingMove;

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
    [pendingMove, profileId, applyOptimisticMove, invalidate, onMoveComplete]
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveRow(null);
      onDragOverStage?.(null);
      if (!dragEnabled) return;

      const orgId = String(event.active.id);
      const row = rows.find((r) => r.id === orgId);
      if (!row) return;

      const fromStage = row.pipeline_stage as PipelineStage;
      const toStage = resolveDropStage(event.over, rows);
      if (!toStage || toStage === fromStage) return;

      if (pipelineStageRequiresReason(toStage)) {
        setPendingMove({ row, fromStage, toStage });
        return;
      }

      await commitMove(row, fromStage, toStage);
    },
    [rows, dragEnabled, commitMove, onDragOverStage]
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
