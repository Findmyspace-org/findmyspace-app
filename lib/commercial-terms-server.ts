import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCommercialUuid,
  parseCommercialTermsWriteBody,
  resolveCommercialTerms,
  type CommercialScopeType,
  type CommercialTermRow,
  type ResolvedCommercialTerms,
} from "@/lib/commercial-terms";

function asTermRow(row: Record<string, unknown>): CommercialTermRow {
  return {
    id: String(row.id),
    scope_type: row.scope_type as CommercialTermRow["scope_type"],
    scope_id: (row.scope_id as string | null) ?? null,
    commercial_model: row.commercial_model as CommercialTermRow["commercial_model"],
    commission_percent: row.commission_percent as number | string,
    transaction_fee_percent: row.transaction_fee_percent as number | string,
    monthly_subscription_amount: row.monthly_subscription_amount as number | string,
    effective_from: String(row.effective_from),
    superseded_at: (row.superseded_at as string | null) ?? null,
    admin_note: (row.admin_note as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export async function loadCommercialTermRows(
  admin: SupabaseClient,
  input: {
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
  }
): Promise<CommercialTermRow[]> {
  const filters = ["and(scope_type.eq.platform,scope_id.is.null)"];
  if (isCommercialUuid(input.organisationId)) {
    filters.push(
      `and(scope_type.eq.organisation,scope_id.eq.${input.organisationId})`
    );
  }
  if (isCommercialUuid(input.propertyId)) {
    filters.push(`and(scope_type.eq.property,scope_id.eq.${input.propertyId})`);
  }
  if (isCommercialUuid(input.spaceId)) {
    filters.push(`and(scope_type.eq.space,scope_id.eq.${input.spaceId})`);
  }

  const { data, error } = await admin
    .from("commercial_terms")
    .select(
      "id, scope_type, scope_id, commercial_model, commission_percent, transaction_fee_percent, monthly_subscription_amount, effective_from, superseded_at, admin_note, created_by, created_at"
    )
    .or(filters.join(","))
    .order("effective_from", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load commercial terms.");
  }

  return ((data || []) as Record<string, unknown>[]).map(asTermRow);
}

export async function resolveListingScopeIds(
  admin: SupabaseClient,
  input: {
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
  }
): Promise<{
  organisationId: string | null;
  propertyId: string | null;
  spaceId: string | null;
  legacySpacePercent: number | null;
}> {
  const spaceId = isCommercialUuid(input.spaceId) ? input.spaceId! : null;
  let propertyId = isCommercialUuid(input.propertyId) ? input.propertyId! : null;
  let organisationId = isCommercialUuid(input.organisationId)
    ? input.organisationId!
    : null;
  let legacySpacePercent: number | null = null;

  if (spaceId) {
    const { data: space } = await admin
      .from("spaces")
      .select("id, property_id, platform_fee_percent")
      .eq("id", spaceId)
      .maybeSingle();
    const row = space as {
      property_id?: string | null;
      platform_fee_percent?: number | null;
    } | null;
    if (!row) {
      throw new Error("Space not found.");
    }
    legacySpacePercent =
      row.platform_fee_percent == null ? null : Number(row.platform_fee_percent);
    if (!propertyId && row.property_id) propertyId = row.property_id;
  }

  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("id, organisation_id")
      .eq("id", propertyId)
      .maybeSingle();
    const row = property as { organisation_id?: string | null } | null;
    if (!row) {
      throw new Error("Property not found.");
    }
    if (!organisationId && row.organisation_id) {
      organisationId = row.organisation_id;
    }
  }

  return { organisationId, propertyId, spaceId, legacySpacePercent };
}

export async function loadResolvedCommercialTerms(
  admin: SupabaseClient,
  input: {
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
    effectiveAt?: Date | string;
    legacySpacePercent?: number | null;
  }
): Promise<ResolvedCommercialTerms> {
  const effectiveAt = input.effectiveAt ?? new Date();
  const scope = await resolveListingScopeIds(admin, input);
  const rows = await loadCommercialTermRows(admin, scope);
  return resolveCommercialTerms({
    organisationId: scope.organisationId,
    propertyId: scope.propertyId,
    spaceId: scope.spaceId,
    effectiveAt,
    rows,
    legacySpacePercent:
      input.legacySpacePercent ?? scope.legacySpacePercent,
  });
}

async function assertScopeExists(
  admin: SupabaseClient,
  scopeType: CommercialScopeType,
  scopeId: string | null
): Promise<void> {
  if (scopeType === "platform") return;
  if (scopeType === "organisation") {
    const { data } = await admin
      .from("organisations")
      .select("id")
      .eq("id", scopeId)
      .maybeSingle();
    if (!data) throw new Error("Organisation not found.");
    return;
  }
  if (scopeType === "property") {
    const { data } = await admin
      .from("properties")
      .select("id")
      .eq("id", scopeId)
      .maybeSingle();
    if (!data) throw new Error("Property not found.");
    return;
  }
  const { data } = await admin
    .from("spaces")
    .select("id")
    .eq("id", scopeId)
    .maybeSingle();
  if (!data) throw new Error("Space not found.");
}

export async function createCommercialTerms(
  admin: SupabaseClient,
  actorUserId: string,
  body: unknown
): Promise<CommercialTermRow> {
  const parsed = parseCommercialTermsWriteBody(body);
  if (!parsed.ok) throw new Error(parsed.error);

  const value = parsed.value;
  await assertScopeExists(admin, value.scopeType, value.scopeId);

  let supersedeQuery = admin
    .from("commercial_terms")
    .update({ superseded_at: value.effectiveFrom })
    .eq("scope_type", value.scopeType)
    .is("superseded_at", null)
    .lt("effective_from", value.effectiveFrom);

  supersedeQuery =
    value.scopeId == null
      ? supersedeQuery.is("scope_id", null)
      : supersedeQuery.eq("scope_id", value.scopeId);

  const { error: supersedeError } = await supersedeQuery;
  if (supersedeError) {
    throw new Error(supersedeError.message || "Could not schedule commercial terms.");
  }

  const { data, error } = await admin
    .from("commercial_terms")
    .insert({
      scope_type: value.scopeType,
      scope_id: value.scopeId,
      commercial_model: value.model,
      commission_percent: value.commissionPercent,
      transaction_fee_percent: value.transactionFeePercent,
      monthly_subscription_amount: value.monthlySubscriptionAmount,
      effective_from: value.effectiveFrom,
      admin_note: value.adminNote,
      created_by: actorUserId,
    })
    .select(
      "id, scope_type, scope_id, commercial_model, commission_percent, transaction_fee_percent, monthly_subscription_amount, effective_from, superseded_at, admin_note, created_by, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save commercial terms.");
  }

  return asTermRow(data as Record<string, unknown>);
}
