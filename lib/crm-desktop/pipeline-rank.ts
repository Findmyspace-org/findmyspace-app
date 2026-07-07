import {
  computeFractionalRank,
  normalizeStageRanks,
  sortPipelineBoardRows,
  type CrmPipelineBoardSortMode,
} from "./pipeline-ordering";
import type { CrmOrganisationListRow } from "./types";

export type PipelineInsertRankInput = {
  stageRows: CrmOrganisationListRow[];
  movingOrganisationId: string;
  beforeOrganisationId?: string | null;
  afterOrganisationId?: string | null;
  sortMode?: CrmPipelineBoardSortMode;
  /** Same-column reorder excludes the moving card from the stage list. */
  excludeMovingOrganisation?: boolean;
};

export type PipelineInsertRankResult = {
  rank: number;
  needsNormalization: boolean;
  peerRankUpdates: Array<{ id: string; pipeline_manual_rank: number }>;
};

export function computePipelineInsertRank(
  input: PipelineInsertRankInput
): PipelineInsertRankResult {
  const sortMode = input.sortMode ?? "smart";
  const candidates = input.excludeMovingOrganisation
    ? input.stageRows.filter((row) => row.id !== input.movingOrganisationId)
    : input.stageRows;
  const ordered = sortPipelineBoardRows(candidates, sortMode);

  let beforeRank: number | null | undefined;
  let afterRank: number | null | undefined;
  let fallbackIndex = ordered.length;

  if (input.beforeOrganisationId) {
    const index = ordered.findIndex((row) => row.id === input.beforeOrganisationId);
    if (index === -1) {
      throw new Error("Reference organisation not found in stage.");
    }
    afterRank = ordered[index]?.pipeline_manual_rank;
    beforeRank = ordered[index - 1]?.pipeline_manual_rank;
    fallbackIndex = index;
  } else if (input.afterOrganisationId) {
    const index = ordered.findIndex((row) => row.id === input.afterOrganisationId);
    if (index === -1) {
      throw new Error("Reference organisation not found in stage.");
    }
    beforeRank = ordered[index]?.pipeline_manual_rank;
    afterRank = ordered[index + 1]?.pipeline_manual_rank;
    fallbackIndex = index + 1;
  } else {
    beforeRank = ordered[ordered.length - 1]?.pipeline_manual_rank;
    afterRank = null;
    fallbackIndex = ordered.length;
  }

  const { rank, needsNormalization } = computeFractionalRank(
    beforeRank,
    afterRank,
    fallbackIndex
  );

  if (!needsNormalization) {
    return { rank, needsNormalization: false, peerRankUpdates: [] };
  }

  const withMoved = [...ordered];
  withMoved.splice(fallbackIndex, 0, {
    id: input.movingOrganisationId,
    pipeline_manual_rank: rank,
  } as CrmOrganisationListRow);
  const normalized = normalizeStageRanks(withMoved);

  return {
    rank:
      normalized.find((row) => row.id === input.movingOrganisationId)
        ?.pipeline_manual_rank ?? rank,
    needsNormalization: true,
    peerRankUpdates: normalized.filter(
      (row) => row.id !== input.movingOrganisationId
    ),
  };
}
