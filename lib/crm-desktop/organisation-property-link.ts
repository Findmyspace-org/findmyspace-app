import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkPropertyResult =
  | { ok: true; propertyId: string; organisationId: string }
  | { ok: false; error: string; status: number };

export type UnlinkPropertyResult =
  | { ok: true; propertyId: string; organisationId: string }
  | { ok: false; error: string; status: number };

export type ReassignPropertyResult =
  | {
      ok: true;
      propertyId: string;
      previousOrganisationId: string;
      newOrganisationId: string;
    }
  | { ok: false; error: string; status: number };

async function logPropertyLinkAudit(
  adminClient: SupabaseClient,
  input: {
    organisationId: string;
    propertyId: string;
    propertyName: string;
    profileId: string;
    summary: string;
    outcome: string;
    contactId?: string | null;
  }
) {
  await adminClient.from("crm_engagements").insert({
    organisation_id: input.organisationId,
    contact_id: input.contactId ?? null,
    type: "note",
    summary: input.summary,
    outcome: input.outcome,
    direction: "internal",
    occurred_at: new Date().toISOString(),
    created_by: input.profileId,
  });
}

export async function linkPropertyToOrganisation(
  adminClient: SupabaseClient,
  input: {
    organisationId: string;
    propertyId: string;
    profileId: string;
    linkSource?: string;
    note?: string | null;
  }
): Promise<LinkPropertyResult> {
  const { data: org, error: orgErr } = await adminClient
    .from("crm_organisations")
    .select("id, name, status")
    .eq("id", input.organisationId)
    .maybeSingle();

  if (orgErr) return { ok: false, error: orgErr.message, status: 500 };
  if (!org || org.status === "archived") {
    return { ok: false, error: "Organisation not found.", status: 404 };
  }

  const { data: property, error: propertyErr } = await adminClient
    .from("properties")
    .select("id, name, crm_organisation_id, owner_id, archived_at")
    .eq("id", input.propertyId)
    .maybeSingle();

  if (propertyErr) {
    return { ok: false, error: propertyErr.message, status: 500 };
  }
  if (!property || property.archived_at) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  if (
    property.crm_organisation_id &&
    property.crm_organisation_id !== input.organisationId
  ) {
    return {
      ok: false,
      error: "Property is already linked to another CRM organisation.",
      status: 409,
    };
  }

  if (property.crm_organisation_id === input.organisationId) {
    return {
      ok: true,
      propertyId: property.id,
      organisationId: input.organisationId,
    };
  }

  const { error: updateErr } = await adminClient
    .from("properties")
    .update({ crm_organisation_id: input.organisationId })
    .eq("id", input.propertyId)
    .is("crm_organisation_id", null);

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 };
  }

  const source = input.linkSource?.trim() || "crm_desktop_link";
  const noteSuffix = input.note?.trim() ? ` Note: ${input.note.trim()}` : "";
  await logPropertyLinkAudit(adminClient, {
    organisationId: input.organisationId,
    propertyId: property.id,
    propertyName: property.name,
    profileId: input.profileId,
    summary: "Property linked",
    outcome: `Linked marketplace property "${property.name}" (${property.id}). Source: ${source}.${noteSuffix}`,
  });

  return {
    ok: true,
    propertyId: property.id,
    organisationId: input.organisationId,
  };
}

export async function unlinkPropertyFromOrganisation(
  adminClient: SupabaseClient,
  input: {
    organisationId: string;
    propertyId: string;
    profileId: string;
    note?: string | null;
  }
): Promise<UnlinkPropertyResult> {
  const { data: property, error: propertyErr } = await adminClient
    .from("properties")
    .select("id, name, crm_organisation_id")
    .eq("id", input.propertyId)
    .maybeSingle();

  if (propertyErr) {
    return { ok: false, error: propertyErr.message, status: 500 };
  }
  if (!property) {
    return { ok: false, error: "Property not found.", status: 404 };
  }
  if (property.crm_organisation_id !== input.organisationId) {
    return {
      ok: false,
      error: "Property is not linked to this organisation.",
      status: 409,
    };
  }

  const { error: updateErr } = await adminClient
    .from("properties")
    .update({ crm_organisation_id: null })
    .eq("id", input.propertyId)
    .eq("crm_organisation_id", input.organisationId);

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 };
  }

  const noteSuffix = input.note?.trim() ? ` Note: ${input.note.trim()}` : "";
  await logPropertyLinkAudit(adminClient, {
    organisationId: input.organisationId,
    propertyId: property.id,
    propertyName: property.name,
    profileId: input.profileId,
    summary: "Property unlinked",
    outcome: `Unlinked marketplace property "${property.name}" (${property.id}) from CRM.${noteSuffix}`,
  });

  return {
    ok: true,
    propertyId: property.id,
    organisationId: input.organisationId,
  };
}

export async function reassignPropertyOrganisation(
  adminClient: SupabaseClient,
  input: {
    propertyId: string;
    newOrganisationId: string;
    profileId: string;
    note?: string | null;
  }
): Promise<ReassignPropertyResult> {
  const { data: property, error: propertyErr } = await adminClient
    .from("properties")
    .select("id, name, crm_organisation_id, archived_at")
    .eq("id", input.propertyId)
    .maybeSingle();

  if (propertyErr) {
    return { ok: false, error: propertyErr.message, status: 500 };
  }
  if (!property || property.archived_at) {
    return { ok: false, error: "Property not found.", status: 404 };
  }
  if (!property.crm_organisation_id) {
    return {
      ok: false,
      error: "Property is not linked to a CRM organisation.",
      status: 409,
    };
  }
  if (property.crm_organisation_id === input.newOrganisationId) {
    return {
      ok: true,
      propertyId: property.id,
      previousOrganisationId: property.crm_organisation_id,
      newOrganisationId: input.newOrganisationId,
    };
  }

  const previousOrganisationId = property.crm_organisation_id;

  const [{ data: previousOrg }, { data: newOrg }] = await Promise.all([
    adminClient
      .from("crm_organisations")
      .select("id, name")
      .eq("id", previousOrganisationId)
      .maybeSingle(),
    adminClient
      .from("crm_organisations")
      .select("id, name, status")
      .eq("id", input.newOrganisationId)
      .maybeSingle(),
  ]);

  if (!newOrg || newOrg.status === "archived") {
    return { ok: false, error: "Target organisation not found.", status: 404 };
  }

  const { error: updateErr } = await adminClient
    .from("properties")
    .update({ crm_organisation_id: input.newOrganisationId })
    .eq("id", input.propertyId)
    .eq("crm_organisation_id", previousOrganisationId);

  if (updateErr) {
    return { ok: false, error: updateErr.message, status: 500 };
  }

  const noteSuffix = input.note?.trim() ? ` Note: ${input.note.trim()}` : "";
  const fromName = previousOrg?.name || previousOrganisationId;
  const toName = newOrg.name;

  await logPropertyLinkAudit(adminClient, {
    organisationId: previousOrganisationId,
    propertyId: property.id,
    propertyName: property.name,
    profileId: input.profileId,
    summary: "Property reassigned",
    outcome: `Reassigned "${property.name}" from ${fromName} to ${toName}.${noteSuffix}`,
  });
  await logPropertyLinkAudit(adminClient, {
    organisationId: input.newOrganisationId,
    propertyId: property.id,
    propertyName: property.name,
    profileId: input.profileId,
    summary: "Property linked",
    outcome: `Received reassigned property "${property.name}" from ${fromName}.${noteSuffix}`,
  });

  return {
    ok: true,
    propertyId: property.id,
    previousOrganisationId,
    newOrganisationId: input.newOrganisationId,
  };
}
