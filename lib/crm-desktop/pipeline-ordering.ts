import type { CrmOrganisationListRow } from "./types";
import {
  compareCrmActionDateGroups,
  getCrmActionDateGroup,
  type CrmNextAction,
  type CrmActionDateGroup,
} from "./next-action";

export type CrmPipelineBoardSortMode = "smart" | "manual";

const MIN_RANK_GAP = 0.001;

export function getPipelineBoardSortMode(
  value: string | null | undefined
): CrmPipelineBoardSortMode {
  return value === "manual" ? "manual" : "smart";
}

export function resolveRowDateGroup(
  row: Pick<
    CrmOrganisationListRow,
    "next_action_date" | "next_task_due" | "next_action_date_group"
  >
): CrmActionDateGroup {
  if (row.next_action_date_group) return row.next_action_date_group;
  const date = row.next_action_date ?? row.next_task_due;
  return getCrmActionDateGroup(date);
}

export function sameSmartPriorityGroup(
  a: Pick<CrmOrganisationListRow, "next_action_date" | "next_task_due" | "next_action_date_group">,
  b: Pick<CrmOrganisationListRow, "next_action_date" | "next_task_due" | "next_action_date_group">
): boolean {
  return resolveRowDateGroup(a) === resolveRowDateGroup(b);
}

export function isValidSmartReorderTarget(
  active: CrmOrganisationListRow,
  over: CrmOrganisationListRow
): boolean {
  return (
    active.pipeline_stage === over.pipeline_stage &&
    sameSmartPriorityGroup(active, over)
  );
}

export function clampSmartReorderIndex(
  stageRows: CrmOrganisationListRow[],
  activeId: string,
  targetIndex: number
): number {
  const active = stageRows.find((row) => row.id === activeId);
  if (!active) return targetIndex;
  const group = resolveRowDateGroup(active);
  const ordered = sortPipelineBoardRows(stageRows, "smart");
  let min = ordered.length;
  let max = -1;
  ordered.forEach((row, index) => {
    if (resolveRowDateGroup(row) === group) {
      min = Math.min(min, index);
      max = Math.max(max, index);
    }
  });
  if (max < 0) return targetIndex;
  return Math.min(Math.max(targetIndex, min), max);
}

export function comparePipelineBoardRows(
  a: CrmOrganisationListRow,
  b: CrmOrganisationListRow,
  mode: CrmPipelineBoardSortMode
): number {
  if (mode === "manual") {
    const rankA = a.pipeline_manual_rank;
    const rankB = b.pipeline_manual_rank;
    if (rankA != null && rankB != null && rankA !== rankB) {
      return rankA - rankB;
    }
    if (rankA != null && rankB == null) return -1;
    if (rankA == null && rankB != null) return 1;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  }

  const groupCmp = compareCrmActionDateGroups(
    resolveRowDateGroup(a),
    resolveRowDateGroup(b)
  );
  if (groupCmp !== 0) return groupCmp;

  const dateA = a.next_action_date ?? a.next_task_due;
  const dateB = b.next_action_date ?? b.next_task_due;
  if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;

  const rankA = a.pipeline_manual_rank;
  const rankB = b.pipeline_manual_rank;
  if (rankA != null && rankB != null && rankA !== rankB) {
    return rankA - rankB;
  }
  if (rankA != null && rankB == null) return -1;
  if (rankA == null && rankB != null) return 1;

  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function sortPipelineBoardRows(
  rows: CrmOrganisationListRow[],
  mode: CrmPipelineBoardSortMode
): CrmOrganisationListRow[] {
  return [...rows].sort((a, b) => comparePipelineBoardRows(a, b, mode));
}

export function sortPipelineRowsByStage(
  rows: CrmOrganisationListRow[],
  mode: CrmPipelineBoardSortMode
): CrmOrganisationListRow[] {
  const byStage = new Map<string, CrmOrganisationListRow[]>();
  for (const row of rows) {
    const list = byStage.get(row.pipeline_stage) || [];
    list.push(row);
    byStage.set(row.pipeline_stage, list);
  }
  const sorted: CrmOrganisationListRow[] = [];
  for (const [, stageRows] of byStage) {
    sorted.push(...sortPipelineBoardRows(stageRows, mode));
  }
  return sorted;
}

export function applyNextActionToRow(
  row: CrmOrganisationListRow,
  action: CrmNextAction | null
): CrmOrganisationListRow {
  if (!action) {
    return {
      ...row,
      next_action_title: null,
      next_action_date: null,
      next_action_date_group: "none",
      next_task_id: null,
      next_task_due: null,
      next_task_title: null,
    };
  }
  return {
    ...row,
    next_action_title: action.title,
    next_action_date: action.actionDate,
    next_action_date_group: action.dateGroup,
    next_task_id: action.taskId,
    next_task_due: action.actionDate,
    next_task_title: action.title,
  };
}

export function computeFractionalRank(
  beforeRank: number | null | undefined,
  afterRank: number | null | undefined,
  fallbackIndex: number
): { rank: number; needsNormalization: boolean } {
  if (beforeRank == null && afterRank == null) {
    return { rank: (fallbackIndex + 1) * 1000, needsNormalization: false };
  }
  if (beforeRank == null && afterRank != null) {
    const rank = afterRank / 2;
    return { rank, needsNormalization: rank < MIN_RANK_GAP };
  }
  if (beforeRank != null && afterRank == null) {
    return { rank: beforeRank + 1000, needsNormalization: false };
  }
  const rank = (beforeRank! + afterRank!) / 2;
  return {
    rank,
    needsNormalization: Math.abs(beforeRank! - afterRank!) < MIN_RANK_GAP,
  };
}

export function normalizeStageRanks(
  rows: Array<Pick<CrmOrganisationListRow, "id" | "pipeline_manual_rank">>
): Array<{ id: string; pipeline_manual_rank: number }> {
  return rows.map((row, index) => ({
    id: row.id,
    pipeline_manual_rank: (index + 1) * 1000,
  }));
}

export function resolveInsertRank(
  stageRows: CrmOrganisationListRow[],
  activeId: string,
  overId: string | null,
  mode: CrmPipelineBoardSortMode
): { rank: number; needsNormalization: boolean } {
  const ordered = sortPipelineBoardRows(
    stageRows.filter((row) => row.id !== activeId),
    mode
  );
  if (!overId || overId === activeId) {
    const last = ordered[ordered.length - 1];
    return computeFractionalRank(last?.pipeline_manual_rank, null, ordered.length);
  }

  const overIndex = ordered.findIndex((row) => row.id === overId);
  if (overIndex === -1) {
    const last = ordered[ordered.length - 1];
    return computeFractionalRank(last?.pipeline_manual_rank, null, ordered.length);
  }

  const before = ordered[overIndex - 1];
  const after = ordered[overIndex];
  return computeFractionalRank(before?.pipeline_manual_rank, after?.pipeline_manual_rank, overIndex);
}
