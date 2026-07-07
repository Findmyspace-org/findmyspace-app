import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStage } from "@/lib/space-place/constants";
import {
  linkFollowUpTasksToEngagements,
  resolveNextCrmActionForOrganisation,
} from "./next-action";
import { applyNextActionToRow } from "./pipeline-ordering";
import type { CrmOrganisationListRow } from "./types";

export type StageOrgDbRow = {
  id: string;
  name: string;
  pipeline_stage: string;
  pipeline_manual_rank: number | null;
  primary_contact_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function loadStageOrganisations(
  adminClient: SupabaseClient,
  stage: PipelineStage
): Promise<StageOrgDbRow[]> {
  const { data, error } = await adminClient
    .from("crm_organisations")
    .select(
      "id, name, pipeline_stage, pipeline_manual_rank, primary_contact_id, status, created_at, updated_at"
    )
    .eq("pipeline_stage", stage)
    .neq("status", "archived");
  if (error) throw new Error(error.message);
  return (data || []) as StageOrgDbRow[];
}

export async function enrichStageOrganisationsForOrdering(
  adminClient: SupabaseClient,
  orgs: StageOrgDbRow[]
): Promise<CrmOrganisationListRow[]> {
  if (!orgs.length) return [];

  const orgIds = orgs.map((org) => org.id);
  const [tasksRes, engagementsRes] = await Promise.all([
    adminClient
      .from("crm_tasks")
      .select(
        "id, organisation_id, contact_id, due_date, title, status, created_at"
      )
      .in("organisation_id", orgIds)
      .eq("status", "open"),
    adminClient
      .from("crm_engagements")
      .select("organisation_id, id, contact_id, occurred_at, summary, type")
      .in("organisation_id", orgIds)
      .order("occurred_at", { ascending: false })
      .limit(orgIds.length * 3),
  ]);

  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (engagementsRes.error) throw new Error(engagementsRes.error.message);

  const allOpenTasks = (tasksRes.data || []) as {
    id: string;
    organisation_id: string;
    contact_id: string | null;
    due_date: string | null;
    title: string;
    status: string;
    created_at: string;
  }[];

  const engagementsByOrg = new Map<
    string,
    {
      id: string;
      organisation_id: string;
      contact_id: string | null;
      type: string;
      summary: string | null;
      occurred_at: string;
    }[]
  >();
  for (const engagement of (engagementsRes.data || []) as {
    id: string;
    organisation_id: string;
    contact_id: string | null;
    type: string;
    summary: string | null;
    occurred_at: string;
  }[]) {
    const list = engagementsByOrg.get(engagement.organisation_id) || [];
    list.push(engagement);
    engagementsByOrg.set(engagement.organisation_id, list);
  }

  const nextActionByOrg = new Map<
    string,
    ReturnType<typeof resolveNextCrmActionForOrganisation>
  >();

  for (const org of orgs) {
    const orgTasks = allOpenTasks.filter((task) => task.organisation_id === org.id);
    const linkedEngagements = linkFollowUpTasksToEngagements(
      (engagementsByOrg.get(org.id) || []).map((engagement) => ({
        id: engagement.id,
        organisation_id: engagement.organisation_id,
        contact_id: engagement.contact_id,
        type: engagement.type,
        summary: engagement.summary,
        occurred_at: engagement.occurred_at,
      })),
      orgTasks
    );
    const resolved = resolveNextCrmActionForOrganisation(
      orgTasks,
      org.id,
      org.primary_contact_id,
      linkedEngagements
    );
    if (resolved) nextActionByOrg.set(org.id, resolved);
  }

  return orgs.map((org) => {
    const action = nextActionByOrg.get(org.id) ?? null;
    const baseRow: CrmOrganisationListRow = {
      id: org.id,
      name: org.name,
      type: null,
      address: null,
      pipeline_stage: org.pipeline_stage,
      status: org.status,
      assigned_to: null,
      assigned_name: null,
      primary_contact_id: org.primary_contact_id,
      primary_contact_name: null,
      primary_contact_role: null,
      primary_contact_email: null,
      primary_contact_phone: null,
      additional_contacts: [],
      contact_count: 0,
      space_count: 0,
      property_count: 0,
      last_interaction_at: null,
      last_interaction_summary: null,
      next_task_id: null,
      next_task_due: null,
      next_task_title: null,
      next_action_title: null,
      next_action_date: null,
      next_action_date_group: "none",
      pipeline_manual_rank: org.pipeline_manual_rank,
      pipeline_rank_updated_at: null,
      pipeline_rank_updated_by: null,
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
    return applyNextActionToRow(baseRow, action);
  });
}
