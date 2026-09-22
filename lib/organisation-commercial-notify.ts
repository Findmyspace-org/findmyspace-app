import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { PLATFORM_ADMIN_ROLES } from "@/lib/admin-roles";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type NotifyKind =
  | "verification_submitted"
  | "verification_resubmitted"
  | "verification_verified"
  | "verification_rejected"
  | "bank_submitted"
  | "bank_superseded"
  | "bank_verified"
  | "bank_rejected";

type Recipient = {
  id: string;
  email: string | null;
  role: "owner" | "admin";
};

async function insertNotification(
  admin: SupabaseClient,
  row: {
    user_id: string;
    role: "owner" | "admin";
    type: string;
    title: string;
    message: string;
    href: string;
    related_entity_id: string;
  }
) {
  const { error } = await admin.from("notifications").insert({
    user_id: row.user_id,
    role: row.role,
    type: row.type,
    title: row.title,
    message: row.message,
    href: row.href,
    related_entity_type: "organisation",
    related_entity_id: row.related_entity_id,
    is_read: false,
  });
  if (error) {
    console.error("[organisation-commercial-notify] insert failed", error.message);
  }
}

async function loadActiveGlobalAdmins(admin: SupabaseClient): Promise<Recipient[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, role, admin_access_disabled")
    .in("role", [...PLATFORM_ADMIN_ROLES]);
  if (error) {
    console.error("[organisation-commercial-notify] load GA failed", error.message);
    return [];
  }
  return ((data || []) as Array<{
    id: string;
    email: string | null;
    role: string | null;
    admin_access_disabled: boolean | null;
  }>)
    .filter((row) => !row.admin_access_disabled)
    .map((row) => ({ id: row.id, email: row.email, role: "admin" as const }));
}

async function loadActiveOrgAdmins(
  admin: SupabaseClient,
  organisationId: string,
  excludeUserId?: string
): Promise<Recipient[]> {
  const { data: grants, error } = await admin
    .from("organisation_access")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .eq("role", "org_admin")
    .eq("status", "active");
  if (error) {
    console.error("[organisation-commercial-notify] load OA failed", error.message);
    return [];
  }
  const ids = Array.from(
    new Set(
      ((grants || []) as Array<{ user_id: string | null }>)
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id) && id !== excludeUserId)
    )
  );
  if (ids.length === 0) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", ids);
  return ((profiles || []) as Array<{ id: string; email: string | null }>).map(
    (row) => ({ id: row.id, email: row.email, role: "owner" as const })
  );
}

function copyFor(
  kind: NotifyKind,
  organisationName: string
): { title: string; message: string; subject: string } {
  switch (kind) {
    case "verification_submitted":
      return {
        title: "Organisation verification submitted",
        message: `${organisationName} submitted organisation verification for review.`,
        subject: `Organisation verification submitted: ${organisationName}`,
      };
    case "verification_resubmitted":
      return {
        title: "Organisation verification resubmitted",
        message: `${organisationName} resubmitted organisation verification for review.`,
        subject: `Organisation verification resubmitted: ${organisationName}`,
      };
    case "verification_verified":
      return {
        title: "Organisation verified",
        message: `${organisationName} has been verified and can accept paid bookings when listings are ready.`,
        subject: `${organisationName} has been verified`,
      };
    case "verification_rejected":
      return {
        title: "Organisation verification needs attention",
        message: `${organisationName} organisation verification was not approved. Review the reason and resubmit.`,
        subject: `${organisationName} verification needs attention`,
      };
    case "bank_submitted":
      return {
        title: "Organisation bank details submitted",
        message: `${organisationName} submitted bank details for verification.`,
        subject: `Organisation bank details submitted: ${organisationName}`,
      };
    case "bank_superseded":
      return {
        title: "Verified organisation bank details changed",
        message: `${organisationName} changed previously verified bank details. The new version is pending review.`,
        subject: `Verified bank details changed: ${organisationName}`,
      };
    case "bank_verified":
      return {
        title: "Organisation bank details verified",
        message: `${organisationName} bank details have been verified.`,
        subject: `${organisationName} bank details verified`,
      };
    case "bank_rejected":
      return {
        title: "Organisation bank details need attention",
        message: `${organisationName} bank details were not approved. Review the reason and resubmit.`,
        subject: `${organisationName} bank details need attention`,
      };
  }
}

export async function notifyOrganisationCommercialEvent(params: {
  admin: SupabaseClient;
  organisationId: string;
  organisationName: string;
  kind: NotifyKind;
  actorUserId: string;
  reason?: string | null;
}): Promise<void> {
  try {
    const base = getCanonicalPublicSiteUrl();
    const copy = copyFor(params.kind, params.organisationName);
    const adminHref = `${base}/admin/verification/organisations?organisation=${params.organisationId}`;
    const orgHref = `${base}/dashboard/organisation?organisation=${params.organisationId}`;

    let recipients: Recipient[] = [];
    if (
      params.kind === "verification_submitted" ||
      params.kind === "verification_resubmitted" ||
      params.kind === "bank_submitted"
    ) {
      recipients = await loadActiveGlobalAdmins(params.admin);
    } else if (params.kind === "bank_superseded") {
      const [admins, otherOrgAdmins] = await Promise.all([
        loadActiveGlobalAdmins(params.admin),
        loadActiveOrgAdmins(params.admin, params.organisationId, params.actorUserId),
      ]);
      recipients = [...admins, ...otherOrgAdmins];
    } else {
      recipients = await loadActiveOrgAdmins(params.admin, params.organisationId);
    }

    const seen = new Set<string>();
    for (const recipient of recipients) {
      if (seen.has(recipient.id)) continue;
      seen.add(recipient.id);
      const href = recipient.role === "admin" ? adminHref : orgHref;
      await insertNotification(params.admin, {
        user_id: recipient.id,
        role: recipient.role,
        type: `organisation.${params.kind}`,
        title: copy.title,
        message: params.reason ? `${copy.message} ${params.reason}` : copy.message,
        href,
        related_entity_id: params.organisationId,
      });
      if (!recipient.email) continue;
      const rendered = renderEmailLayout({
        preheader: copy.message,
        title: copy.title,
        bodyLines: [
          copy.message,
          params.reason ? `Reason: ${params.reason}` : "",
        ].filter(Boolean),
        primaryCTA: { label: "Open FindMySpace", href },
        footerRole: recipient.role === "admin" ? "admin" : "host",
      });
      await sendEmail({
        to: recipient.email,
        subject: copy.subject,
        html: rendered.html,
        text: rendered.text,
      });
    }
  } catch (error) {
    console.error("[organisation-commercial-notify] failed", error);
  }
}
