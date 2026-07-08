import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatCompletedActionTimelineSummary,
  getStandardCompletedAction,
  isFutureCompletedAt,
  sanitizeCompletedActionLabel,
  subjectScope,
  type CompletedActionAuditAction,
} from "./completed-actions";

export type CrmCompletedActionRow = {
  id: string;
  organisation_id: string;
  property_id: string | null;
  space_id: string | null;
  action_key: string | null;
  action_label: string;
  is_custom: boolean;
  note: string | null;
  completed_at: string;
  completed_by: string;
  timeline_engagement_id: string | null;
  created_at: string;
  updated_at: string;
  completed_by_name?: string | null;
  property_name?: string | null;
  space_title?: string | null;
};

export type CompletedActionListFilters = {
  organisationId?: string;
  propertyId?: string;
  spaceId?: string;
  q?: string;
  kind?: "standard" | "custom" | "all";
  completedBy?: string;
  from?: string;
  to?: string;
};

export type CreateCompletedActionInput = {
  organisationId: string;
  propertyId?: string | null;
  spaceId?: string | null;
  actionKey?: string | null;
  actionLabel?: string | null;
  isCustom?: boolean;
  note?: string | null;
  completedAt?: string | null;
  source?: string;
};

export type UpdateCompletedActionInput = {
  actionLabel?: string;
  note?: string | null;
  completedAt?: string;
  propertyId?: string | null;
  spaceId?: string | null;
};

async function writeCompletedActionAudit(
  adminClient: SupabaseClient,
  input: {
    action: CompletedActionAuditAction;
    actorId: string;
    completedActionId?: string | null;
    organisationId?: string | null;
    propertyId?: string | null;
    spaceId?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
    source?: string;
  }
) {
  const { error } = await adminClient.from("crm_completed_action_audits").insert({
    action: input.action,
    actor_id: input.actorId,
    completed_action_id: input.completedActionId ?? null,
    organisation_id: input.organisationId ?? null,
    property_id: input.propertyId ?? null,
    space_id: input.spaceId ?? null,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
    source: input.source ?? "crm_desktop",
  });
  if (error) throw new Error(error.message);
}

function mapActionRow(
  row: Record<string, unknown>,
  extras?: {
    completed_by_name?: string | null;
    property_name?: string | null;
    space_title?: string | null;
  }
): CrmCompletedActionRow {
  return {
    id: row.id as string,
    organisation_id: row.organisation_id as string,
    property_id: (row.property_id as string | null) ?? null,
    space_id: (row.space_id as string | null) ?? null,
    action_key: (row.action_key as string | null) ?? null,
    action_label: row.action_label as string,
    is_custom: Boolean(row.is_custom),
    note: (row.note as string | null) ?? null,
    completed_at: row.completed_at as string,
    completed_by: row.completed_by as string,
    timeline_engagement_id: (row.timeline_engagement_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_by_name: extras?.completed_by_name ?? null,
    property_name: extras?.property_name ?? null,
    space_title: extras?.space_title ?? null,
  };
}

async function resolveSubjectLinks(
  adminClient: SupabaseClient,
  organisationId: string,
  propertyId: string | null | undefined,
  spaceId: string | null | undefined
) {
  let resolvedPropertyId = propertyId ?? null;
  const resolvedSpaceId = spaceId ?? null;

  if (resolvedSpaceId) {
    const { data: space, error } = await adminClient
      .from("spaces")
      .select("id, property_id, crm_organisation_id, title")
      .eq("id", resolvedSpaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!space) throw new Error("Space not found.");

    const spaceOrg = space.crm_organisation_id as string | null;
    if (spaceOrg && spaceOrg !== organisationId) {
      throw new Error("Space does not belong to this organisation.");
    }

    if (!spaceOrg) {
      const spacePropertyId = space.property_id as string | null;
      if (spacePropertyId) {
        const { data: prop } = await adminClient
          .from("properties")
          .select("id, crm_organisation_id")
          .eq("id", spacePropertyId)
          .maybeSingle();
        if (prop?.crm_organisation_id && prop.crm_organisation_id !== organisationId) {
          throw new Error("Space does not belong to this organisation.");
        }
        if (!resolvedPropertyId) resolvedPropertyId = spacePropertyId;
      } else if (!spaceOrg) {
        // Allow linking spaces without CRM org if property also lacks org —
        // but still require the caller organisation to exist (validated below).
      }
    }

    if (resolvedPropertyId && space.property_id && resolvedPropertyId !== space.property_id) {
      throw new Error("Space does not belong to the selected property.");
    }
    if (!resolvedPropertyId && space.property_id) {
      resolvedPropertyId = space.property_id as string;
    }
  }

  if (resolvedPropertyId) {
    const { data: property, error } = await adminClient
      .from("properties")
      .select("id, crm_organisation_id, name")
      .eq("id", resolvedPropertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!property) throw new Error("Property not found.");
    if (
      property.crm_organisation_id &&
      property.crm_organisation_id !== organisationId
    ) {
      throw new Error("Property does not belong to this organisation.");
    }
  }

  const { data: org, error: orgError } = await adminClient
    .from("crm_organisations")
    .select("id")
    .eq("id", organisationId)
    .maybeSingle();
  if (orgError) throw new Error(orgError.message);
  if (!org) throw new Error("Organisation not found.");

  return { propertyId: resolvedPropertyId, spaceId: resolvedSpaceId };
}

async function enrichRows(
  adminClient: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<CrmCompletedActionRow[]> {
  if (!rows.length) return [];

  const profileIds = [...new Set(rows.map((r) => r.completed_by as string))];
  const propertyIds = [
    ...new Set(
      rows.map((r) => r.property_id as string | null).filter(Boolean) as string[]
    ),
  ];
  const spaceIds = [
    ...new Set(
      rows.map((r) => r.space_id as string | null).filter(Boolean) as string[]
    ),
  ];

  const [{ data: profiles }, { data: properties }, { data: spaces }] =
    await Promise.all([
      adminClient.from("crm_profiles").select("id, full_name").in("id", profileIds),
      propertyIds.length
        ? adminClient.from("properties").select("id, name").in("id", propertyIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      spaceIds.length
        ? adminClient.from("spaces").select("id, title").in("id", spaceIds)
        : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    ]);

  const profileMap = Object.fromEntries(
    (profiles || []).map((p) => [p.id, p.full_name])
  );
  const propertyMap = Object.fromEntries(
    (properties || []).map((p) => [p.id, p.name])
  );
  const spaceMap = Object.fromEntries(
    (spaces || []).map((s) => [s.id, s.title])
  );

  return rows.map((row) =>
    mapActionRow(row, {
      completed_by_name: profileMap[row.completed_by as string] ?? null,
      property_name: row.property_id
        ? propertyMap[row.property_id as string] ?? null
        : null,
      space_title: row.space_id ? spaceMap[row.space_id as string] ?? null : null,
    })
  );
}

export async function listCompletedActions(
  adminClient: SupabaseClient,
  filters: CompletedActionListFilters
): Promise<CrmCompletedActionRow[]> {
  let query = adminClient
    .from("crm_completed_actions")
    .select("*")
    .order("completed_at", { ascending: false });

  if (filters.organisationId) query = query.eq("organisation_id", filters.organisationId);
  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters.spaceId) query = query.eq("space_id", filters.spaceId);
  if (filters.completedBy) query = query.eq("completed_by", filters.completedBy);
  if (filters.from) query = query.gte("completed_at", filters.from);
  if (filters.to) query = query.lte("completed_at", filters.to);
  if (filters.kind === "standard") query = query.eq("is_custom", false);
  if (filters.kind === "custom") query = query.eq("is_custom", true);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(`action_label.ilike.%${q}%,note.ilike.%${q}%`);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return enrichRows(adminClient, (data || []) as Record<string, unknown>[]);
}

export async function getStandardActionState(
  adminClient: SupabaseClient,
  input: {
    organisationId: string;
    propertyId?: string | null;
    spaceId?: string | null;
    actionKeys?: string[];
  }
): Promise<Record<string, CrmCompletedActionRow | null>> {
  let query = adminClient
    .from("crm_completed_actions")
    .select("*")
    .eq("organisation_id", input.organisationId)
    .eq("is_custom", false);

  if (input.spaceId) {
    query = query.eq("space_id", input.spaceId);
  } else if (input.propertyId) {
    query = query.eq("property_id", input.propertyId).is("space_id", null);
  } else {
    query = query.is("property_id", null).is("space_id", null);
  }

  if (input.actionKeys?.length) {
    query = query.in("action_key", input.actionKeys);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const enriched = await enrichRows(
    adminClient,
    (data || []) as Record<string, unknown>[]
  );
  const state: Record<string, CrmCompletedActionRow | null> = {};
  for (const key of input.actionKeys || []) {
    state[key] = null;
  }
  for (const row of enriched) {
    if (row.action_key) state[row.action_key] = row;
  }
  return state;
}

async function createTimelineEngagement(
  adminClient: SupabaseClient,
  input: {
    organisationId: string;
    actorId: string;
    actorName: string;
    actionLabel: string;
    completedAt: string;
    note?: string | null;
    propertyName?: string | null;
    spaceTitle?: string | null;
  }
): Promise<string | null> {
  const parts = [
    formatCompletedActionTimelineSummary({
      actorName: input.actorName || "Admin",
      actionLabel: input.actionLabel,
    }),
  ];
  if (input.propertyName) parts.push(`Property: ${input.propertyName}`);
  if (input.spaceTitle) parts.push(`Space: ${input.spaceTitle}`);

  const { data, error } = await adminClient
    .from("crm_engagements")
    .insert({
      organisation_id: input.organisationId,
      type: "note",
      summary: parts[0],
      outcome: [parts.slice(1).join(" · "), input.note?.trim() || null]
        .filter(Boolean)
        .join("\n") || null,
      direction: "internal",
      occurred_at: input.completedAt,
      created_by: input.actorId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return (data?.id as string) ?? null;
}

export async function createCompletedAction(
  adminClient: SupabaseClient,
  input: CreateCompletedActionInput,
  actorId: string
): Promise<CrmCompletedActionRow> {
  const organisationId = input.organisationId;
  if (!organisationId) throw new Error("Organisation is required.");

  const isCustom = Boolean(input.isCustom) || !input.actionKey;
  let actionKey: string | null = null;
  let actionLabel: string;

  if (isCustom) {
    actionLabel = sanitizeCompletedActionLabel(input.actionLabel || "");
    if (!actionLabel) throw new Error("Custom action label is required.");
  } else {
    const standard = getStandardCompletedAction(input.actionKey);
    if (!standard) throw new Error("Unknown standard action key.");
    actionKey = standard.key;
    actionLabel = standard.label;

    const scope = subjectScope({
      organisationId,
      propertyId: input.propertyId,
      spaceId: input.spaceId,
    });
    if (standard.scope === "property" && scope === "organisation") {
      throw new Error("Property-level actions require a property link.");
    }
    if (standard.scope === "space" && scope !== "space") {
      throw new Error("Space-level actions require a space link.");
    }
  }

  const completedAt = input.completedAt?.trim() || new Date().toISOString();
  if (Number.isNaN(new Date(completedAt).getTime())) {
    throw new Error("Invalid completed date.");
  }
  if (isFutureCompletedAt(completedAt)) {
    throw new Error("Completed date cannot be in the future.");
  }

  const links = await resolveSubjectLinks(
    adminClient,
    organisationId,
    input.propertyId,
    input.spaceId
  );

  if (!isCustom && actionKey) {
    const state = await getStandardActionState(adminClient, {
      organisationId,
      propertyId: links.propertyId,
      spaceId: links.spaceId,
      actionKeys: [actionKey],
    });
    if (state[actionKey]) {
      return state[actionKey]!;
    }
  }

  const { data: profile } = await adminClient
    .from("crm_profiles")
    .select("id, full_name")
    .eq("id", actorId)
    .maybeSingle();

  let propertyName: string | null = null;
  let spaceTitle: string | null = null;
  if (links.propertyId) {
    const { data } = await adminClient
      .from("properties")
      .select("name")
      .eq("id", links.propertyId)
      .maybeSingle();
    propertyName = data?.name ?? null;
  }
  if (links.spaceId) {
    const { data } = await adminClient
      .from("spaces")
      .select("title")
      .eq("id", links.spaceId)
      .maybeSingle();
    spaceTitle = data?.title ?? null;
  }

  const engagementId = await createTimelineEngagement(adminClient, {
    organisationId,
    actorId,
    actorName: profile?.full_name || "Admin",
    actionLabel,
    completedAt,
    note: input.note,
    propertyName,
    spaceTitle,
  });

  const { data, error } = await adminClient
    .from("crm_completed_actions")
    .insert({
      organisation_id: organisationId,
      property_id: links.propertyId,
      space_id: links.spaceId,
      action_key: actionKey,
      action_label: actionLabel,
      is_custom: isCustom,
      note: input.note?.trim() || null,
      completed_at: completedAt,
      completed_by: actorId,
      timeline_engagement_id: engagementId,
    })
    .select("*")
    .single();

  if (error) {
    if (engagementId) {
      await adminClient.from("crm_engagements").delete().eq("id", engagementId);
    }
    if (error.code === "23505") {
      const state = await getStandardActionState(adminClient, {
        organisationId,
        propertyId: links.propertyId,
        spaceId: links.spaceId,
        actionKeys: actionKey ? [actionKey] : [],
      });
      if (actionKey && state[actionKey]) return state[actionKey]!;
    }
    throw new Error(error.message);
  }

  await writeCompletedActionAudit(adminClient, {
    action: isCustom ? "completed_action_added" : "standard_action_marked_done",
    actorId,
    completedActionId: data.id as string,
    organisationId,
    propertyId: links.propertyId,
    spaceId: links.spaceId,
    newValue: {
      actionKey,
      actionLabel,
      isCustom,
      completedAt,
      hasNote: Boolean(input.note?.trim()),
    },
    source: input.source || "crm_desktop",
  });

  const [enriched] = await enrichRows(adminClient, [data as Record<string, unknown>]);
  return enriched;
}

export async function updateCompletedAction(
  adminClient: SupabaseClient,
  actionId: string,
  input: UpdateCompletedActionInput,
  actorId: string
): Promise<CrmCompletedActionRow> {
  const { data: existing, error: existingError } = await adminClient
    .from("crm_completed_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Completed action not found.");

  const organisationId = existing.organisation_id as string;
  const nextPropertyId =
    input.propertyId !== undefined ? input.propertyId : (existing.property_id as string | null);
  const nextSpaceId =
    input.spaceId !== undefined ? input.spaceId : (existing.space_id as string | null);

  const links = await resolveSubjectLinks(
    adminClient,
    organisationId,
    nextPropertyId,
    nextSpaceId
  );

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.actionLabel !== undefined) {
    if (!existing.is_custom) {
      throw new Error("Standard action labels cannot be edited.");
    }
    const label = sanitizeCompletedActionLabel(input.actionLabel);
    if (!label) throw new Error("Action label is required.");
    patch.action_label = label;
  }

  if (input.note !== undefined) {
    patch.note = input.note?.trim() || null;
  }

  if (input.completedAt !== undefined) {
    if (Number.isNaN(new Date(input.completedAt).getTime())) {
      throw new Error("Invalid completed date.");
    }
    if (isFutureCompletedAt(input.completedAt)) {
      throw new Error("Completed date cannot be in the future.");
    }
    patch.completed_at = input.completedAt;
  }

  if (input.propertyId !== undefined || input.spaceId !== undefined) {
    patch.property_id = links.propertyId;
    patch.space_id = links.spaceId;
  }

  const { data, error } = await adminClient
    .from("crm_completed_actions")
    .update(patch)
    .eq("id", actionId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const audits: CompletedActionAuditAction[] = ["completed_action_edited"];
  if (
    input.propertyId !== undefined &&
    (existing.property_id as string | null) !== links.propertyId
  ) {
    audits.push("completed_action_property_changed");
  }
  if (
    input.spaceId !== undefined &&
    (existing.space_id as string | null) !== links.spaceId
  ) {
    audits.push("completed_action_space_changed");
  }
  if (
    input.completedAt !== undefined &&
    existing.completed_at !== input.completedAt
  ) {
    audits.push("completed_action_date_changed");
  }

  for (const action of audits) {
    await writeCompletedActionAudit(adminClient, {
      action,
      actorId,
      completedActionId: actionId,
      organisationId,
      propertyId: links.propertyId,
      spaceId: links.spaceId,
      previousValue: {
        actionLabel: existing.action_label,
        completedAt: existing.completed_at,
        propertyId: existing.property_id,
        spaceId: existing.space_id,
        hasNote: Boolean(existing.note),
      },
      newValue: {
        actionLabel: data.action_label,
        completedAt: data.completed_at,
        propertyId: data.property_id,
        spaceId: data.space_id,
        hasNote: Boolean(data.note),
      },
    });
  }

  if (existing.timeline_engagement_id && patch.completed_at) {
    await adminClient
      .from("crm_engagements")
      .update({ occurred_at: patch.completed_at })
      .eq("id", existing.timeline_engagement_id);
  }

  const [enriched] = await enrichRows(adminClient, [data as Record<string, unknown>]);
  return enriched;
}

export async function removeCompletedAction(
  adminClient: SupabaseClient,
  actionId: string,
  actorId: string
): Promise<void> {
  const { data: existing, error: existingError } = await adminClient
    .from("crm_completed_actions")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Completed action not found.");

  const engagementId = existing.timeline_engagement_id as string | null;

  const { error } = await adminClient
    .from("crm_completed_actions")
    .delete()
    .eq("id", actionId);
  if (error) throw new Error(error.message);

  if (engagementId) {
    await adminClient.from("crm_engagements").delete().eq("id", engagementId);
  }

  await writeCompletedActionAudit(adminClient, {
    action: "completed_action_removed",
    actorId,
    completedActionId: actionId,
    organisationId: existing.organisation_id as string,
    propertyId: existing.property_id as string | null,
    spaceId: existing.space_id as string | null,
    previousValue: {
      actionKey: existing.action_key,
      actionLabel: existing.action_label,
      isCustom: existing.is_custom,
      completedAt: existing.completed_at,
      hasNote: Boolean(existing.note),
    },
  });
}
