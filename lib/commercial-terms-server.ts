import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countBillableInventory,
  type BillableInventoryCounts,
  type BillableInventoryScope,
  type BillableOrganisationInput,
  type BillablePropertyInput,
  type BillableSpaceInput,
} from "@/lib/commercial-inventory";
import type { CommercialTermTier } from "@/lib/commercial-subscription";
import { subscriptionBilledScope } from "@/lib/commercial-subscription";
import {
  decorateCommercialSearchHit,
  type CommercialSearchHit,
  type CommercialSearchKind,
  type DecoratedCommercialSearchHit,
} from "@/lib/commercial-admin-display";
import {
  isCommercialUuid,
  parseCommercialTermsWriteBody,
  resolveCommercialTerms,
  withSubscriptionResolution,
  type CommercialScopeType,
  type CommercialTermRow,
  type ResolvedCommercialTerms,
} from "@/lib/commercial-terms";

const TERM_COLUMNS =
  "id, scope_type, scope_id, commercial_model, commission_percent, transaction_fee_percent, monthly_subscription_amount, subscription_pricing_mode, effective_from, superseded_at, admin_note, created_by, created_at";

function uniqueUuids(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value) => isCommercialUuid(value)))] as string[];
}

function asTier(row: Record<string, unknown>): CommercialTermTier {
  return {
    id: String(row.id),
    minCount: Number(row.min_count),
    maxCount: row.max_count == null ? null : Number(row.max_count),
    monthlyAmount: Number(row.monthly_amount) || 0,
    label: (row.label as string | null) ?? null,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function asTermRow(
  row: Record<string, unknown>,
  tiers: CommercialTermTier[] = []
): CommercialTermRow {
  return {
    id: String(row.id),
    scope_type: row.scope_type as CommercialTermRow["scope_type"],
    scope_id: (row.scope_id as string | null) ?? null,
    commercial_model: row.commercial_model as CommercialTermRow["commercial_model"],
    commission_percent: row.commission_percent as number | string,
    transaction_fee_percent: row.transaction_fee_percent as number | string,
    monthly_subscription_amount: row.monthly_subscription_amount as number | string,
    subscription_pricing_mode:
      (row.subscription_pricing_mode as CommercialTermRow["subscription_pricing_mode"]) ??
      null,
    effective_from: String(row.effective_from),
    superseded_at: (row.superseded_at as string | null) ?? null,
    admin_note: (row.admin_note as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    tiers,
  };
}

async function loadTiersForTerms(
  admin: SupabaseClient,
  termIds: string[]
): Promise<Map<string, CommercialTermTier[]>> {
  const byTerm = new Map<string, CommercialTermTier[]>();
  if (termIds.length === 0) return byTerm;

  const { data, error } = await admin
    .from("commercial_term_tiers")
    .select(
      "id, commercial_terms_id, min_count, max_count, monthly_amount, label, sort_order"
    )
    .in("commercial_terms_id", termIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message || "Could not load commercial term tiers.");
  }

  for (const row of (data || []) as Record<string, unknown>[]) {
    const termId = String(row.commercial_terms_id);
    const list = byTerm.get(termId) ?? [];
    list.push(asTier(row));
    byTerm.set(termId, list);
  }
  return byTerm;
}

export async function loadCommercialTermRows(
  admin: SupabaseClient,
  input: {
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
    organisationIds?: Array<string | null | undefined>;
    propertyIds?: Array<string | null | undefined>;
    spaceIds?: Array<string | null | undefined>;
  }
): Promise<CommercialTermRow[]> {
  const filters = ["and(scope_type.eq.platform,scope_id.is.null)"];
  const organisationIds = uniqueUuids([
    input.organisationId,
    ...(input.organisationIds || []),
  ]);
  const propertyIds = uniqueUuids([input.propertyId, ...(input.propertyIds || [])]);
  const spaceIds = uniqueUuids([input.spaceId, ...(input.spaceIds || [])]);
  for (const id of organisationIds) {
    filters.push(`and(scope_type.eq.organisation,scope_id.eq.${id})`);
  }
  for (const id of propertyIds) {
    filters.push(`and(scope_type.eq.property,scope_id.eq.${id})`);
  }
  for (const id of spaceIds) {
    filters.push(`and(scope_type.eq.space,scope_id.eq.${id})`);
  }

  const { data, error } = await admin
    .from("commercial_terms")
    .select(TERM_COLUMNS)
    .or(filters.join(","))
    .order("effective_from", { ascending: false });

  if (error) {
    throw new Error(error.message || "Could not load commercial terms.");
  }

  const raw = (data || []) as Record<string, unknown>[];
  const tiers = await loadTiersForTerms(
    admin,
    raw.map((row) => String(row.id))
  );
  return raw.map((row) => asTermRow(row, tiers.get(String(row.id)) ?? []));
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
  organisationName: string | null;
  propertyName: string | null;
  spaceName: string | null;
}> {
  const spaceId = isCommercialUuid(input.spaceId) ? input.spaceId! : null;
  let propertyId = isCommercialUuid(input.propertyId) ? input.propertyId! : null;
  let organisationId = isCommercialUuid(input.organisationId)
    ? input.organisationId!
    : null;
  let legacySpacePercent: number | null = null;
  let spaceName: string | null = null;
  let propertyName: string | null = null;
  let organisationName: string | null = null;

  if (spaceId) {
    const { data: space } = await admin
      .from("spaces")
      .select("id, property_id, platform_fee_percent, title")
      .eq("id", spaceId)
      .maybeSingle();
    const row = space as {
      property_id?: string | null;
      platform_fee_percent?: number | null;
      title?: string | null;
    } | null;
    if (!row) {
      throw new Error("Space not found.");
    }
    spaceName = row.title || "Untitled space";
    legacySpacePercent =
      row.platform_fee_percent == null ? null : Number(row.platform_fee_percent);
    if (!propertyId && row.property_id) propertyId = row.property_id;
  }

  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("id, organisation_id, name")
      .eq("id", propertyId)
      .maybeSingle();
    const row = property as {
      organisation_id?: string | null;
      name?: string | null;
    } | null;
    if (!row) {
      throw new Error("Property not found.");
    }
    propertyName = row.name || null;
    if (!organisationId && row.organisation_id) {
      organisationId = row.organisation_id;
    }
  }

  if (organisationId) {
    const { data: organisation } = await admin
      .from("organisations")
      .select("id, name")
      .eq("id", organisationId)
      .maybeSingle();
    organisationName =
      (organisation as { name?: string | null } | null)?.name ?? null;
  }

  return {
    organisationId,
    propertyId,
    spaceId,
    legacySpacePercent,
    organisationName,
    propertyName,
    spaceName,
  };
}

export async function loadBillableInventoryCounts(
  admin: SupabaseClient,
  billedScope: { scopeType: BillableInventoryScope; scopeId: string }
): Promise<BillableInventoryCounts> {
  let organisationId: string | null =
    billedScope.scopeType === "organisation" ? billedScope.scopeId : null;
  let propertyId: string | null =
    billedScope.scopeType === "property" ? billedScope.scopeId : null;
  const spaceId =
    billedScope.scopeType === "space" ? billedScope.scopeId : null;

  let organisation: BillableOrganisationInput | null = null;
  let properties: BillablePropertyInput[] = [];
  let spaces: BillableSpaceInput[] = [];

  if (spaceId) {
    const { data: space } = await admin
      .from("spaces")
      .select("id, property_id, status, archived_at")
      .eq("id", spaceId)
      .maybeSingle();
    const row = space as BillableSpaceInput | null;
    if (row) {
      spaces = [row];
      propertyId = row.property_id ?? propertyId;
    }
  }

  if (propertyId) {
    const { data: property } = await admin
      .from("properties")
      .select("id, organisation_id, archived_at")
      .eq("id", propertyId)
      .maybeSingle();
    const row = property as BillablePropertyInput | null;
    if (row) {
      properties = [row];
      organisationId = row.organisation_id ?? organisationId;
    }
    if (billedScope.scopeType === "property") {
      const { data: propertySpaces } = await admin
        .from("spaces")
        .select("id, property_id, status, archived_at")
        .eq("property_id", propertyId);
      spaces = (propertySpaces || []) as BillableSpaceInput[];
    }
  }

  if (organisationId) {
    const { data: org } = await admin
      .from("organisations")
      .select("id, status, archived_at")
      .eq("id", organisationId)
      .maybeSingle();
    organisation = (org as BillableOrganisationInput | null) ?? {
      id: organisationId,
    };

    if (billedScope.scopeType === "organisation") {
      const { data: orgProperties } = await admin
        .from("properties")
        .select("id, organisation_id, archived_at")
        .eq("organisation_id", organisationId);
      properties = (orgProperties || []) as BillablePropertyInput[];
      const propertyIds = properties.map((property) => property.id);
      if (propertyIds.length > 0) {
        const { data: orgSpaces } = await admin
          .from("spaces")
          .select("id, property_id, status, archived_at")
          .in("property_id", propertyIds);
        spaces = (orgSpaces || []) as BillableSpaceInput[];
      }
    }
  }

  return countBillableInventory({
    scopeType: billedScope.scopeType,
    scopeId: billedScope.scopeId,
    organisation,
    properties,
    spaces,
  });
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
  const resolved = resolveCommercialTerms({
    organisationId: scope.organisationId,
    propertyId: scope.propertyId,
    spaceId: scope.spaceId,
    effectiveAt,
    rows,
    legacySpacePercent:
      input.legacySpacePercent ?? scope.legacySpacePercent,
  });

  const billed =
    resolved.model === "subscription"
      ? subscriptionBilledScope({
          source: resolved.source,
          ...scope,
        })
      : null;
  const inventory = billed
    ? await loadBillableInventoryCounts(admin, billed)
    : null;

  return withSubscriptionResolution(resolved, { ...scope, inventory });
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
      subscription_pricing_mode: value.subscriptionPricingMode,
      effective_from: value.effectiveFrom,
      admin_note: value.adminNote,
      created_by: actorUserId,
    })
    .select(TERM_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save commercial terms.");
  }

  const termId = String((data as { id: string }).id);
  let tiers: CommercialTermTier[] = [];
  if (value.tiers.length > 0) {
    const { data: tierRows, error: tierError } = await admin
      .from("commercial_term_tiers")
      .insert(
        value.tiers.map((tier, index) => ({
          commercial_terms_id: termId,
          min_count: tier.minCount,
          max_count: tier.maxCount,
          monthly_amount: tier.monthlyAmount,
          label: tier.label,
          sort_order: tier.sortOrder || index,
        }))
      )
      .select(
        "id, commercial_terms_id, min_count, max_count, monthly_amount, label, sort_order"
      );

    if (tierError) {
      throw new Error(tierError.message || "Could not save subscription tiers.");
    }
    tiers = ((tierRows || []) as Record<string, unknown>[]).map(asTier);
  }

  return asTermRow(data as Record<string, unknown>, tiers);
}

export type CommercialScopeSearchHit = CommercialSearchHit;

async function searchOrganisations(
  admin: SupabaseClient,
  q: string
): Promise<CommercialSearchHit[]> {
  const { data, error } = await admin
    .from("organisations")
    .select("id, name")
    .ilike("name", `%${q}%`)
    .is("archived_at", null)
    .order("name")
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data || []) as Array<{ id: string; name: string }>).map((row) => ({
    kind: "organisation" as const,
    id: row.id,
    name: row.name,
    organisationId: row.id,
    propertyId: null,
    spaceId: null,
    organisationName: row.name,
    propertyName: null,
  }));
}

async function searchProperties(
  admin: SupabaseClient,
  q: string
): Promise<CommercialSearchHit[]> {
  const { data, error } = await admin
    .from("properties")
    .select("id, name, organisation_id, organisations(name)")
    .ilike("name", `%${q}%`)
    .is("archived_at", null)
    .order("name")
    .limit(20);
  if (error) throw new Error(error.message);
  return (
    (data || []) as Array<{
      id: string;
      name: string;
      organisation_id: string | null;
      organisations?: { name?: string | null } | { name?: string | null }[] | null;
    }>
  ).map((row) => {
    const org = Array.isArray(row.organisations)
      ? row.organisations[0]
      : row.organisations;
    return {
      kind: "property" as const,
      id: row.id,
      name: row.name,
      organisationId: row.organisation_id,
      propertyId: row.id,
      spaceId: null,
      organisationName: org?.name ?? null,
      propertyName: row.name,
    };
  });
}

async function searchSpaces(
  admin: SupabaseClient,
  q: string
): Promise<CommercialSearchHit[]> {
  const { data, error } = await admin
    .from("spaces")
    .select("id, title, property_id, properties(name, organisation_id)")
    .ilike("title", `%${q}%`)
    .neq("status", "deleted")
    .is("archived_at", null)
    .order("title")
    .limit(20);
  if (error) throw new Error(error.message);
  const hits = (
    (data || []) as Array<{
      id: string;
      title: string | null;
      property_id: string | null;
      properties?:
        | { name?: string | null; organisation_id?: string | null }
        | { name?: string | null; organisation_id?: string | null }[]
        | null;
    }>
  ).map((row) => {
    const property = Array.isArray(row.properties)
      ? row.properties[0]
      : row.properties;
    return {
      kind: "space" as const,
      id: row.id,
      name: row.title || "Untitled space",
      organisationId: property?.organisation_id ?? null,
      propertyId: row.property_id,
      spaceId: row.id,
      organisationName: null as string | null,
      propertyName: property?.name ?? null,
    };
  });

  const orgIds = uniqueUuids(hits.map((hit) => hit.organisationId));
  if (orgIds.length === 0) return hits;
  const { data: orgs } = await admin
    .from("organisations")
    .select("id, name")
    .in("id", orgIds);
  const names = new Map(
    ((orgs || []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ])
  );
  return hits.map((hit) => ({
    ...hit,
    organisationName: hit.organisationId
      ? names.get(hit.organisationId) ?? null
      : null,
  }));
}

export async function searchCommercialScopes(
  admin: SupabaseClient,
  input: {
    kind: CommercialSearchKind | "all";
    query: string;
  }
): Promise<CommercialSearchHit[]> {
  const q = input.query.trim().slice(0, 80);
  if (q.length < 2) return [];

  if (input.kind === "all") {
    const [organisations, properties, spaces] = await Promise.all([
      searchOrganisations(admin, q),
      searchProperties(admin, q),
      searchSpaces(admin, q),
    ]);
    return [...organisations, ...properties, ...spaces];
  }
  if (input.kind === "organisation") return searchOrganisations(admin, q);
  if (input.kind === "property") return searchProperties(admin, q);
  return searchSpaces(admin, q);
}

export async function decorateCommercialSearchHits(
  admin: SupabaseClient,
  hits: CommercialSearchHit[]
): Promise<DecoratedCommercialSearchHit[]> {
  if (hits.length === 0) return [];
  const rows = await loadCommercialTermRows(admin, {
    organisationIds: hits.map((hit) => hit.organisationId),
    propertyIds: hits.map((hit) => hit.propertyId),
    spaceIds: hits.map((hit) => hit.spaceId),
  });
  const effectiveAt = new Date();
  return hits.map((hit) =>
    decorateCommercialSearchHit(
      hit,
      resolveCommercialTerms({
        organisationId: hit.organisationId,
        propertyId: hit.propertyId,
        spaceId: hit.spaceId,
        effectiveAt,
        rows,
      })
    )
  );
}
