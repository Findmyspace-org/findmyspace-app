import type { SupabaseClient } from "@supabase/supabase-js";
import { formatISO, startOfDay, subDays } from "date-fns";
import type { CrmListFilters } from "./types";

const STALE_DAYS = 30;

function todayIsoDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  if (a.size === 0) return b;
  return new Set([...a].filter((id) => b.has(id)));
}

export async function resolveOrganisationFilterIds(
  adminClient: SupabaseClient,
  filters: CrmListFilters
): Promise<Set<string> | null> {
  const needsEnrichmentFilter =
    filters.overdue ||
    filters.noNextStep ||
    filters.noContact ||
    filters.noSpaces ||
    filters.noFollowUpDate ||
    filters.noEmail ||
    filters.noPhone ||
    filters.staleInteraction;

  if (!needsEnrichmentFilter) return null;

  const today = todayIsoDate();
  const staleBefore = subDays(new Date(), STALE_DAYS).toISOString();

  let matching: Set<string> | null = null;

  const ensure = (next: Set<string>) => {
    matching = matching ? intersect(matching, next) : next;
  };

  if (filters.overdue) {
    const { data } = await adminClient
      .from("crm_tasks")
      .select("organisation_id")
      .eq("status", "open")
      .lt("due_date", today)
      .not("organisation_id", "is", null);
    ensure(
      new Set(
        ((data || []) as { organisation_id: string }[]).map(
          (r) => r.organisation_id
        )
      )
    );
  }

  if (filters.noNextStep) {
    const [{ data: orgs }, { data: tasks }] = await Promise.all([
      adminClient
        .from("crm_organisations")
        .select("id")
        .neq("status", "archived"),
      adminClient
        .from("crm_tasks")
        .select("organisation_id")
        .eq("status", "open")
        .not("organisation_id", "is", null),
    ]);
    const withTask = new Set(
      ((tasks || []) as { organisation_id: string }[]).map(
        (t) => t.organisation_id
      )
    );
    ensure(
      new Set(
        ((orgs || []) as { id: string }[])
          .map((o) => o.id)
          .filter((id) => !withTask.has(id))
      )
    );
  }

  if (filters.noFollowUpDate) {
    const { data } = await adminClient
      .from("crm_tasks")
      .select("organisation_id")
      .eq("status", "open")
      .is("due_date", null)
      .not("organisation_id", "is", null);
    ensure(
      new Set(
        ((data || []) as { organisation_id: string }[]).map(
          (r) => r.organisation_id
        )
      )
    );
  }

  if (filters.noContact) {
    const [{ data: orgs }, { data: contacts }] = await Promise.all([
      adminClient
        .from("crm_organisations")
        .select("id")
        .neq("status", "archived"),
      adminClient.from("crm_contacts").select("organisation_id"),
    ]);
    const withContact = new Set(
      ((contacts || []) as { organisation_id: string }[]).map(
        (c) => c.organisation_id
      )
    );
    ensure(
      new Set(
        ((orgs || []) as { id: string }[])
          .map((o) => o.id)
          .filter((id) => !withContact.has(id))
      )
    );
  }

  if (filters.noEmail || filters.noPhone) {
    const { data: contacts } = await adminClient
      .from("crm_contacts")
      .select("organisation_id, email, phone, whatsapp")
      .order("created_at", { ascending: true });
    const orgFirstContact = new Map<
      string,
      { email: string | null; phone: string | null; whatsapp: string | null }
    >();
    for (const c of (contacts || []) as {
      organisation_id: string;
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
    }[]) {
      if (!orgFirstContact.has(c.organisation_id)) {
        orgFirstContact.set(c.organisation_id, c);
      }
    }
    const ids = new Set<string>();
    for (const [orgId, contact] of orgFirstContact.entries()) {
      if (filters.noEmail && !contact.email?.trim()) ids.add(orgId);
      if (
        filters.noPhone &&
        !contact.phone?.trim() &&
        !contact.whatsapp?.trim()
      ) {
        ids.add(orgId);
      }
    }
    if (filters.noEmail && filters.noPhone) {
      /* union handled per-flag above; for both, include orgs missing either from primary */
    }
    if (filters.noEmail && !filters.noPhone) {
      const { data: orgs } = await adminClient
        .from("crm_organisations")
        .select("id")
        .neq("status", "archived");
      const noPrimary = ((orgs || []) as { id: string }[])
        .map((o) => o.id)
        .filter((id) => {
          const c = orgFirstContact.get(id);
          return !c || !c.email?.trim();
        });
      ensure(new Set(noPrimary));
    } else if (filters.noPhone && !filters.noEmail) {
      const { data: orgs } = await adminClient
        .from("crm_organisations")
        .select("id")
        .neq("status", "archived");
      const noPrimary = ((orgs || []) as { id: string }[])
        .map((o) => o.id)
        .filter((id) => {
          const c = orgFirstContact.get(id);
          return !c || (!c.phone?.trim() && !c.whatsapp?.trim());
        });
      ensure(new Set(noPrimary));
    } else {
      ensure(ids);
    }
  }

  if (filters.noSpaces) {
    const [{ data: orgs }, { data: spaces }, { data: properties }] =
      await Promise.all([
        adminClient
          .from("crm_organisations")
          .select("id")
          .neq("status", "archived"),
        adminClient
          .from("spaces")
          .select("crm_organisation_id")
          .not("crm_organisation_id", "is", null),
        adminClient
          .from("properties")
          .select("crm_organisation_id")
          .not("crm_organisation_id", "is", null),
      ]);
    const linked = new Set<string>();
    for (const s of (spaces || []) as { crm_organisation_id: string }[]) {
      linked.add(s.crm_organisation_id);
    }
    for (const p of (properties || []) as { crm_organisation_id: string }[]) {
      linked.add(p.crm_organisation_id);
    }
    ensure(
      new Set(
        ((orgs || []) as { id: string }[])
          .map((o) => o.id)
          .filter((id) => !linked.has(id))
      )
    );
  }

  if (filters.staleInteraction) {
    const [{ data: orgs }, { data: engagements }] = await Promise.all([
      adminClient
        .from("crm_organisations")
        .select("id")
        .neq("status", "archived"),
      adminClient
        .from("crm_engagements")
        .select("organisation_id, occurred_at")
        .gte("occurred_at", staleBefore),
    ]);
    const recent = new Set(
      ((engagements || []) as { organisation_id: string }[]).map(
        (e) => e.organisation_id
      )
    );
    ensure(
      new Set(
        ((orgs || []) as { id: string }[])
          .map((o) => o.id)
          .filter((id) => !recent.has(id))
      )
    );
  }

  return matching;
}
