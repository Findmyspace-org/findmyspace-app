import type { CrmOrganisationListRow } from "./types";
import type { CrmOrganisation } from "@/lib/space-place/types";
import type { CrmTask } from "@/lib/space-place/types";
import {
  linkFollowUpTasksToEngagements,
  resolveNextCrmActionForOrganisation,
} from "./next-action";
import { applyNextActionToRow } from "./pipeline-ordering";

type EngagementCandidate = {
  id: string;
  organisation_id: string;
  contact_id: string | null;
  type: string;
  summary: string | null;
  occurred_at: string;
};

export function patchOrganisationRowFromTasks(
  row: CrmOrganisationListRow,
  tasks: CrmTask[],
  engagements: EngagementCandidate[],
  org: Pick<CrmOrganisation, "primary_contact_id"> | null
): CrmOrganisationListRow {
  const primaryId = org?.primary_contact_id ?? row.primary_contact_id;
  const orgTasks = tasks.filter((task) => task.organisation_id === row.id);
  const linkedEngagements = linkFollowUpTasksToEngagements(
    engagements
      .filter((engagement) => engagement.organisation_id === row.id)
      .map((engagement) => ({
        id: engagement.id,
        organisation_id: engagement.organisation_id,
        contact_id: engagement.contact_id,
        type: engagement.type,
        summary: engagement.summary,
        occurred_at: engagement.occurred_at,
      })),
    orgTasks
  );
  const action = resolveNextCrmActionForOrganisation(
    orgTasks,
    row.id,
    primaryId,
    linkedEngagements
  );
  return applyNextActionToRow(row, action);
}
