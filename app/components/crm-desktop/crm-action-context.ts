"use client";

import type { CrmOrganisationListRow, CrmPipelineListRow } from "@/lib/crm-desktop/types";
import type { CrmActionContext } from "./CrmQuickActionProvider";

export function organisationRowToActionContext(
  row: CrmOrganisationListRow
): CrmActionContext {
  return {
    organisationId: row.id,
    organisationName: row.name,
    contactId: row.primary_contact_id ?? undefined,
    contactName: row.primary_contact_name ?? undefined,
    pipelineStage: row.pipeline_stage,
    assignedTo: row.assigned_to,
    taskId: row.next_task_id ?? undefined,
    taskTitle: row.next_action_title ?? row.next_task_title ?? undefined,
  };
}

export function pipelineRowToOrganisationListRow(
  row: CrmPipelineListRow
): CrmOrganisationListRow {
  return {
    id: row.organisation_id,
    name: row.organisation_name,
    type: row.organisation_type,
    address: row.address,
    pipeline_stage: row.pipeline_stage,
    status: "active",
    assigned_to: row.assigned_to,
    assigned_name: row.assigned_name,
    primary_contact_id: row.main_contact_id,
    primary_contact_name: row.main_contact_name,
    primary_contact_role: row.main_contact_role,
    primary_contact_email: row.main_contact_email,
    primary_contact_phone: row.main_contact_phone,
    additional_contacts: [],
    contact_count: row.contact_count,
    space_count: row.space_count,
    property_count: row.property_count,
    last_interaction_at: row.last_interaction_at,
    last_interaction_summary: row.last_interaction_summary,
    next_task_id: row.next_task_id,
    next_task_due: row.next_task_due,
    next_task_title: row.next_task_title,
    next_action_title: row.next_task_title,
    next_action_date: row.next_task_due,
    next_action_date_group: "none",
    pipeline_manual_rank: null,
    pipeline_rank_updated_at: null,
    pipeline_rank_updated_by: null,
    created_at: "",
    updated_at: row.updated_at || "",
  };
}
