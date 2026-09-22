import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import { formatPayoutMoney } from "@/lib/organisation-payout";

async function loadActiveOrgAdmins(
  admin: SupabaseClient,
  organisationId: string
): Promise<Array<{ id: string; email: string | null }>> {
  const { data: grants, error } = await admin
    .from("organisation_access")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .eq("role", "org_admin")
    .eq("status", "active");
  if (error) {
    console.error("[organisation-payout-notify] load OA failed", error.message);
    return [];
  }
  const ids = Array.from(
    new Set(
      ((grants || []) as Array<{ user_id: string | null }>)
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (ids.length === 0) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", ids);
  return (profiles || []) as Array<{ id: string; email: string | null }>;
}

export async function notifyOrganisationPayoutRecorded(params: {
  admin: SupabaseClient;
  organisationId: string;
  organisationName: string;
  amountNet: number;
  reference: string;
}): Promise<void> {
  try {
    const href = `${getCanonicalPublicSiteUrl()}/dashboard/finance?organisation=${params.organisationId}`;
    const amount = formatPayoutMoney(params.amountNet);
    const title = "Payout recorded";
    const message = `${amount} was recorded as paid to ${params.organisationName}. Reference: ${params.reference}`;
    const recipients = await loadActiveOrgAdmins(params.admin, params.organisationId);
    const seen = new Set<string>();
    for (const recipient of recipients) {
      if (seen.has(recipient.id)) continue;
      seen.add(recipient.id);
      const { error } = await params.admin.from("notifications").insert({
        user_id: recipient.id,
        role: "owner",
        type: "organisation.payout.recorded",
        title,
        message,
        href,
        related_entity_type: "organisation",
        related_entity_id: params.organisationId,
        is_read: false,
      });
      if (error) {
        console.error("[organisation-payout-notify] insert failed", error.message);
      }
      if (!recipient.email) continue;
      const rendered = renderEmailLayout({
        preheader: message,
        title,
        bodyLines: [message],
        primaryCTA: { label: "Open Finance", href },
        footerRole: "host",
      });
      await sendEmail({
        to: recipient.email,
        subject: `Payout recorded: ${params.organisationName}`,
        html: rendered.html,
        text: rendered.text,
      });
    }
  } catch (error) {
    console.error("[organisation-payout-notify] failed", error);
  }
}
