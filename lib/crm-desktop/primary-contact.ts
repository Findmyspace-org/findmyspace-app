import type { SupabaseClient } from "@supabase/supabase-js";

export type SetPrimaryContactInput = {
  organisationId: string;
  contactId: string | null;
  profileId: string;
};

export type SetPrimaryContactResult =
  | { ok: true; primaryContactId: string | null }
  | { ok: false; error: string; status: number };

export async function setOrganisationPrimaryContact(
  adminClient: SupabaseClient,
  input: SetPrimaryContactInput
): Promise<SetPrimaryContactResult> {
  const { organisationId, contactId, profileId } = input;

  const { data: org, error: orgError } = await adminClient
    .from("crm_organisations")
    .select("id, name, primary_contact_id, status")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgError) {
    return { ok: false, error: orgError.message, status: 500 };
  }
  if (!org || org.status === "archived") {
    return { ok: false, error: "Organisation not found.", status: 404 };
  }

  if (contactId) {
    const { data: contact, error: contactError } = await adminClient
      .from("crm_contacts")
      .select("id, full_name, first_name, last_name, organisation_id")
      .eq("id", contactId)
      .maybeSingle();

    if (contactError) {
      return { ok: false, error: contactError.message, status: 500 };
    }
    if (!contact) {
      return { ok: false, error: "Contact not found.", status: 404 };
    }
    if (contact.organisation_id !== organisationId) {
      return {
        ok: false,
        error: "Contact does not belong to this organisation.",
        status: 400,
      };
    }
  }

  const previousId = (org.primary_contact_id as string | null) ?? null;
  if (previousId === contactId) {
    return { ok: true, primaryContactId: contactId };
  }

  const { error: updateError } = await adminClient
    .from("crm_organisations")
    .update({
      primary_contact_id: contactId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organisationId);

  if (updateError) {
    return { ok: false, error: updateError.message, status: 500 };
  }

  let previousLabel = "none";
  if (previousId) {
    const { data: prev } = await adminClient
      .from("crm_contacts")
      .select("full_name, first_name, last_name")
      .eq("id", previousId)
      .maybeSingle();
    previousLabel =
      prev?.full_name ||
      [prev?.first_name, prev?.last_name].filter(Boolean).join(" ") ||
      previousId;
  }

  let nextLabel = "none";
  if (contactId) {
    const { data: next } = await adminClient
      .from("crm_contacts")
      .select("full_name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();
    nextLabel =
      next?.full_name ||
      [next?.first_name, next?.last_name].filter(Boolean).join(" ") ||
      contactId;
  }

  const summary = contactId
    ? `Primary contact set to ${nextLabel}`
    : "Primary contact cleared";
  const outcome = `Changed from ${previousLabel} to ${nextLabel}`;

  await adminClient.from("crm_engagements").insert({
    organisation_id: organisationId,
    contact_id: contactId,
    type: "note",
    summary,
    outcome,
    direction: "internal",
    occurred_at: new Date().toISOString(),
    created_by: profileId,
  });

  return { ok: true, primaryContactId: contactId };
}
