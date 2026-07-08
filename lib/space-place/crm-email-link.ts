import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailLinkAction = "link" | "relink" | "unlink";

export type ApplyEmailLinkInput = {
  emailId: string;
  action: EmailLinkAction;
  contactId?: string | null;
  organisationId?: string | null;
  actorId: string | null;
  source?: string;
};

export type ApplyEmailLinkResult =
  | {
      ok: true;
      email: {
        id: string;
        contact_id: string | null;
        organisation_id: string | null;
        linked_at: string | null;
        linked_by: string | null;
      };
    }
  | { ok: false; error: string };

async function writeLinkAudit(
  db: SupabaseClient,
  input: {
    action: "email_linked" | "email_relinked" | "email_unlinked";
    emailId: string;
    actorId: string | null;
    previousContactId: string | null;
    previousOrganisationId: string | null;
    newContactId: string | null;
    newOrganisationId: string | null;
    source?: string;
  }
) {
  const { error } = await db.from("crm_email_link_audits").insert({
    action: input.action,
    email_message_id: input.emailId,
    actor_id: input.actorId,
    previous_contact_id: input.previousContactId,
    previous_organisation_id: input.previousOrganisationId,
    new_contact_id: input.newContactId,
    new_organisation_id: input.newOrganisationId,
    source: input.source ?? "crm_desktop",
  });
  if (error) {
    console.error("[email-link] audit insert failed", error.message);
  }
}

async function ensureEngagement(
  db: SupabaseClient,
  input: {
    engagementId: string | null;
    organisationId: string;
    contactId: string | null;
    subject: string | null;
    sentAt: string | null;
    createdBy: string | null;
  }
): Promise<string | null> {
  if (input.engagementId) {
    await db
      .from("crm_engagements")
      .update({
        organisation_id: input.organisationId,
        contact_id: input.contactId,
      })
      .eq("id", input.engagementId);
    return input.engagementId;
  }

  if (!input.contactId) {
    // Org-only links do not create a contact timeline row.
    return null;
  }

  const { data, error } = await db
    .from("crm_engagements")
    .insert({
      organisation_id: input.organisationId,
      contact_id: input.contactId,
      type: "email",
      summary: input.subject?.trim() || "(No subject)",
      outcome: "Email linked in CRM",
      direction: "outbound",
      occurred_at: input.sentAt ?? new Date().toISOString(),
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[email-link] engagement insert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * Link / relink / unlink a CRM imported email with server-side validation.
 */
export async function applyEmailLinkAction(
  db: SupabaseClient,
  input: ApplyEmailLinkInput
): Promise<ApplyEmailLinkResult> {
  const { data: emailRow, error: emailErr } = await db
    .from("crm_email_messages")
    .select(
      "id, subject, sent_at, created_by, engagement_id, contact_id, organisation_id"
    )
    .eq("id", input.emailId)
    .maybeSingle();

  if (emailErr || !emailRow) {
    return { ok: false, error: emailErr?.message || "Email not found." };
  }

  const previous = emailRow as {
    id: string;
    subject: string | null;
    sent_at: string | null;
    created_by: string | null;
    engagement_id: string | null;
    contact_id: string | null;
    organisation_id: string | null;
  };

  if (input.action === "unlink") {
    const { data: updated, error: updateErr } = await db
      .from("crm_email_messages")
      .update({
        contact_id: null,
        organisation_id: null,
        linked_at: null,
        linked_by: null,
      })
      .eq("id", previous.id)
      .select("id, contact_id, organisation_id, linked_at, linked_by")
      .single();

    if (updateErr) return { ok: false, error: updateErr.message };

    await writeLinkAudit(db, {
      action: "email_unlinked",
      emailId: previous.id,
      actorId: input.actorId,
      previousContactId: previous.contact_id,
      previousOrganisationId: previous.organisation_id,
      newContactId: null,
      newOrganisationId: null,
      source: input.source,
    });

    return {
      ok: true,
      email: updated as {
        id: string;
        contact_id: string | null;
        organisation_id: string | null;
        linked_at: string | null;
        linked_by: string | null;
      },
    };
  }

  const contactId = input.contactId?.trim() || null;
  let organisationId = input.organisationId?.trim() || null;

  if (!contactId && !organisationId) {
    return {
      ok: false,
      error: "Select a contact and/or organisation to link.",
    };
  }

  if (contactId) {
    const { data: contact, error: contactErr } = await db
      .from("crm_contacts")
      .select("id, organisation_id")
      .eq("id", contactId)
      .maybeSingle();
    if (contactErr || !contact) {
      return { ok: false, error: contactErr?.message || "Contact not found." };
    }
    const contactOrg = (contact as { organisation_id: string }).organisation_id;
    if (organisationId && organisationId !== contactOrg) {
      return {
        ok: false,
        error: "Selected contact does not belong to the selected organisation.",
      };
    }
    organisationId = contactOrg;
  } else if (organisationId) {
    const { data: org, error: orgErr } = await db
      .from("crm_organisations")
      .select("id")
      .eq("id", organisationId)
      .maybeSingle();
    if (orgErr || !org) {
      return { ok: false, error: orgErr?.message || "Organisation not found." };
    }
  }

  const wasLinked = Boolean(previous.contact_id || previous.organisation_id);
  const auditAction = wasLinked ? "email_relinked" : "email_linked";
  if (input.action === "link" && wasLinked) {
    // Treat as relink rather than rejecting — safer UX.
  }

  if (!organisationId) {
    return { ok: false, error: "Organisation could not be resolved." };
  }

  const engagementId = await ensureEngagement(db, {
    engagementId: previous.engagement_id,
    organisationId,
    contactId,
    subject: previous.subject,
    sentAt: previous.sent_at,
    createdBy: previous.created_by ?? input.actorId,
  });

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await db
    .from("crm_email_messages")
    .update({
      contact_id: contactId,
      organisation_id: organisationId,
      engagement_id: engagementId ?? previous.engagement_id,
      linked_at: nowIso,
      linked_by: input.actorId,
      created_by: previous.created_by ?? input.actorId,
    })
    .eq("id", previous.id)
    .select("id, contact_id, organisation_id, linked_at, linked_by")
    .single();

  if (updateErr) return { ok: false, error: updateErr.message };

  await writeLinkAudit(db, {
    action: auditAction,
    emailId: previous.id,
    actorId: input.actorId,
    previousContactId: previous.contact_id,
    previousOrganisationId: previous.organisation_id,
    newContactId: contactId,
    newOrganisationId: organisationId,
    source: input.source,
  });

  return {
    ok: true,
    email: updated as {
      id: string;
      contact_id: string | null;
      organisation_id: string | null;
      linked_at: string | null;
      linked_by: string | null;
    },
  };
}

/** @deprecated Prefer applyEmailLinkAction with action: "link" */
export async function linkEmailToContact(
  db: SupabaseClient,
  emailId: string,
  contactId: string,
  linkedBy: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await applyEmailLinkAction(db, {
    emailId,
    action: "link",
    contactId,
    actorId: linkedBy,
    source: "legacy_link_endpoint",
  });
  if (!result.ok) return result;
  return { ok: true };
}
