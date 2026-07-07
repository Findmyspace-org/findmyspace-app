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

export async function resolveContactFilterIds(
  adminClient: SupabaseClient,
  filters: CrmListFilters
): Promise<Set<string> | null> {
  const needs =
    filters.overdue ||
    filters.noNextStep ||
    filters.noEmail ||
    filters.noPhone ||
    filters.staleInteraction;

  if (!needs) return null;

  const today = todayIsoDate();
  const staleBefore = subDays(new Date(), STALE_DAYS).toISOString();
  let matching: Set<string> | null = null;

  const ensure = (next: Set<string>) => {
    matching = matching ? intersect(matching, next) : next;
  };

  if (filters.overdue) {
    const { data } = await adminClient
      .from("crm_tasks")
      .select("contact_id")
      .eq("status", "open")
      .lt("due_date", today)
      .not("contact_id", "is", null);
    ensure(
      new Set(
        ((data || []) as { contact_id: string }[]).map((r) => r.contact_id)
      )
    );
  }

  if (filters.noNextStep) {
    const [{ data: contacts }, { data: tasks }] = await Promise.all([
      adminClient.from("crm_contacts").select("id"),
      adminClient
        .from("crm_tasks")
        .select("contact_id")
        .eq("status", "open")
        .not("contact_id", "is", null),
    ]);
    const withTask = new Set(
      ((tasks || []) as { contact_id: string }[]).map((t) => t.contact_id)
    );
    ensure(
      new Set(
        ((contacts || []) as { id: string }[])
          .map((c) => c.id)
          .filter((id) => !withTask.has(id))
      )
    );
  }

  if (filters.noEmail) {
    const { data } = await adminClient
      .from("crm_contacts")
      .select("id, email");
    ensure(
      new Set(
        ((data || []) as { id: string; email: string | null }[])
          .filter((c) => !c.email?.trim())
          .map((c) => c.id)
      )
    );
  }

  if (filters.noPhone) {
    const { data } = await adminClient
      .from("crm_contacts")
      .select("id, phone, whatsapp");
    ensure(
      new Set(
        ((data || []) as {
          id: string;
          phone: string | null;
          whatsapp: string | null;
        }[])
          .filter((c) => !c.phone?.trim() && !c.whatsapp?.trim())
          .map((c) => c.id)
      )
    );
  }

  if (filters.staleInteraction) {
    const [{ data: contacts }, { data: engagements }] = await Promise.all([
      adminClient.from("crm_contacts").select("id"),
      adminClient
        .from("crm_engagements")
        .select("contact_id")
        .not("contact_id", "is", null)
        .gte("occurred_at", staleBefore),
    ]);
    const recent = new Set(
      ((engagements || []) as { contact_id: string }[]).map((e) => e.contact_id)
    );
    ensure(
      new Set(
        ((contacts || []) as { id: string }[])
          .map((c) => c.id)
          .filter((id) => !recent.has(id))
      )
    );
  }

  return matching;
}
