import type { SupabaseClient } from "@supabase/supabase-js";
import { PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import type {
  ClosedLostOutcomeCategory,
  MarketingAudienceMode,
} from "./constants";
import { SYSTEM_LIST_SLUGS } from "./constants";
import {
  defaultMarketingStatusForPipelineClose,
  normaliseMarketingEmail,
} from "./eligibility";

export type ClosePipelineLostInput = {
  organisationId: string;
  previousStage: string;
  profileId: string;
  idempotencyKey: string;
  lostReason: string;
  outcomeCategory: ClosedLostOutcomeCategory | string;
  detailNote?: string | null;
  marketingAudienceMode: MarketingAudienceMode | string;
  selectedContactIds: string[];
  createFollowUpTask: boolean;
  taskTitle?: string | null;
  taskDueDate?: string | null;
  taskOwnerId?: string | null;
  taskContactId?: string | null;
};

export type ClosePipelineLostResult = {
  ok: boolean;
  error?: string;
  organisationId?: string;
  taskId?: string | null;
  marketingContactIds?: string[];
};

type ListRow = { id: string; slug: string };

function buildLostReasonText(input: ClosePipelineLostInput): string {
  const parts = [input.lostReason.trim()];
  if (input.detailNote?.trim()) parts.push(input.detailNote.trim());
  return parts.join(" — ");
}

function listSlugsForMode(mode: MarketingAudienceMode | string): string[] {
  if (mode === "none") return [];
  const slugs: string[] = [SYSTEM_LIST_SLUGS.closedNotNow];
  if (mode === "general_updates") slugs.push(SYSTEM_LIST_SLUGS.generalUpdates);
  if (mode === "launch_announcements") slugs.push(SYSTEM_LIST_SLUGS.goLive);
  return slugs;
}

function isRpcUnavailableError(message: string): boolean {
  return /could not find the function/i.test(message);
}

async function loadListIdsBySlug(
  adminClient: SupabaseClient,
  slugs: string[]
): Promise<Map<string, string>> {
  const { data } = await adminClient
    .from("crm_marketing_lists")
    .select("id, slug")
    .in("slug", slugs);
  const map = new Map<string, string>();
  for (const row of (data || []) as ListRow[]) {
    map.set(row.slug, row.id);
  }
  return map;
}

async function writeMarketingAudit(
  adminClient: SupabaseClient,
  row: {
    action: string;
    actorId: string;
    marketingContactId?: string | null;
    crmContactId?: string | null;
    crmOrganisationId?: string | null;
    marketingListId?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
    source?: string;
  }
) {
  await adminClient.from("crm_marketing_audits").insert({
    action: row.action,
    actor_id: row.actorId,
    marketing_contact_id: row.marketingContactId ?? null,
    crm_contact_id: row.crmContactId ?? null,
    crm_organisation_id: row.crmOrganisationId ?? null,
    marketing_list_id: row.marketingListId ?? null,
    previous_value: row.previousValue ?? null,
    new_value: row.newValue ?? null,
    source: row.source ?? null,
  });
}

async function closeOrganisationPipelineLostLegacy(
  adminClient: SupabaseClient,
  input: ClosePipelineLostInput
): Promise<ClosePipelineLostResult> {
  const lostReason = buildLostReasonText(input);
  if (!lostReason.trim()) {
    return { ok: false, error: "A reason is required for Closed / Not Now." };
  }

  const { data: existingOp } = await adminClient
    .from("crm_pipeline_close_operations")
    .select("status, result, error_message")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existingOp?.status === "completed" && existingOp.result) {
    return existingOp.result as ClosePipelineLostResult;
  }

  await adminClient.from("crm_pipeline_close_operations").upsert(
    {
      idempotency_key: input.idempotencyKey,
      organisation_id: input.organisationId,
      profile_id: input.profileId,
      payload: input,
      status: "pending",
    },
    { onConflict: "idempotency_key" }
  );

  const { data: orgBefore } = await adminClient
    .from("crm_organisations")
    .select("pipeline_stage, lost_reason")
    .eq("id", input.organisationId)
    .single();

  if (!orgBefore) {
    return { ok: false, error: "Organisation not found." };
  }

  if (orgBefore.pipeline_stage === "closed_lost") {
    return { ok: false, error: "Organisation is already in Closed / Not Now." };
  }

  const previousStage =
    input.previousStage || (orgBefore.pipeline_stage as string);

  try {
    const { error: orgErr } = await adminClient
      .from("crm_organisations")
      .update({
        pipeline_stage: "closed_lost",
        lost_reason: lostReason,
        closed_at: new Date().toISOString(),
      })
      .eq("id", input.organisationId);

    if (orgErr) throw new Error(orgErr.message);

    const fromLabel =
      PIPELINE_STAGE_LABELS[
        previousStage as keyof typeof PIPELINE_STAGE_LABELS
      ] || previousStage;
    const outcomeParts = [
      `From ${fromLabel} to ${PIPELINE_STAGE_LABELS.closed_lost}`,
      `Category: ${input.outcomeCategory}`,
    ];
    if (input.detailNote?.trim()) outcomeParts.push(input.detailNote.trim());

    const { error: engErr } = await adminClient.from("crm_engagements").insert({
      organisation_id: input.organisationId,
      contact_id: input.taskContactId || null,
      type: "note",
      summary: "Pipeline stage updated",
      outcome: outcomeParts.join(" · "),
      occurred_at: new Date().toISOString(),
      created_by: input.profileId,
    });
    if (engErr) throw new Error(engErr.message);

    const marketingContactIds: string[] = [];
    const listSlugs =
      input.marketingAudienceMode === "none"
        ? []
        : listSlugsForMode(input.marketingAudienceMode);
    const listMap =
      listSlugs.length > 0
        ? await loadListIdsBySlug(adminClient, listSlugs)
        : new Map<string, string>();

    if (
      input.marketingAudienceMode !== "none" &&
      input.selectedContactIds.length > 0
    ) {
      const uniqueContactIds = [...new Set(input.selectedContactIds)];
      const { data: contacts } = await adminClient
        .from("crm_contacts")
        .select("id, organisation_id, email, full_name, first_name, last_name")
        .eq("organisation_id", input.organisationId)
        .in("id", uniqueContactIds);

      for (const contact of contacts || []) {
        const emailNorm = normaliseMarketingEmail(contact.email);
        const { data: existingMc } = await adminClient
          .from("crm_marketing_contacts")
          .select("*")
          .eq("crm_contact_id", contact.id)
          .maybeSingle();

        const defaults = defaultMarketingStatusForPipelineClose(
          existingMc || undefined
        );
        const preservedTerminal =
          existingMc &&
          (existingMc.unsubscribe_at ||
            existingMc.suppressed_at ||
            existingMc.status === "unsubscribed" ||
            existingMc.status === "suppressed");

        const status = emailNorm
          ? preservedTerminal
            ? (existingMc!.status as string)
            : defaults.status
          : "invalid_email";

        const upsertPayload: Record<string, unknown> = {
          crm_contact_id: contact.id,
          crm_organisation_id: input.organisationId,
          email: contact.email,
          email_normalised: emailNorm,
          updated_at: new Date().toISOString(),
        };

        if (!preservedTerminal) {
          upsertPayload.status = status;
          upsertPayload.consent_status = defaults.consentStatus;
          upsertPayload.lawful_basis = defaults.lawfulBasis;
        }

        if (!existingMc) {
          upsertPayload.created_from = "pipeline_closed_lost";
          upsertPayload.created_from_pipeline_stage = "closed_lost";
          upsertPayload.created_by = input.profileId;
        }

        const { data: mc, error: mcErr } = await adminClient
          .from("crm_marketing_contacts")
          .upsert(upsertPayload, { onConflict: "crm_contact_id" })
          .select("id")
          .single();

        if (mcErr) throw new Error(mcErr.message);
        marketingContactIds.push(mc.id as string);

        await writeMarketingAudit(adminClient, {
          action: existingMc
            ? "marketing_contact_updated"
            : "marketing_contact_created",
          actorId: input.profileId,
          marketingContactId: mc.id as string,
          crmContactId: contact.id,
          crmOrganisationId: input.organisationId,
          previousValue: existingMc ?? null,
          newValue: upsertPayload,
          source: "pipeline_closed_lost",
        });

        for (const slug of listSlugs) {
          const listId = listMap.get(slug);
          if (!listId) continue;
          const { error: memberErr } = await adminClient
            .from("crm_marketing_list_members")
            .upsert(
              {
                marketing_contact_id: mc.id,
                marketing_list_id: listId,
                source: "pipeline_closed_lost",
                added_by: input.profileId,
              },
              { onConflict: "marketing_contact_id,marketing_list_id" }
            );
          if (memberErr) throw new Error(memberErr.message);

          await writeMarketingAudit(adminClient, {
            action: "added_to_list",
            actorId: input.profileId,
            marketingContactId: mc.id as string,
            crmContactId: contact.id,
            crmOrganisationId: input.organisationId,
            marketingListId: listId,
            newValue: { slug },
            source: "pipeline_closed_lost",
          });
        }
      }
    }

    let taskId: string | null = null;
    if (input.createFollowUpTask && input.taskTitle?.trim()) {
      const { data: task, error: taskErr } = await adminClient
        .from("crm_tasks")
        .insert({
          organisation_id: input.organisationId,
          contact_id: input.taskContactId || null,
          title: input.taskTitle.trim(),
          description: input.detailNote?.trim() || null,
          due_date: input.taskDueDate || null,
          status: "open",
          priority: "normal",
          owner_id: input.taskOwnerId || input.profileId,
        })
        .select("id")
        .single();
      if (taskErr) throw new Error(taskErr.message);
      taskId = task.id as string;
    }

    const result: ClosePipelineLostResult = {
      ok: true,
      organisationId: input.organisationId,
      taskId,
      marketingContactIds,
    };

    await adminClient
      .from("crm_pipeline_close_operations")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("idempotency_key", input.idempotencyKey);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Close pipeline failed.";

    await adminClient
      .from("crm_organisations")
      .update({
        pipeline_stage: previousStage,
        lost_reason: orgBefore.lost_reason,
      })
      .eq("id", input.organisationId);

    await adminClient
      .from("crm_pipeline_close_operations")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("idempotency_key", input.idempotencyKey);

    return { ok: false, error: message };
  }
}

export async function closeOrganisationPipelineLost(
  adminClient: SupabaseClient,
  input: ClosePipelineLostInput
): Promise<ClosePipelineLostResult> {
  const lostReason = buildLostReasonText(input);
  if (!lostReason.trim()) {
    return { ok: false, error: "A reason is required for Closed / Not Now." };
  }

  const { data, error } = await adminClient.rpc(
    "crm_close_organisation_pipeline_lost",
    {
      p_idempotency_key: input.idempotencyKey,
      p_organisation_id: input.organisationId,
      p_profile_id: input.profileId,
      p_previous_stage: input.previousStage,
      p_lost_reason: input.lostReason.trim(),
      p_outcome_category: input.outcomeCategory,
      p_detail_note: input.detailNote?.trim() || null,
      p_marketing_audience_mode: input.marketingAudienceMode,
      p_selected_contact_ids: input.selectedContactIds,
      p_create_follow_up_task: input.createFollowUpTask,
      p_task_title: input.taskTitle?.trim() || null,
      p_task_due_date: input.taskDueDate || null,
      p_task_owner_id: input.taskOwnerId || null,
      p_task_contact_id: input.taskContactId || null,
    }
  );

  if (!error) {
    const result = data as ClosePipelineLostResult | null;
    if (!result) {
      return { ok: false, error: "Close pipeline returned no result." };
    }
    return result;
  }

  if (isRpcUnavailableError(error.message)) {
    return closeOrganisationPipelineLostLegacy(adminClient, input);
  }

  return { ok: false, error: error.message };
}
