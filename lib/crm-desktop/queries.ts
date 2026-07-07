import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatISO, startOfDay, subDays } from "date-fns";
import type {
  CrmContactListRow,
  CrmListFilters,
  CrmOrganisationContactSummary,
  CrmOrganisationListRow,
  CrmOverviewStats,
  CrmPipelineListRow,
  CrmSearchResultGroup,
  CrmSpaceListRow,
  CrmTaskListRow,
  PaginatedResult,
} from "./types";
import { resolveOrganisationFilterIds } from "./org-filter-ids";
import { resolveContactFilterIds } from "./contact-filter-ids";
import { getCrmPresetView } from "./preset-views";
import {
  resolveNextCrmTaskForContact,
} from "@/lib/space-place/next-task";
import {
  resolveNextCrmActionForOrganisation,
  linkFollowUpTasksToEngagements,
} from "./next-action";
import { fetchOrganisationMarketplaceCounts } from "./organisation-marketplace-counts";
import { applyNextActionToRow } from "./pipeline-ordering";
import {
  CRM_IN_FILTER_CHUNK_SIZE,
  chunkArray,
  filterIdsInChunks,
  paginateIdsBySortField,
} from "./filtered-pagination";
import { PIPELINE_STAGES } from "@/lib/space-place/constants";
import { crmTodayIsoDate } from "./timezone";

const OPEN_PIPELINE_STAGES = [
  "prospect",
  "first_contact",
  "follow_up",
  "in_progress",
];

const STALE_CONTACT_DAYS = 30;

function todayIsoDate(): string {
  return crmTodayIsoDate();
}

function profileNameMap(
  profiles: { id: string; full_name: string | null }[],
): Record<string, string | null> {
  return Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
}

function contactDisplayName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (row.full_name?.trim()) return row.full_name.trim();
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "Unnamed";
}

async function loadProfiles(adminClient: SupabaseClient) {
  const { data } = await (
    adminClient.from("crm_profiles") as ReturnType<typeof adminClient.from>
  )
    .select("id, full_name")
    .eq("active", true);
  return (data || []) as { id: string; full_name: string | null }[];
}

export async function fetchCrmOverviewStats(
  adminClient: SupabaseClient,
): Promise<CrmOverviewStats> {
  const today = todayIsoDate();
  const weekEnd = formatISO(addDays(new Date(), 7), { representation: "date" });
  const staleBefore = formatISO(subDays(new Date(), STALE_CONTACT_DAYS));

  const [
    dueTodayRes,
    overdueRes,
    upcomingRes,
    pipelineRes,
    openTasksRes,
    orgsRes,
    contactsRes,
    engagementsRes,
    notesRes,
    recentOrgsRes,
    profiles,
  ] = await Promise.all([
    adminClient
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .eq("due_date", today),
    adminClient
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("due_date", today),
    adminClient
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gt("due_date", today)
      .lte("due_date", weekEnd),
    adminClient
      .from("crm_organisations")
      .select("id", { count: "exact", head: true })
      .in("pipeline_stage", OPEN_PIPELINE_STAGES)
      .neq("status", "archived"),
    adminClient
      .from("crm_tasks")
      .select("organisation_id")
      .eq("status", "open")
      .not("organisation_id", "is", null),
    adminClient
      .from("crm_organisations")
      .select("id")
      .neq("status", "archived"),
    adminClient.from("crm_contacts").select("id"),
    adminClient
      .from("crm_engagements")
      .select("contact_id, occurred_at")
      .not("contact_id", "is", null)
      .gte("occurred_at", staleBefore),
    adminClient
      .from("crm_engagements")
      .select("id", { count: "exact", head: true })
      .eq("type", "note")
      .gte("occurred_at", subDays(new Date(), 7).toISOString()),
    adminClient
      .from("crm_organisations")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", subDays(new Date(), 7).toISOString()),
    loadProfiles(adminClient),
  ]);

  const orgIdsWithTasks = new Set(
    ((openTasksRes.data || []) as { organisation_id: string }[]).map(
      (t) => t.organisation_id,
    ),
  );
  const orgsNoNextStep = ((orgsRes.data || []) as { id: string }[]).filter(
    (o) => !orgIdsWithTasks.has(o.id),
  ).length;

  const engagedContactIds = new Set(
    ((engagementsRes.data || []) as { contact_id: string }[]).map(
      (e) => e.contact_id,
    ),
  );
  const contactsStale = ((contactsRes.data || []) as { id: string }[]).filter(
    (c) => !engagedContactIds.has(c.id),
  ).length;

  const { data: ownerTasks } = await adminClient
    .from("crm_tasks")
    .select("owner_id")
    .eq("status", "open");

  const ownerCounts = new Map<string | null, number>();
  for (const row of (ownerTasks || []) as { owner_id: string | null }[]) {
    ownerCounts.set(row.owner_id, (ownerCounts.get(row.owner_id) || 0) + 1);
  }
  const nameMap = profileNameMap(profiles);
  const tasksByOwner = [...ownerCounts.entries()]
    .map(([owner_id, count]) => ({
      owner_id,
      owner_name: owner_id ? nameMap[owner_id] || "Unknown" : "Unassigned",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    dueToday: dueTodayRes.count || 0,
    overdue: overdueRes.count || 0,
    upcomingWeek: upcomingRes.count || 0,
    openPipeline: pipelineRes.count || 0,
    orgsNoNextStep,
    contactsStale,
    recentNotes: notesRes.count || 0,
    recentUpdates: recentOrgsRes.count || 0,
    tasksByOwner,
  };
}

async function enrichOrganisations(
  adminClient: SupabaseClient,
  orgs: Record<string, unknown>[],
  profiles: { id: string; full_name: string | null }[],
): Promise<CrmOrganisationListRow[]> {
  if (!orgs.length) return [];
  const orgIds = orgs.map((o) => o.id as string);
  const nameMap = profileNameMap(profiles);

  const [contactsRes, propertiesRes, engagementsRes, tasksRes] =
    await Promise.all([
      adminClient
        .from("crm_contacts")
        .select(
          "id, organisation_id, full_name, first_name, last_name, role, email, phone, whatsapp",
        )
        .in("organisation_id", orgIds)
        .order("created_at", { ascending: true }),
      adminClient
        .from("properties")
        .select("id, crm_organisation_id")
        .in("crm_organisation_id", orgIds)
        .is("archived_at", null),
      adminClient
        .from("crm_engagements")
        .select("organisation_id, id, contact_id, occurred_at, summary, type")
        .in("organisation_id", orgIds)
        .order("occurred_at", { ascending: false })
        .limit(orgIds.length * 3),
      adminClient
        .from("crm_tasks")
        .select(
          "id, organisation_id, contact_id, due_date, title, status, created_at"
        )
        .in("organisation_id", orgIds)
        .eq("status", "open"),
    ]);

  const marketplaceCounts = await fetchOrganisationMarketplaceCounts(
    adminClient,
    orgIds
  );

  const contactsByOrg = new Map<string, typeof contactsRes.data>();
  for (const c of (contactsRes.data || []) as {
    id: string;
    organisation_id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  }[]) {
    const list = contactsByOrg.get(c.organisation_id) || [];
    list.push(c);
    contactsByOrg.set(c.organisation_id, list);
  }

  const propertyCount = new Map<string, number>();
  for (const p of (propertiesRes.data || []) as {
    crm_organisation_id: string;
  }[]) {
    propertyCount.set(
      p.crm_organisation_id,
      (propertyCount.get(p.crm_organisation_id) || 0) + 1,
    );
  }

  const spaceCount = new Map<string, number>();
  for (const orgId of orgIds) {
    const counts = marketplaceCounts.get(orgId);
    spaceCount.set(orgId, counts?.linkedSpaceCount ?? 0);
    propertyCount.set(orgId, counts?.linkedPropertyCount ?? 0);
  }

  const lastEngagement = new Map<
    string,
    { occurred_at: string; summary: string | null }
  >();
  for (const e of (engagementsRes.data || []) as {
    organisation_id: string;
    occurred_at: string;
    summary: string | null;
  }[]) {
    if (!lastEngagement.has(e.organisation_id)) {
      lastEngagement.set(e.organisation_id, {
        occurred_at: e.occurred_at,
        summary: e.summary,
      });
    }
  }

  const nextTask = new Map<
    string,
    ReturnType<typeof resolveNextCrmActionForOrganisation>
  >();
  const allOpenTasks = ((tasksRes.data || []) as {
    id: string;
    organisation_id: string;
    contact_id: string | null;
    due_date: string | null;
    title: string;
    status: string;
    created_at: string;
  }[]);

  const engagementsByOrg = new Map<string, typeof engagementsRes.data>();
  for (const e of (engagementsRes.data || []) as {
    organisation_id: string;
    id: string;
    contact_id: string | null;
    type: string;
    summary: string | null;
    occurred_at: string;
  }[]) {
    const list = engagementsByOrg.get(e.organisation_id) || [];
    list.push(e);
    engagementsByOrg.set(e.organisation_id, list);
  }

  for (const orgRow of orgs) {
    const orgId = orgRow.id as string;
    const contacts = contactsByOrg.get(orgId) || [];
    const primaryId = (orgRow.primary_contact_id as string | null) ?? null;
    const orgTasks = allOpenTasks.filter((t) => t.organisation_id === orgId);
    const linkedEngagements = linkFollowUpTasksToEngagements(
      (engagementsByOrg.get(orgId) || []).map((e) => ({
        id: e.id,
        organisation_id: e.organisation_id,
        contact_id: e.contact_id,
        type: e.type,
        summary: e.summary,
        occurred_at: e.occurred_at,
      })),
      orgTasks
    );
    const resolved = resolveNextCrmActionForOrganisation(
      orgTasks,
      orgId,
      primaryId,
      linkedEngagements
    );
    if (resolved) nextTask.set(orgId, resolved);
  }

  return orgs.map((org) => {
    const id = org.id as string;
    const contacts = contactsByOrg.get(id) || [];
    const explicitPrimaryId = (org.primary_contact_id as string | null) ?? null;
    const primary = explicitPrimaryId
      ? contacts.find((c) => c.id === explicitPrimaryId) ?? null
      : null;
    const additional: CrmOrganisationContactSummary[] = contacts
      .filter((c) => c.id !== primary?.id)
      .map((c) => ({
        id: c.id,
        name: contactDisplayName(c),
        role: c.role ?? null,
        email: c.email ?? null,
        phone: c.phone || c.whatsapp || null,
      }));
    const eng = lastEngagement.get(id);
    const action = nextTask.get(id);
    const assignedTo = (org.assigned_to as string | null) ?? null;

    const baseRow: CrmOrganisationListRow = {
      id,
      name: org.name as string,
      type: (org.type as string | null) ?? null,
      address: (org.address as string | null) ?? null,
      pipeline_stage: org.pipeline_stage as string,
      status: org.status as string,
      assigned_to: assignedTo,
      assigned_name: assignedTo ? (nameMap[assignedTo] ?? null) : null,
      primary_contact_id: primary?.id ?? null,
      primary_contact_name: primary ? contactDisplayName(primary) : null,
      primary_contact_role: primary?.role ?? null,
      primary_contact_email: primary?.email ?? null,
      primary_contact_phone: primary?.phone || primary?.whatsapp || null,
      additional_contacts: additional,
      contact_count: contacts.length,
      space_count: spaceCount.get(id) || 0,
      property_count: propertyCount.get(id) || 0,
      last_interaction_at: eng?.occurred_at ?? null,
      last_interaction_summary: eng?.summary ?? null,
      next_task_id: action?.taskId ?? null,
      next_task_due: action?.actionDate ?? null,
      next_task_title: action?.title ?? null,
      next_action_title: action?.title ?? null,
      next_action_date: action?.actionDate ?? null,
      next_action_date_group: action?.dateGroup ?? "none",
      pipeline_manual_rank:
        (org.pipeline_manual_rank as number | null | undefined) ?? null,
      pipeline_rank_updated_at:
        (org.pipeline_rank_updated_at as string | null | undefined) ?? null,
      pipeline_rank_updated_by:
        (org.pipeline_rank_updated_by as string | null | undefined) ?? null,
      created_at: org.created_at as string,
      updated_at: org.updated_at as string,
    };
    return applyNextActionToRow(baseRow, action ?? null);
  });
}

function applyOrganisationListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: CrmListFilters,
) {
  let q = query.neq("status", "archived");
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    q = q.or(`name.ilike.${term},type.ilike.${term},address.ilike.${term}`);
  }
  if (filters.organisationType) {
    q = q.eq("type", filters.organisationType);
  }
  if (filters.assignedTo) {
    q =
      filters.assignedTo === "unassigned"
        ? q.is("assigned_to", null)
        : q.eq("assigned_to", filters.assignedTo);
  }
  if (filters.pipelineStage) {
    q = q.eq("pipeline_stage", filters.pipelineStage);
  }
  return q;
}

export async function fetchCrmOrganisations(
  adminClient: SupabaseClient,
  filters: CrmListFilters,
): Promise<PaginatedResult<CrmOrganisationListRow>> {
  const page = Math.max(1, filters.page || 1);
  const maxPageSize = filters.boardMode ? 150 : 100;
  const pageSize = Math.min(maxPageSize, Math.max(10, filters.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const filterIds = await resolveOrganisationFilterIds(adminClient, filters);
  if (filterIds && filterIds.size === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  const sort = filters.sort || "name";
  const ascending = filters.sortDir !== "desc";

  if (filterIds) {
    const matchingIds = await filterIdsInChunks(
      adminClient,
      "crm_organisations",
      filterIds,
      (query) => applyOrganisationListFilters(query, filters),
    );
    if (!matchingIds.length) {
      return { rows: [], total: 0, page, pageSize };
    }

    const { pageIds, total } = await paginateIdsBySortField(
      adminClient,
      "crm_organisations",
      matchingIds,
      sort,
      ascending,
      page,
      pageSize,
    );
    if (!pageIds.length) {
      return { rows: [], total, page, pageSize };
    }

    const { data, error } = await adminClient
      .from("crm_organisations")
      .select("*")
      .in("id", pageIds);
    if (error) throw new Error(error.message);

    const orderMap = new Map(pageIds.map((id, index) => [id, index]));
    const sorted = [...((data || []) as Record<string, unknown>[])].sort(
      (a, b) =>
        (orderMap.get(a.id as string) ?? 0) -
        (orderMap.get(b.id as string) ?? 0),
    );

    const profiles = await loadProfiles(adminClient);
    const rows = await enrichOrganisations(adminClient, sorted, profiles);
    return { rows, total, page, pageSize };
  }

  let query = adminClient
    .from("crm_organisations")
    .select("*", { count: "exact" });

  query = applyOrganisationListFilters(query, filters);
  query = query.order(sort, { ascending });

  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const profiles = await loadProfiles(adminClient);
  const rows = await enrichOrganisations(
    adminClient,
    (data || []) as Record<string, unknown>[],
    profiles,
  );

  return { rows, total: count || 0, page, pageSize };
}

function applyContactListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: CrmListFilters,
) {
  let q = query;
  if (filters.organisationId) {
    q = q.eq("organisation_id", filters.organisationId);
  }
  if (filters.assignedTo) {
    q =
      filters.assignedTo === "unassigned"
        ? q.is("assigned_to", null)
        : q.eq("assigned_to", filters.assignedTo);
  }
  if (filters.contactRole?.trim()) {
    q = q.ilike("role", `%${filters.contactRole.trim()}%`);
  }
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    q = q.or(
      `full_name.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term},role.ilike.${term}`,
    );
  }
  return q;
}

function buildContactListRows(
  contacts: Record<string, unknown>[],
  orgMap: Record<
    string,
    { id: string; name: string; type: string | null; pipeline_stage: string }
  >,
  engagementsData: unknown,
  tasksData: unknown,
  nameMap: Record<string, string | null>,
): CrmContactListRow[] {
  const lastEng = new Map<
    string,
    { occurred_at: string; summary: string | null }
  >();
  for (const e of (engagementsData || []) as {
    contact_id: string;
    occurred_at: string;
    summary: string | null;
  }[]) {
    if (!lastEng.has(e.contact_id)) {
      lastEng.set(e.contact_id, {
        occurred_at: e.occurred_at,
        summary: e.summary,
      });
    }
  }

  const taskRows = (tasksData || []) as {
    id: string;
    contact_id: string;
    due_date: string | null;
    title: string;
    status: string;
  }[];
  const nextTask = new Map<
    string,
    { id: string; due_date: string | null; title: string }
  >();
  const contactIds = [
    ...new Set(taskRows.map((t) => t.contact_id).filter(Boolean)),
  ];
  for (const contactId of contactIds) {
    const resolved = resolveNextCrmTaskForContact(taskRows, contactId);
    if (resolved) {
      nextTask.set(contactId, {
        id: resolved.id,
        due_date: resolved.due_date,
        title: resolved.title,
      });
    }
  }

  return contacts.map((c) => {
    const id = c.id as string;
    const orgId = c.organisation_id as string;
    const org = orgMap[orgId];
    const assignedTo = (c.assigned_to as string | null) ?? null;
    const eng = lastEng.get(id);
    const task = nextTask.get(id);
    return {
      id,
      organisation_id: orgId,
      organisation_name: org?.name || "Unknown",
      organisation_type: org?.type ?? null,
      organisation_pipeline_stage: org?.pipeline_stage ?? null,
      full_name: contactDisplayName({
        full_name: c.full_name as string | null,
        first_name: c.first_name as string | null,
        last_name: c.last_name as string | null,
      }),
      role: (c.role as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      whatsapp: (c.whatsapp as string | null) ?? null,
      status: (c.status as string | null) ?? null,
      assigned_to: assignedTo,
      assigned_name: assignedTo ? (nameMap[assignedTo] ?? null) : null,
      last_interaction_at: eng?.occurred_at ?? null,
      last_interaction_summary: eng?.summary ?? null,
      next_task_id: task?.id ?? null,
      next_task_due: task?.due_date ?? null,
      next_task_title: task?.title ?? null,
      updated_at: c.updated_at as string,
    };
  });
}

async function contactIdsForOrganisationFilter(
  adminClient: SupabaseClient,
  orgIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const chunk of chunkArray(orgIds, CRM_IN_FILTER_CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from("crm_contacts")
      .select("id")
      .in("organisation_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { id: string }[]) {
      ids.add(row.id);
    }
  }
  return ids;
}

function intersectIdSets(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter((id) => b.has(id)));
}

export async function fetchCrmContacts(
  adminClient: SupabaseClient,
  filters: CrmListFilters,
): Promise<PaginatedResult<CrmContactListRow>> {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const presetFilterIds = await resolveContactFilterIds(adminClient, filters);
  if (presetFilterIds && presetFilterIds.size === 0) {
    return { rows: [], total: 0, page, pageSize };
  }

  let orgIdsForType: string[] | null = null;
  if (filters.organisationType || filters.pipelineStage) {
    let orgQuery = adminClient.from("crm_organisations").select("id");
    if (filters.organisationType) {
      orgQuery = orgQuery.eq("type", filters.organisationType);
    }
    if (filters.pipelineStage) {
      orgQuery = orgQuery.eq("pipeline_stage", filters.pipelineStage);
    }
    const { data: orgRows } = await orgQuery;
    orgIdsForType = ((orgRows || []) as { id: string }[]).map((o) => o.id);
    if (!orgIdsForType.length) {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  const sort = filters.sort || "full_name";
  const ascending = filters.sortDir !== "desc";

  const useChunkedPath =
    Boolean(presetFilterIds) ||
    Boolean(orgIdsForType && orgIdsForType.length > CRM_IN_FILTER_CHUNK_SIZE);

  if (useChunkedPath) {
    let candidateIds = presetFilterIds ?? new Set<string>();

    if (orgIdsForType) {
      const orgContactIds = await contactIdsForOrganisationFilter(
        adminClient,
        orgIdsForType,
      );
      if (!orgContactIds.size) {
        return { rows: [], total: 0, page, pageSize };
      }
      candidateIds = presetFilterIds
        ? intersectIdSets(presetFilterIds, orgContactIds)
        : orgContactIds;
    }

    if (!candidateIds.size) {
      return { rows: [], total: 0, page, pageSize };
    }

    const matchingIds = await filterIdsInChunks(
      adminClient,
      "crm_contacts",
      candidateIds,
      (query) => applyContactListFilters(query, filters),
    );
    if (!matchingIds.length) {
      return { rows: [], total: 0, page, pageSize };
    }

    const { pageIds, total } = await paginateIdsBySortField(
      adminClient,
      "crm_contacts",
      matchingIds,
      sort,
      ascending,
      page,
      pageSize,
    );
    if (!pageIds.length) {
      return { rows: [], total, page, pageSize };
    }

    const { data, error } = await adminClient
      .from("crm_contacts")
      .select("*")
      .in("id", pageIds);
    if (error) throw new Error(error.message);

    const orderMap = new Map(pageIds.map((id, index) => [id, index]));
    const contacts = [...((data || []) as Record<string, unknown>[])].sort(
      (a, b) =>
        (orderMap.get(a.id as string) ?? 0) -
        (orderMap.get(b.id as string) ?? 0),
    );

    const contactIds = contacts.map((c) => c.id as string);
    const orgIds = [
      ...new Set(contacts.map((c) => c.organisation_id as string)),
    ];

    const profiles = await loadProfiles(adminClient);
    const nameMap = profileNameMap(profiles);

    const [orgsRes, engagementsRes, tasksRes] = await Promise.all([
      orgIds.length
        ? adminClient
            .from("crm_organisations")
            .select("id, name, type, pipeline_stage")
            .in("id", orgIds)
        : Promise.resolve({ data: [] }),
      contactIds.length
        ? adminClient
            .from("crm_engagements")
            .select("contact_id, occurred_at, summary")
            .in("contact_id", contactIds)
            .order("occurred_at", { ascending: false })
            .limit(contactIds.length * 2)
        : Promise.resolve({ data: [] }),
      contactIds.length
        ? adminClient
            .from("crm_tasks")
            .select("id, contact_id, due_date, title, status")
            .in("contact_id", contactIds)
            .eq("status", "open")
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const orgMap = Object.fromEntries(
      (
        (orgsRes.data || []) as {
          id: string;
          name: string;
          type: string | null;
          pipeline_stage: string;
        }[]
      ).map((o) => [o.id, o]),
    );

    const rows = buildContactListRows(
      contacts,
      orgMap,
      engagementsRes.data,
      tasksRes.data,
      nameMap,
    );

    return { rows, total, page, pageSize };
  }

  let query = adminClient.from("crm_contacts").select("*", { count: "exact" });

  if (filters.organisationId) {
    query = query.eq("organisation_id", filters.organisationId);
  }
  if (orgIdsForType) {
    query = query.in("organisation_id", orgIdsForType);
  }
  if (filters.assignedTo) {
    query =
      filters.assignedTo === "unassigned"
        ? query.is("assigned_to", null)
        : query.eq("assigned_to", filters.assignedTo);
  }
  if (filters.contactRole?.trim()) {
    query = query.ilike("role", `%${filters.contactRole.trim()}%`);
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    query = query.or(
      `full_name.ilike.${q},first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q},role.ilike.${q}`,
    );
  }

  query = query.order(sort, { ascending });

  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const contacts = (data || []) as Record<string, unknown>[];
  const contactIds = contacts.map((c) => c.id as string);
  const orgIds = [...new Set(contacts.map((c) => c.organisation_id as string))];

  const profiles = await loadProfiles(adminClient);
  const nameMap = profileNameMap(profiles);

  const [orgsRes, engagementsRes, tasksRes] = await Promise.all([
    orgIds.length
      ? adminClient
          .from("crm_organisations")
          .select("id, name, type, pipeline_stage")
          .in("id", orgIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? adminClient
          .from("crm_engagements")
          .select("contact_id, occurred_at, summary")
          .in("contact_id", contactIds)
          .order("occurred_at", { ascending: false })
          .limit(contactIds.length * 2)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? adminClient
          .from("crm_tasks")
          .select("id, contact_id, due_date, title, status")
          .in("contact_id", contactIds)
          .eq("status", "open")
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const orgMap = Object.fromEntries(
    (
      (orgsRes.data || []) as {
        id: string;
        name: string;
        type: string | null;
        pipeline_stage: string;
      }[]
    ).map((o) => [o.id, o]),
  );

  const rows = buildContactListRows(
    contacts,
    orgMap,
    engagementsRes.data,
    tasksRes.data,
    nameMap,
  );

  return { rows, total: count || 0, page, pageSize };
}

export async function fetchCrmTasks(
  adminClient: SupabaseClient,
  filters: CrmListFilters & {
    bucket?: string;
    ownerId?: string;
    activityType?: string;
  },
): Promise<PaginatedResult<CrmTaskListRow>> {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize || 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const today = todayIsoDate();
  const weekEnd = formatISO(addDays(new Date(), 7), { representation: "date" });
  const tomorrow = formatISO(addDays(new Date(), 1), {
    representation: "date",
  });

  let query = adminClient.from("crm_tasks").select(
    `
      *,
      crm_organisations ( id, name, pipeline_stage ),
      crm_contacts ( id, full_name, first_name, last_name )
    `,
    { count: "exact" },
  );

  if (filters.bucket === "today") {
    query = query.eq("status", "open").eq("due_date", today);
  } else if (filters.bucket === "overdue") {
    query = query.eq("status", "open").lt("due_date", today);
  } else if (filters.bucket === "tomorrow") {
    query = query.eq("status", "open").eq("due_date", tomorrow);
  } else if (filters.bucket === "week") {
    query = query
      .eq("status", "open")
      .gte("due_date", today)
      .lte("due_date", weekEnd);
  } else if (filters.bucket === "next7") {
    query = query
      .eq("status", "open")
      .gte("due_date", today)
      .lte("due_date", weekEnd);
  } else if (filters.bucket === "no_date") {
    query = query.eq("status", "open").is("due_date", null);
  } else if (filters.bucket === "done") {
    query = query.eq("status", "done");
  } else {
    query = query.eq("status", "open");
  }

  if (filters.ownerId) {
    query = query.eq("owner_id", filters.ownerId);
  }
  if (filters.organisationId) {
    query = query.eq("organisation_id", filters.organisationId);
  }
  if (filters.q?.trim()) {
    query = query.ilike("title", `%${filters.q.trim()}%`);
  }

  query = query.order("due_date", { ascending: true, nullsFirst: false });

  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const profiles = await loadProfiles(adminClient);
  const nameMap = profileNameMap(profiles);

  const rows: CrmTaskListRow[] = (
    (data || []) as Record<string, unknown>[]
  ).map((t) => {
    const org = t.crm_organisations as {
      id: string;
      name: string;
      pipeline_stage: string;
    } | null;
    const contact = t.crm_contacts as {
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    } | null;
    const ownerId = (t.owner_id as string | null) ?? null;
    return {
      id: t.id as string,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      due_date: (t.due_date as string | null) ?? null,
      status: t.status as string,
      priority: t.priority as string,
      owner_id: ownerId,
      owner_name: ownerId ? (nameMap[ownerId] ?? null) : null,
      organisation_id: (t.organisation_id as string | null) ?? null,
      organisation_name: org?.name ?? null,
      contact_id: (t.contact_id as string | null) ?? null,
      contact_name: contact ? contactDisplayName(contact) : null,
      pipeline_stage: org?.pipeline_stage ?? null,
    };
  });

  return { rows, total: count || rows.length, page, pageSize };
}

export async function fetchCrmPipeline(
  adminClient: SupabaseClient,
  filters: CrmListFilters,
): Promise<PaginatedResult<CrmPipelineListRow>> {
  const orgFilters = {
    ...filters,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  const orgResult = await fetchCrmOrganisations(adminClient, orgFilters);
  const rows: CrmPipelineListRow[] = orgResult.rows.map((o) => ({
    organisation_id: o.id,
    organisation_name: o.name,
    organisation_type: o.type,
    pipeline_stage: o.pipeline_stage,
    main_contact_id: o.primary_contact_id,
    main_contact_name: o.primary_contact_name,
    main_contact_role: o.primary_contact_role,
    main_contact_email: o.primary_contact_email,
    main_contact_phone: o.primary_contact_phone,
    contact_count: o.contact_count,
    space_count: o.space_count,
    property_count: o.property_count,
    last_interaction_at: o.last_interaction_at,
    last_interaction_summary: o.last_interaction_summary,
    next_task_id: o.next_task_id,
    next_task_due: o.next_task_due,
    next_task_title: o.next_task_title,
    assigned_to: o.assigned_to,
    assigned_name: o.assigned_name,
    address: o.address,
    updated_at: o.updated_at,
  }));
  return { ...orgResult, rows };
}

/** Count organisations per pipeline stage with the same filters (stage filter excluded). */
export async function fetchCrmPipelineStageCounts(
  adminClient: SupabaseClient,
  filters: CrmListFilters,
): Promise<Record<string, number>> {
  const counts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0]));

  const filtersNoStage: CrmListFilters = {
    ...filters,
    pipelineStage: undefined,
    page: undefined,
    pageSize: undefined,
    boardMode: undefined,
  };

  const filterIds = await resolveOrganisationFilterIds(
    adminClient,
    filtersNoStage,
  );
  if (filterIds && filterIds.size === 0) return counts;

  async function loadStages(ids?: Set<string>) {
    if (ids) {
      const idList = [...ids];
      const stages: { pipeline_stage: string }[] = [];
      for (const chunk of chunkArray(idList, CRM_IN_FILTER_CHUNK_SIZE)) {
        let query = adminClient
          .from("crm_organisations")
          .select("pipeline_stage")
          .in("id", chunk);
        query = applyOrganisationListFilters(query, filtersNoStage);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        stages.push(...((data || []) as { pipeline_stage: string }[]));
      }
      return stages;
    }

    let query = adminClient
      .from("crm_organisations")
      .select("pipeline_stage")
      .neq("status", "archived");
    query = applyOrganisationListFilters(query, filtersNoStage);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as { pipeline_stage: string }[];
  }

  const rows = await loadStages(filterIds ?? undefined);
  for (const row of rows) {
    const stage = row.pipeline_stage;
    if (stage in counts) counts[stage] += 1;
  }
  return counts;
}

export async function fetchCrmSpaces(
  adminClient: SupabaseClient,
  filters: CrmListFilters,
): Promise<PaginatedResult<CrmSpaceListRow>> {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from("spaces")
    .select(
      "id, title, city, suburb, status, property_id, crm_organisation_id, crm_contact_id",
      { count: "exact" },
    )
    .not("crm_organisation_id", "is", null);

  if (filters.q?.trim()) {
    query = query.ilike("title", `%${filters.q.trim()}%`);
  }
  if (filters.organisationId) {
    query = query.eq("crm_organisation_id", filters.organisationId);
  }

  query = query.order("title", { ascending: true });
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const spaces = (data || []) as Record<string, unknown>[];
  const orgIds = [
    ...new Set(
      spaces
        .map((s) => s.crm_organisation_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];
  const contactIds = [
    ...new Set(
      spaces
        .map((s) => s.crm_contact_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  const propertyIds = [
    ...new Set(
      spaces
        .map((s) => s.property_id as string | null)
        .filter(Boolean) as string[],
    ),
  ];

  const profiles = await loadProfiles(adminClient);

  const [orgsRes, contactsRes, orgList, propertiesRes] = await Promise.all([
    orgIds.length
      ? adminClient
          .from("crm_organisations")
          .select("id, name, pipeline_stage, assigned_to")
          .in("id", orgIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? adminClient
          .from("crm_contacts")
          .select("id, full_name, first_name, last_name")
          .in("id", contactIds)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? enrichOrganisations(
          adminClient,
          orgIds.map((id) => ({ id })),
          profiles,
        )
      : Promise.resolve([]),
    propertyIds.length
      ? adminClient.from("properties").select("id, name").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const orgMap = Object.fromEntries(
    (
      (orgsRes.data || []) as {
        id: string;
        name: string;
        pipeline_stage: string;
        assigned_to: string | null;
      }[]
    ).map((o) => [o.id, o]),
  );
  const contactMap = Object.fromEntries(
    (
      (contactsRes.data || []) as {
        id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]
    ).map((c) => [c.id, contactDisplayName(c)]),
  );
  const orgEnriched = Object.fromEntries(orgList.map((o) => [o.id, o]));
  const propertyMap = Object.fromEntries(
    ((propertiesRes.data || []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const nameMap = profileNameMap(profiles);

  const rows: CrmSpaceListRow[] = spaces.map((s) => {
    const orgId = s.crm_organisation_id as string;
    const org = orgMap[orgId];
    const enriched = orgEnriched[orgId];
    const contactId = (s.crm_contact_id as string | null) ?? null;
    const assignedTo = org?.assigned_to ?? null;
    const propertyId = (s.property_id as string | null) ?? null;
    return {
      id: s.id as string,
      title: (s.title as string) || "Untitled space",
      city: (s.city as string | null) ?? null,
      suburb: (s.suburb as string | null) ?? null,
      property_id: propertyId,
      property_name: propertyId ? (propertyMap[propertyId] ?? null) : null,
      listing_status: (s.status as string | null) ?? null,
      organisation_id: orgId,
      organisation_name: org?.name ?? null,
      contact_id: contactId,
      contact_name: contactId ? (contactMap[contactId] ?? null) : null,
      pipeline_stage: org?.pipeline_stage ?? null,
      last_interaction_at: enriched?.last_interaction_at ?? null,
      next_task_id: enriched?.next_task_id ?? null,
      next_task_due: enriched?.next_task_due ?? null,
      next_task_title: enriched?.next_task_title ?? null,
      assigned_name: assignedTo ? (nameMap[assignedTo] ?? null) : null,
    };
  });

  return { rows, total: count || rows.length, page, pageSize };
}

export async function searchCrmRecords(
  adminClient: SupabaseClient,
  q: string,
): Promise<CrmSearchResultGroup[]> {
  const term = q.trim();
  if (!term) return [];
  const pattern = `%${term}%`;

  const [orgs, contacts, spaces, properties] = await Promise.all([
    adminClient
      .from("crm_organisations")
      .select("id, name, type, address")
      .or(
        `name.ilike.${pattern},type.ilike.${pattern},address.ilike.${pattern}`,
      )
      .neq("status", "archived")
      .limit(8),
    adminClient
      .from("crm_contacts")
      .select("id, full_name, first_name, last_name, email, organisation_id")
      .or(
        `full_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
      )
      .limit(8),
    adminClient
      .from("spaces")
      .select("id, title, city, suburb")
      .ilike("title", pattern)
      .limit(8),
    adminClient
      .from("properties")
      .select("id, name, city, suburb")
      .ilike("name", pattern)
      .limit(8),
  ]);

  const groups: CrmSearchResultGroup[] = [];

  if (orgs.data?.length) {
    groups.push({
      type: "organisation",
      items: (
        orgs.data as {
          id: string;
          name: string;
          type: string | null;
          address: string | null;
        }[]
      ).map((o) => ({
        id: o.id,
        title: o.name,
        subtitle: [o.type, o.address].filter(Boolean).join(" · ") || null,
        href: `/admin/crm/organisations/${o.id}`,
      })),
    });
  }

  if (contacts.data?.length) {
    groups.push({
      type: "contact",
      items: (
        contacts.data as {
          id: string;
          full_name: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }[]
      ).map((c) => ({
        id: c.id,
        title: contactDisplayName(c),
        subtitle: c.email,
        href: `/admin/crm/contacts/${c.id}`,
      })),
    });
  }

  if (spaces.data?.length) {
    groups.push({
      type: "space",
      items: (
        spaces.data as {
          id: string;
          title: string;
          city: string | null;
          suburb: string | null;
        }[]
      ).map((s) => ({
        id: s.id,
        title: s.title || "Untitled",
        subtitle: [s.suburb, s.city].filter(Boolean).join(", ") || null,
        href: `/admin/spaces/${s.id}/manage`,
      })),
    });
  }

  if (properties.data?.length) {
    groups.push({
      type: "property",
      items: (
        properties.data as {
          id: string;
          name: string;
          city: string | null;
          suburb: string | null;
        }[]
      ).map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: [p.suburb, p.city].filter(Boolean).join(", ") || null,
        href: `/admin/properties/${p.id}`,
      })),
    });
  }

  return groups;
}

export function parseCrmListFilters(
  searchParams: URLSearchParams,
): CrmListFilters {
  const presetKey = searchParams.get("preset");
  const preset = getCrmPresetView(presetKey);
  const presetFilters = preset?.filters ?? {};

  return {
    q: searchParams.get("q") || presetFilters.q || undefined,
    assignedTo:
      searchParams.get("assigned") || presetFilters.assignedTo || undefined,
    pipelineStage:
      searchParams.get("stage") || presetFilters.pipelineStage || undefined,
    organisationType:
      searchParams.get("type") || presetFilters.organisationType || undefined,
    overdue:
      searchParams.get("overdue") === "1" || Boolean(presetFilters.overdue),
    noNextStep:
      searchParams.get("no_next") === "1" || Boolean(presetFilters.noNextStep),
    noFollowUpDate:
      searchParams.get("no_follow_up") === "1" ||
      Boolean(presetFilters.noFollowUpDate),
    noContact:
      searchParams.get("no_contact") === "1" ||
      Boolean(presetFilters.noContact),
    primaryRequired:
      searchParams.get("primary_required") === "1" ||
      Boolean(presetFilters.primaryRequired),
    noSpaces:
      searchParams.get("no_spaces") === "1" || Boolean(presetFilters.noSpaces),
    noEmail:
      searchParams.get("no_email") === "1" || Boolean(presetFilters.noEmail),
    noPhone:
      searchParams.get("no_phone") === "1" || Boolean(presetFilters.noPhone),
    staleInteraction:
      searchParams.get("stale") === "1" ||
      Boolean(presetFilters.staleInteraction),
    organisationId: searchParams.get("org") || undefined,
    contactRole: searchParams.get("role") || undefined,
    bucket: searchParams.get("bucket") || presetFilters.bucket || undefined,
    ownerId: searchParams.get("owner") || undefined,
    page: Number(searchParams.get("page") || "1") || 1,
    pageSize: Number(searchParams.get("pageSize") || "25") || 25,
    sort: searchParams.get("sort") || presetFilters.sort || undefined,
    sortDir:
      (searchParams.get("dir") as "asc" | "desc") ||
      presetFilters.sortDir ||
      undefined,
    preset: presetKey || undefined,
  };
}
