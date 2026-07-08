import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeContactMatch,
  matchContactsByEmails,
  type ContactEmailRow,
  type ContactMatchResult,
} from "@/lib/space-place/email-import-helpers";
import {
  getCrmCaptureEmail,
  normalizeEmailAddress,
} from "@/lib/space-place/crm-email";
import { applyEmailLinkAction } from "@/lib/space-place/crm-email-link";

export type RematchEmailResult =
  | {
      ok: true;
      changed: boolean;
      matchStatus: ContactMatchResult["status"];
      explanation: string;
      email: {
        id: string;
        contact_id: string | null;
        organisation_id: string | null;
      };
      matchedContacts: Array<{
        id: string;
        organisation_id: string;
        email: string | null;
      }>;
    }
  | { ok: false; error: string };

function recipientEmailsFromStored(row: {
  to_emails: string[] | null;
  cc_emails: string[] | null;
}): string[] {
  const capture = normalizeEmailAddress(getCrmCaptureEmail());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(row.to_emails || []), ...(row.cc_emails || [])]) {
    const norm = normalizeEmailAddress(raw);
    if (!norm || (capture && norm === capture)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

async function loadContactsWithEmail(
  db: SupabaseClient
): Promise<ContactEmailRow[]> {
  const { data, error } = await db
    .from("crm_contacts")
    .select("id, organisation_id, email")
    .not("email", "is", null);
  if (error || !data?.length) return [];
  return data as ContactEmailRow[];
}

/**
 * Re-run exact-email matching against current CRM contacts for a stored message.
 */
export async function rematchEmailMessage(
  db: SupabaseClient,
  input: { emailId: string; actorId: string | null }
): Promise<RematchEmailResult> {
  const { data: emailRow, error } = await db
    .from("crm_email_messages")
    .select(
      "id, to_emails, cc_emails, contact_id, organisation_id, engagement_id"
    )
    .eq("id", input.emailId)
    .maybeSingle();

  if (error || !emailRow) {
    return { ok: false, error: error?.message || "Email not found." };
  }

  const row = emailRow as {
    id: string;
    to_emails: string[] | null;
    cc_emails: string[] | null;
    contact_id: string | null;
    organisation_id: string | null;
  };

  if (row.contact_id || row.organisation_id) {
    return {
      ok: true,
      changed: false,
      matchStatus: "matched",
      explanation:
        "Email is already linked. Unlink first if you want to re-run automatic matching.",
      email: {
        id: row.id,
        contact_id: row.contact_id,
        organisation_id: row.organisation_id,
      },
      matchedContacts: [],
    };
  }

  const recipients = recipientEmailsFromStored(row);
  const contacts = await loadContactsWithEmail(db);
  const match = matchContactsByEmails(contacts, recipients);
  const explanation = describeContactMatch(match);

  if (match.status === "matched") {
    const linked = await applyEmailLinkAction(db, {
      emailId: row.id,
      action: "link",
      contactId: match.contact.id,
      organisationId: match.contact.organisation_id,
      actorId: input.actorId,
      source: "auto_rematch",
    });
    if (!linked.ok) return linked;
    return {
      ok: true,
      changed: true,
      matchStatus: "matched",
      explanation,
      email: {
        id: linked.email.id,
        contact_id: linked.email.contact_id,
        organisation_id: linked.email.organisation_id,
      },
      matchedContacts: [
        {
          id: match.contact.id,
          organisation_id: match.contact.organisation_id,
          email: match.contact.email,
        },
      ],
    };
  }

  if (match.status === "matched_organisation") {
    const linked = await applyEmailLinkAction(db, {
      emailId: row.id,
      action: "link",
      organisationId: match.organisationId,
      actorId: input.actorId,
      source: "auto_rematch",
    });
    if (!linked.ok) return linked;
    return {
      ok: true,
      changed: true,
      matchStatus: "matched_organisation",
      explanation,
      email: {
        id: linked.email.id,
        contact_id: linked.email.contact_id,
        organisation_id: linked.email.organisation_id,
      },
      matchedContacts: match.contacts.map((c) => ({
        id: c.id,
        organisation_id: c.organisation_id,
        email: c.email,
      })),
    };
  }

  return {
    ok: true,
    changed: false,
    matchStatus: match.status,
    explanation,
    email: {
      id: row.id,
      contact_id: null,
      organisation_id: null,
    },
    matchedContacts:
      match.status === "review_required"
        ? match.contacts.map((c) => ({
            id: c.id,
            organisation_id: c.organisation_id,
            email: c.email,
          }))
        : [],
  };
}

export type SuggestedContactMatch = {
  recipientEmail: string;
  contact: {
    id: string;
    full_name: string;
    email: string | null;
    role: string | null;
    organisation_id: string;
    organisation_name: string;
  } | null;
};

/**
 * Suggest CRM contacts for each To/Cc recipient on an unlinked email.
 */
export async function suggestContactsForEmail(
  db: SupabaseClient,
  emailId: string
): Promise<
  | { ok: true; recipients: string[]; suggestions: SuggestedContactMatch[] }
  | { ok: false; error: string }
> {
  const { data: emailRow, error } = await db
    .from("crm_email_messages")
    .select("id, to_emails, cc_emails")
    .eq("id", emailId)
    .maybeSingle();
  if (error || !emailRow) {
    return { ok: false, error: error?.message || "Email not found." };
  }

  const recipients = recipientEmailsFromStored(
    emailRow as { to_emails: string[] | null; cc_emails: string[] | null }
  );
  if (!recipients.length) {
    return { ok: true, recipients: [], suggestions: [] };
  }

  const { data: contacts } = await db
    .from("crm_contacts")
    .select(
      "id, full_name, email, role, organisation_id, crm_organisations ( id, name )"
    )
    .not("email", "is", null);

  const byEmail = new Map<
    string,
    {
      id: string;
      full_name: string;
      email: string | null;
      role: string | null;
      organisation_id: string;
      organisation_name: string;
    }
  >();

  for (const row of contacts || []) {
    const c = row as unknown as {
      id: string;
      full_name: string | null;
      email: string | null;
      role: string | null;
      organisation_id: string;
      crm_organisations?:
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null;
    };
    const norm = normalizeEmailAddress(c.email);
    if (!norm || byEmail.has(norm)) continue;
    const org = Array.isArray(c.crm_organisations)
      ? c.crm_organisations[0]
      : c.crm_organisations;
    byEmail.set(norm, {
      id: c.id,
      full_name: c.full_name || "Unnamed contact",
      email: c.email,
      role: c.role,
      organisation_id: c.organisation_id,
      organisation_name: org?.name || "Organisation",
    });
  }

  return {
    ok: true,
    recipients,
    suggestions: recipients.map((recipientEmail) => ({
      recipientEmail,
      contact: byEmail.get(recipientEmail) ?? null,
    })),
  };
}
