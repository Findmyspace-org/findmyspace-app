import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SpaceCrmLinkInput = {
  crm_organisation_id?: string | null;
  crm_contact_id?: string | null;
};

export type SpaceCrmLinkSummary = {
  crm_organisation_id: string | null;
  crm_contact_id: string | null;
  organisation_name: string | null;
  contact_name: string | null;
};

function parseUuid(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return UUID_RE.test(trimmed) ? trimmed : undefined;
}

export function parseSpaceCrmLinkInput(
  body: Record<string, unknown>
): { ok: true; data: SpaceCrmLinkInput } | { ok: false; error: string } {
  const data: SpaceCrmLinkInput = {};

  if ("crm_organisation_id" in body) {
    const v = parseUuid(body.crm_organisation_id);
    if (v === undefined) {
      return { ok: false, error: "Invalid crm_organisation_id." };
    }
    data.crm_organisation_id = v;
  }

  if ("crm_contact_id" in body) {
    const v = parseUuid(body.crm_contact_id);
    if (v === undefined) {
      return { ok: false, error: "Invalid crm_contact_id." };
    }
    data.crm_contact_id = v;
  }

  if (data.crm_contact_id && !data.crm_organisation_id) {
    return {
      ok: false,
      error: "A CRM organisation is required when linking a contact.",
    };
  }

  return { ok: true, data };
}

export async function validateSpaceCrmLink(
  admin: SupabaseClient,
  input: SpaceCrmLinkInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgId = input.crm_organisation_id ?? null;
  const contactId = input.crm_contact_id ?? null;

  if (!orgId && !contactId) {
    return { ok: true };
  }

  if (orgId) {
    const { data: org, error } = await admin
      .from("crm_organisations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !org) {
      return { ok: false, error: "CRM organisation not found." };
    }
  }

  if (contactId) {
    const { data: contact, error } = await admin
      .from("crm_contacts")
      .select("id, organisation_id")
      .eq("id", contactId)
      .maybeSingle();
    if (error || !contact) {
      return { ok: false, error: "CRM contact not found." };
    }
    const row = contact as { id: string; organisation_id: string };
    if (orgId && row.organisation_id !== orgId) {
      return {
        ok: false,
        error: "Contact does not belong to the selected organisation.",
      };
    }
  }

  return { ok: true };
}

export function contactDisplayName(contact: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    contact.full_name?.trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    "Contact"
  );
}

export async function fetchSpaceCrmLinkSummary(
  admin: SupabaseClient,
  space: {
    crm_organisation_id?: string | null;
    crm_contact_id?: string | null;
  }
): Promise<SpaceCrmLinkSummary> {
  const orgId = space.crm_organisation_id ?? null;
  const contactId = space.crm_contact_id ?? null;

  let organisation_name: string | null = null;
  let contact_name: string | null = null;

  if (orgId) {
    const { data } = await admin
      .from("crm_organisations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    organisation_name = (data as { name?: string } | null)?.name ?? null;
  }

  if (contactId) {
    const { data } = await admin
      .from("crm_contacts")
      .select("full_name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();
    if (data) {
      contact_name = contactDisplayName(
        data as {
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }
      );
    }
  }

  return {
    crm_organisation_id: orgId,
    crm_contact_id: contactId,
    organisation_name,
    contact_name,
  };
}

export async function enrichSpacesWithCrmSummaries<
  T extends { id: string; crm_organisation_id?: string | null; crm_contact_id?: string | null }
>(admin: SupabaseClient, spaces: T[]) {
  const orgIds = Array.from(
    new Set(spaces.map((s) => s.crm_organisation_id).filter(Boolean) as string[])
  );
  const contactIds = Array.from(
    new Set(spaces.map((s) => s.crm_contact_id).filter(Boolean) as string[])
  );

  const orgNames = new Map<string, string>();
  const contactNames = new Map<string, string>();

  if (orgIds.length > 0) {
    const { data } = await admin
      .from("crm_organisations")
      .select("id, name")
      .in("id", orgIds);
    for (const row of (data as { id: string; name: string }[]) || []) {
      orgNames.set(row.id, row.name);
    }
  }

  if (contactIds.length > 0) {
    const { data } = await admin
      .from("crm_contacts")
      .select("id, full_name, first_name, last_name")
      .in("id", contactIds);
    for (const row of (data as {
      id: string;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    }[]) || []) {
      contactNames.set(row.id, contactDisplayName(row));
    }
  }

  return spaces.map((space) => ({
    ...space,
    crm_linked: Boolean(space.crm_organisation_id || space.crm_contact_id),
    crm_organisation_name: space.crm_organisation_id
      ? orgNames.get(space.crm_organisation_id) ?? null
      : null,
    crm_contact_name: space.crm_contact_id
      ? contactNames.get(space.crm_contact_id) ?? null
      : null,
  }));
}

export async function loadSpaceCrmContextForListing(
  admin: SupabaseClient,
  listingId: string
): Promise<SpaceCrmLinkSummary | null> {
  const { data } = await admin
    .from("spaces")
    .select("crm_organisation_id, crm_contact_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!data) return null;

  const row = data as {
    crm_organisation_id: string | null;
    crm_contact_id: string | null;
  };

  if (!row.crm_organisation_id && !row.crm_contact_id) {
    return null;
  }

  return fetchSpaceCrmLinkSummary(admin, row);
}

export function formatCrmLinkForAdminNotice(summary: SpaceCrmLinkSummary): string {
  const parts: string[] = [];
  if (summary.organisation_name) {
    parts.push(`Org: ${summary.organisation_name}`);
  }
  if (summary.contact_name) {
    parts.push(`Contact: ${summary.contact_name}`);
  }
  return parts.join(" · ");
}
