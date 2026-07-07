import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingAuditAction } from "./constants";

export type MarketingAuditInput = {
  action: MarketingAuditAction | string;
  actorId?: string | null;
  marketingContactId?: string | null;
  crmContactId?: string | null;
  crmOrganisationId?: string | null;
  marketingListId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  source?: string;
  reason?: string | null;
};

export async function writeMarketingAudit(
  adminClient: SupabaseClient,
  input: MarketingAuditInput
) {
  const newValue =
    input.newValue && typeof input.newValue === "object" && input.reason
      ? { ...(input.newValue as Record<string, unknown>), reason: input.reason }
      : input.newValue ?? (input.reason ? { reason: input.reason } : null);

  const { error } = await adminClient.from("crm_marketing_audits").insert({
    action: input.action,
    actor_id: input.actorId ?? null,
    marketing_contact_id: input.marketingContactId ?? null,
    crm_contact_id: input.crmContactId ?? null,
    crm_organisation_id: input.crmOrganisationId ?? null,
    marketing_list_id: input.marketingListId ?? null,
    previous_value: input.previousValue ?? null,
    new_value: newValue,
    source: input.source ?? null,
  });
  if (error) throw new Error(error.message);
}
