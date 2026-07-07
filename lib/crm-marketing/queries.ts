import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CrmMarketingContactDetail,
  CrmMarketingContactRow,
  CrmMarketingListRow,
  CrmMarketingOverviewStats,
  MarketingContactPreview,
} from "./types";
import { evaluateMarketingEligibility } from "./eligibility";
import { SYSTEM_LIST_SLUGS } from "./constants";
import { countDuplicateEmails } from "./recipient-preview";

function contactDisplayName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (row.full_name?.trim()) return row.full_name.trim();
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "Unnamed";
}

export async function fetchMarketingContactsForOrganisation(
  adminClient: SupabaseClient,
  organisationId: string
): Promise<MarketingContactPreview[]> {
  const { data: contacts } = await adminClient
    .from("crm_contacts")
    .select("id, full_name, first_name, last_name, role, email")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: true });

  if (!contacts?.length) return [];

  const ids = contacts.map((c) => c.id as string);
  const { data: marketing } = await adminClient
    .from("crm_marketing_contacts")
    .select(
      "crm_contact_id, status, consent_status, lawful_basis, unsubscribe_at, suppressed_at"
    )
    .in("crm_contact_id", ids);

  const mcMap = new Map(
    (marketing || []).map((m) => [m.crm_contact_id as string, m])
  );

  return contacts.map((c) => {
    const mc = mcMap.get(c.id as string);
    const eligibility = evaluateMarketingEligibility({
      email: c.email,
      status: mc?.status || "pending_consent",
      consentStatus: mc?.consent_status || "unknown",
      lawfulBasis: mc?.lawful_basis || "review_required",
      unsubscribeAt: mc?.unsubscribe_at,
      suppressedAt: mc?.suppressed_at,
    });
    const locked = Boolean(
      mc?.unsubscribe_at ||
        mc?.suppressed_at ||
        mc?.status === "unsubscribed" ||
        mc?.status === "suppressed"
    );
    return {
      id: c.id as string,
      name: contactDisplayName(c),
      role: (c.role as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      marketingStatus: (mc?.status as string | null) ?? null,
      consentStatus: (mc?.consent_status as string | null) ?? null,
      unsubscribeAt: (mc?.unsubscribe_at as string | null) ?? null,
      suppressedAt: (mc?.suppressed_at as string | null) ?? null,
      sendable: eligibility.sendable,
      notSendable: eligibility.notSendable,
      eligibilityReason: eligibility.reason,
      locked,
    };
  });
}

export async function fetchMarketingOverview(
  adminClient: SupabaseClient
): Promise<CrmMarketingOverviewStats> {
  const { count: total } = await adminClient
    .from("crm_marketing_contacts")
    .select("id", { count: "exact", head: true });

  const statuses = await Promise.all([
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_consent"),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "unsubscribed"),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "suppressed"),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("status", "invalid_email"),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .in("status", ["subscribed", "eligible_customer"]),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  async function listMemberCount(slug: string) {
    const { data: list } = await adminClient
      .from("crm_marketing_lists")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!list) return 0;
    const { count } = await adminClient
      .from("crm_marketing_list_members")
      .select("id", { count: "exact", head: true })
      .eq("marketing_list_id", list.id);
    return count || 0;
  }

  const [generalUpdates, goLive, closedNotNow, listed, signedUp, duplicateEmails, unknownBasis] =
    await Promise.all([
    listMemberCount(SYSTEM_LIST_SLUGS.generalUpdates),
    listMemberCount(SYSTEM_LIST_SLUGS.goLive),
    listMemberCount(SYSTEM_LIST_SLUGS.closedNotNow),
    listMemberCount(SYSTEM_LIST_SLUGS.listed),
    listMemberCount(SYSTEM_LIST_SLUGS.signedUp),
    countDuplicateEmails(adminClient),
    adminClient
      .from("crm_marketing_contacts")
      .select("id", { count: "exact", head: true })
      .eq("lawful_basis", "review_required"),
  ]);

  return {
    total: total || 0,
    sendable: statuses[4].count || 0,
    pendingConsent: statuses[0].count || 0,
    unsubscribed: statuses[1].count || 0,
    suppressed: statuses[2].count || 0,
    invalidEmail: statuses[3].count || 0,
    duplicateEmails,
    unknownLawfulBasis: unknownBasis.count || 0,
    generalUpdates,
    goLive,
    closedNotNow,
    signedUp,
    listed,
    recentlyAdded: statuses[5].count || 0,
  };
}

export async function fetchMarketingContactRows(
  adminClient: SupabaseClient,
  filters: Record<string, string | undefined>,
  page = 1,
  pageSize = 25
): Promise<{ rows: CrmMarketingContactRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient.from("crm_marketing_contacts").select(
    `
      id, crm_contact_id, crm_organisation_id, email, status, consent_status,
      lawful_basis, created_from, created_at, unsubscribe_at, suppressed_at,
      crm_contacts ( full_name, first_name, last_name, role ),
      crm_organisations ( name, type, pipeline_stage )
    `,
    { count: "exact" }
  );

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.consent) query = query.eq("consent_status", filters.consent);
  if (filters.basis) query = query.eq("lawful_basis", filters.basis);
  if (filters.org) query = query.eq("crm_organisation_id", filters.org);
  if (filters.sendable === "1") {
    query = query.in("status", ["subscribed", "eligible_customer"]);
  }
  if (filters.list) {
    const { data: members } = await adminClient
      .from("crm_marketing_list_members")
      .select("marketing_contact_id")
      .eq("marketing_list_id", filters.list);
    const ids = (members || []).map((m) => m.marketing_contact_id as string);
    if (!ids.length) return { rows: [], total: 0 };
    query = query.in("id", ids);
  }
  if (filters.review === "1") {
    query = query.eq("lawful_basis", "review_required");
  }
  if (filters.q?.trim()) {
    query = query.ilike("email", `%${filters.q.trim()}%`);
  }

  query = query.order("created_at", { ascending: false });
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const rows: CrmMarketingContactRow[] = [];
  for (const row of data || []) {
    const contact = row.crm_contacts as unknown as {
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
    } | null;
    const org = row.crm_organisations as unknown as {
      name: string;
      type: string | null;
      pipeline_stage: string;
    } | null;

    const eligibility = evaluateMarketingEligibility({
      email: row.email as string | null,
      status: row.status as string,
      consentStatus: row.consent_status as string,
      lawfulBasis: row.lawful_basis as string,
      unsubscribeAt: row.unsubscribe_at as string | null,
      suppressedAt: row.suppressed_at as string | null,
      pipelineStage: org?.pipeline_stage,
    });

    const { data: members } = await adminClient
      .from("crm_marketing_list_members")
      .select("crm_marketing_lists ( name )")
      .eq("marketing_contact_id", row.id as string);

    rows.push({
      id: row.id as string,
      crm_contact_id: row.crm_contact_id as string,
      crm_organisation_id: row.crm_organisation_id as string | null,
      contact_name: contact ? contactDisplayName(contact) : "Unknown",
      organisation_name: org?.name ?? null,
      organisation_type: org?.type ?? null,
      role: contact?.role ?? null,
      email: row.email as string | null,
      pipeline_stage: org?.pipeline_stage ?? null,
      status: row.status as string,
      consent_status: row.consent_status as string,
      lawful_basis: row.lawful_basis as string,
      lists:
        (members || []).map(
          (m) =>
            (m.crm_marketing_lists as unknown as { name: string } | null)?.name ||
            ""
        ) || [],
      created_from: row.created_from as string | null,
      created_at: row.created_at as string,
      unsubscribe_at: row.unsubscribe_at as string | null,
      suppressed_at: row.suppressed_at as string | null,
      sendable: eligibility.sendable,
      eligibility_reason: eligibility.reason,
    });
  }

  return { rows, total: count || 0 };
}

export async function fetchMarketingLists(
  adminClient: SupabaseClient
): Promise<CrmMarketingListRow[]> {
  const { data: lists, error } = await adminClient
    .from("crm_marketing_lists")
    .select("id, slug, name, description, list_type, is_system, active, updated_at, created_at")
    .order("name");
  if (error) throw new Error(error.message);

  const rows: CrmMarketingListRow[] = [];
  for (const list of lists || []) {
    const { data: members } = await adminClient
      .from("crm_marketing_list_members")
      .select("marketing_contact_id, crm_marketing_contacts ( status )")
      .eq("marketing_list_id", list.id as string);

    let sendable = 0;
    let pending = 0;
    let suppressed = 0;
    let unsubscribed = 0;
    let invalidEmail = 0;
    for (const m of members || []) {
      const status = (m.crm_marketing_contacts as unknown as { status: string } | null)
        ?.status;
      if (status === "subscribed" || status === "eligible_customer") sendable++;
      if (status === "pending_consent") pending++;
      if (status === "suppressed") suppressed++;
      if (status === "unsubscribed") unsubscribed++;
      if (status === "invalid_email") invalidEmail++;
    }

    rows.push({
      id: list.id as string,
      slug: list.slug as string,
      name: list.name as string,
      description: (list.description as string | null) ?? null,
      list_type: list.list_type as string,
      is_system: list.is_system as boolean,
      active: list.active as boolean,
      total_members: members?.length || 0,
      sendable_members: sendable,
      pending_consent: pending,
      suppressed_members: suppressed,
      unsubscribed_members: unsubscribed,
      invalid_email_members: invalidEmail,
      updated_at: list.updated_at as string,
      created_at: list.created_at as string,
    });
  }
  return rows;
}

export async function fetchOrgMarketingSummary(
  adminClient: SupabaseClient,
  organisationId: string
) {
  const { data } = await adminClient
    .from("crm_marketing_contacts")
    .select("id, status, unsubscribe_at, suppressed_at")
    .eq("crm_organisation_id", organisationId);

  const contacts = data || [];
  let sendable = 0;
  let pending = 0;
  let blocked = 0;
  for (const c of contacts) {
    if (c.status === "subscribed" || c.status === "eligible_customer") sendable++;
    else if (c.status === "pending_consent") pending++;
    if (
      c.unsubscribe_at ||
      c.suppressed_at ||
      c.status === "unsubscribed" ||
      c.status === "suppressed"
    ) {
      blocked++;
    }
  }

  const { data: members } = await adminClient
    .from("crm_marketing_list_members")
    .select("crm_marketing_lists ( name )")
    .in(
      "marketing_contact_id",
      contacts.map((c) => c.id as string)
    );

  const listNames = [
    ...new Set(
      (members || [])
        .map((m) => (m.crm_marketing_lists as unknown as { name: string } | null)?.name)
        .filter(Boolean) as string[]
    ),
  ];

  return {
    total: contacts.length,
    sendable,
    pending,
    blocked,
    lists: listNames,
  };
}

export async function fetchMarketingContactDetail(
  adminClient: SupabaseClient,
  marketingContactId: string
): Promise<CrmMarketingContactDetail | null> {
  const { data: row, error } = await adminClient
    .from("crm_marketing_contacts")
    .select(
      `
        id, crm_contact_id, crm_organisation_id, email, status, consent_status,
        lawful_basis, consent_source, consent_recorded_at, consent_withdrawn_at,
        unsubscribe_at, suppressed_at, suppression_reason, created_from, created_at,
        crm_contacts ( full_name, first_name, last_name, role, phone ),
        crm_organisations ( name, type, pipeline_stage )
      `
    )
    .eq("id", marketingContactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const contact = row.crm_contacts as unknown as {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    phone: string | null;
  } | null;
  const org = row.crm_organisations as unknown as {
    name: string;
    type: string | null;
    pipeline_stage: string;
  } | null;

  const eligibility = evaluateMarketingEligibility({
    email: row.email as string | null,
    status: row.status as string,
    consentStatus: row.consent_status as string,
    lawfulBasis: row.lawful_basis as string,
    unsubscribeAt: row.unsubscribe_at as string | null,
    suppressedAt: row.suppressed_at as string | null,
    pipelineStage: org?.pipeline_stage,
  });

  const { data: members } = await adminClient
    .from("crm_marketing_list_members")
    .select("marketing_list_id, crm_marketing_lists ( id, name )")
    .eq("marketing_contact_id", marketingContactId);

  const listNames: string[] = [];
  const listIds: string[] = [];
  for (const member of members || []) {
    const list = member.crm_marketing_lists as unknown as { id: string; name: string } | null;
    if (list) {
      listNames.push(list.name);
      listIds.push(list.id);
    }
  }

  const { data: audits } = await adminClient
    .from("crm_marketing_audits")
    .select("id, action, actor_id, marketing_list_id, previous_value, new_value, source, created_at")
    .eq("marketing_contact_id", marketingContactId)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: engagements } = await adminClient
    .from("crm_engagements")
    .select("id, type, summary, outcome, occurred_at")
    .eq("contact_id", row.crm_contact_id as string)
    .order("occurred_at", { ascending: false })
    .limit(20);

  return {
    id: row.id as string,
    crm_contact_id: row.crm_contact_id as string,
    crm_organisation_id: row.crm_organisation_id as string | null,
    contact_name: contact ? contactDisplayName(contact) : "Unknown",
    organisation_name: org?.name ?? null,
    organisation_type: org?.type ?? null,
    role: contact?.role ?? null,
    phone: contact?.phone ?? null,
    email: row.email as string | null,
    pipeline_stage: org?.pipeline_stage ?? null,
    status: row.status as string,
    consent_status: row.consent_status as string,
    lawful_basis: row.lawful_basis as string,
    consent_source: row.consent_source as string | null,
    consent_recorded_at: row.consent_recorded_at as string | null,
    consent_withdrawn_at: row.consent_withdrawn_at as string | null,
    suppression_reason: row.suppression_reason as string | null,
    lists: listNames,
    list_ids: listIds,
    created_from: row.created_from as string | null,
    created_at: row.created_at as string,
    unsubscribe_at: row.unsubscribe_at as string | null,
    suppressed_at: row.suppressed_at as string | null,
    sendable: eligibility.sendable,
    eligibility_reason: eligibility.reason,
    audits: (audits || []).map((audit) => ({
      id: audit.id as string,
      action: audit.action as string,
      actor_id: audit.actor_id as string | null,
      marketing_list_id: audit.marketing_list_id as string | null,
      previous_value: audit.previous_value,
      new_value: audit.new_value,
      source: audit.source as string | null,
      created_at: audit.created_at as string,
    })),
    communications: (engagements || []).map((item) => ({
      id: item.id as string,
      type: item.type as string,
      summary: item.summary as string | null,
      outcome: item.outcome as string | null,
      occurred_at: item.occurred_at as string,
    })),
  };
}

export async function fetchMarketingListMembers(
  adminClient: SupabaseClient,
  listId: string,
  page = 1,
  pageSize = 25
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: list, error: listError } = await adminClient
    .from("crm_marketing_lists")
    .select("*")
    .eq("id", listId)
    .single();
  if (listError || !list) throw new Error("List not found.");

  const { data: members, count, error } = await adminClient
    .from("crm_marketing_list_members")
    .select(
      `
        marketing_contact_id,
        added_at,
        crm_marketing_contacts (
          id, email, status, consent_status, lawful_basis, unsubscribe_at, suppressed_at,
          crm_contact_id, crm_organisation_id,
          crm_contacts ( full_name, first_name, last_name, role ),
          crm_organisations ( name, pipeline_stage )
        )
      `,
      { count: "exact" }
    )
    .eq("marketing_list_id", listId)
    .order("added_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);

  const rows = (members || []).map((member) => {
    const mc = member.crm_marketing_contacts as unknown as {
      id: string;
      email: string | null;
      status: string;
      consent_status: string;
      lawful_basis: string;
      unsubscribe_at: string | null;
      suppressed_at: string | null;
      crm_contact_id: string;
      crm_organisation_id: string | null;
      crm_contacts: {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        role: string | null;
      } | null;
      crm_organisations: { name: string; pipeline_stage: string } | null;
    };
    const eligibility = evaluateMarketingEligibility({
      email: mc.email,
      status: mc.status,
      consentStatus: mc.consent_status,
      lawfulBasis: mc.lawful_basis,
      unsubscribeAt: mc.unsubscribe_at,
      suppressedAt: mc.suppressed_at,
      pipelineStage: mc.crm_organisations?.pipeline_stage,
    });
    return {
      marketing_contact_id: mc.id,
      crm_contact_id: mc.crm_contact_id,
      contact_name: mc.crm_contacts ? contactDisplayName(mc.crm_contacts) : "Unknown",
      organisation_name: mc.crm_organisations?.name ?? null,
      role: mc.crm_contacts?.role ?? null,
      email: mc.email,
      status: mc.status,
      sendable: eligibility.sendable,
      eligibility_reason: eligibility.reason,
      added_at: member.added_at as string,
    };
  });

  return { list, rows, total: count || 0, page, pageSize };
}
