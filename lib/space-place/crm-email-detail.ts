import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_EMAIL_MISSING_BODY_MESSAGE,
  crmEmailBodyKind,
  sanitizeCrmEmailHtml,
} from "@/lib/space-place/crm-email-sanitize";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";

export type CrmEmailDetailPayload = {
  id: string;
  subject: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  direction: string;
  sent_at: string | null;
  imported_at: string;
  organisation_id: string | null;
  contact_id: string | null;
  engagement_id: string | null;
  body_kind: "html" | "text" | "empty";
  body_html_safe: string | null;
  body_text: string | null;
  missing_body_message: string | null;
  crm_contacts: CrmEmailMessageWithRelations["crm_contacts"];
  crm_organisations: CrmEmailMessageWithRelations["crm_organisations"];
};

export async function fetchCrmEmailDetail(
  adminClient: SupabaseClient,
  emailId: string
): Promise<
  | { ok: true; email: CrmEmailDetailPayload }
  | { ok: false; error: string; status: number }
> {
  if (!emailId?.trim()) {
    return { ok: false, error: "Email id is required.", status: 400 };
  }

  const { data, error } = await adminClient
    .from("crm_email_messages")
    .select(
      `id, subject, from_email, to_emails, cc_emails, bcc_emails, direction,
       sent_at, imported_at, organisation_id, contact_id, engagement_id,
       body_html, body_text,
       crm_contacts ( id, full_name, email ),
       crm_organisations ( id, name )`
    )
    .eq("id", emailId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) {
    return { ok: false, error: "Email not found.", status: 404 };
  }

  const row = data as unknown as {
    id: string;
    subject: string | null;
    from_email: string | null;
    to_emails: string[] | null;
    cc_emails: string[] | null;
    bcc_emails: string[] | null;
    direction: string;
    sent_at: string | null;
    imported_at: string;
    organisation_id: string | null;
    contact_id: string | null;
    engagement_id: string | null;
    body_html: string | null;
    body_text: string | null;
    crm_contacts: CrmEmailMessageWithRelations["crm_contacts"];
    crm_organisations: CrmEmailMessageWithRelations["crm_organisations"];
  };

  const kind = crmEmailBodyKind(row.body_html, row.body_text);
  const bodyHtmlSafe =
    kind === "html" ? sanitizeCrmEmailHtml(row.body_html) : null;

  return {
    ok: true,
    email: {
      id: row.id,
      subject: row.subject,
      from_email: row.from_email,
      to_emails: row.to_emails || [],
      cc_emails: row.cc_emails || [],
      bcc_emails: row.bcc_emails || [],
      direction: row.direction,
      sent_at: row.sent_at,
      imported_at: row.imported_at,
      organisation_id: row.organisation_id,
      contact_id: row.contact_id,
      engagement_id: row.engagement_id,
      body_kind: kind,
      body_html_safe: bodyHtmlSafe,
      body_text: kind === "html" ? null : row.body_text,
      missing_body_message: kind === "empty" ? CRM_EMAIL_MISSING_BODY_MESSAGE : null,
      crm_contacts: row.crm_contacts ?? null,
      crm_organisations: row.crm_organisations ?? null,
    },
  };
}
