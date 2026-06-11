import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import {
  emailStrong,
  renderEmailLayout,
} from "@/lib/email-templates/EmailLayout";
import {
  buildBankRejectedCopy,
  buildBankVerifiedCopy,
  buildIdentityRejectedCopy,
  buildIdentityVerifiedCopy,
} from "@/lib/communication-copy";
import { markNotificationsReadByProfile } from "@/lib/notification-lifecycle";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type VerificationEventType =
  | "identity_submitted"
  | "bank_submitted"
  | "identity_verified"
  | "identity_rejected"
  | "bank_verified"
  | "bank_rejected";

const HOST_DECISION_TYPES = new Set<VerificationEventType>([
  "identity_verified",
  "identity_rejected",
  "bank_verified",
  "bank_rejected",
]);

type NotificationInsertRow = {
  user_id: string;
  role: "admin" | "owner";
  type: string;
  title?: string;
  message?: string;
  href?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  is_read?: boolean;
};

function getDisplayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return fullName || profile.email || "Host";
}

export async function POST(req: NextRequest) {
  try {
    const { userId, eventType, adminComment } = (await req.json()) as {
      userId?: string;
      eventType?: VerificationEventType;
      adminComment?: string | null;
    };

    if (!userId || !eventType) {
      return NextResponse.json(
        { error: "Missing userId or eventType." },
        { status: 400 }
      );
    }

    const supportedTypes: VerificationEventType[] = [
      "identity_submitted",
      "bank_submitted",
      "identity_verified",
      "identity_rejected",
      "bank_verified",
      "bank_rejected",
    ];
    if (!supportedTypes.includes(eventType)) {
      return NextResponse.json({ error: "Unsupported eventType." }, { status: 400 });
    }

    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_NOTIFICATION_EMAIL } =
      process.env;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing server config." }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: hostProfile } = await (supabaseAdmin.from("profiles") as any)
      .select("id, first_name, last_name, email")
      .eq("id", userId)
      .single();

    if (!hostProfile?.id) {
      return NextResponse.json({ error: "Host profile not found." }, { status: 404 });
    }

    const { data: admins } = await (supabaseAdmin.from("profiles") as any)
      .select("id, email")
      .eq("role", "admin");

    const appBaseUrl = getCanonicalPublicSiteUrl();
    const adminVerificationUrl = `${appBaseUrl}/admin/verification`;
    const hostSettingsUrl = `${appBaseUrl}/dashboard/verification`;

    async function createNotification(row: NotificationInsertRow) {
      const payload = {
        user_id: row.user_id,
        role: row.role,
        type: row.type,
        title: row.title,
        message: row.message,
        href: row.href,
        related_entity_type: row.related_entity_type,
        related_entity_id: row.related_entity_id,
        is_read: row.is_read ?? false,
      };

      const { error } = await (supabaseAdmin.from("notifications") as any).insert(payload);
      if (error) {
        console.error("Verification notification insert failed:", error);
      }
    }

    // Branch 1 — Admin notification when the host submits identity / bank.
    if (eventType === "identity_submitted" || eventType === "bank_submitted") {
      const title =
        eventType === "identity_submitted"
          ? "Identity verification submitted"
          : "Bank verification submitted";
      const detail =
        eventType === "identity_submitted"
          ? `${getDisplayName(hostProfile)} uploaded identity documents and is pending review.`
          : `${getDisplayName(hostProfile)} submitted bank verification details and is pending review.`;

      for (const adminProfile of ((admins || []) as { id: string; email?: string | null }[])) {
        if (!adminProfile?.id) continue;

        // Prevent duplicate pending notifications for unchanged re-saves.
        const { data: existing } = await (supabaseAdmin.from("notifications") as any)
          .select("id")
          .eq("user_id", adminProfile.id)
          .eq("type", eventType)
          .eq("related_entity_type", "profile")
          .eq("related_entity_id", hostProfile.id)
          .is("read_at", null)
          .limit(1);

        if ((existing || []).length > 0) continue;

        await createNotification({
          user_id: adminProfile.id,
          role: "admin",
          type: eventType,
          title,
          message: detail,
          href: `/admin/verification?profile=${hostProfile.id}`,
          related_entity_type: "profile",
          related_entity_id: hostProfile.id,
        });
      }

      if (ADMIN_NOTIFICATION_EMAIL) {
        // Admin emails aren't part of the user-facing copy module — keep the
        // wording inline but render through the shared layout for consistency.
        const renderedAdmin = renderEmailLayout({
          preheader: `${getDisplayName(hostProfile)} is awaiting admin review.`,
          title,
          bodyLines: [
            "A host is awaiting admin review.",
            {
              html: `Host: ${emailStrong(getDisplayName(hostProfile)).html}`,
            },
            {
              html: `Email: ${emailStrong(hostProfile.email || "Not available").html}`,
            },
            eventType === "identity_submitted"
              ? "The host uploaded identity documents."
              : "The host submitted bank details / proof.",
          ],
          primaryCTA: {
            label: "Review verification queue",
            href: adminVerificationUrl,
          },
          footerRole: "admin",
        });
        await sendEmail({
          to: ADMIN_NOTIFICATION_EMAIL,
          subject: `Admin review needed: ${title}`,
          html: renderedAdmin.html,
          text: renderedAdmin.text,
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Branch 2 — Host decision notification + email after admin verifies / rejects.
    if (HOST_DECISION_TYPES.has(eventType)) {
      const copy =
        eventType === "identity_verified"
          ? buildIdentityVerifiedCopy({
              hostFirstName: hostProfile.first_name,
              adminComment,
            })
          : eventType === "identity_rejected"
          ? buildIdentityRejectedCopy({
              hostFirstName: hostProfile.first_name,
              adminComment,
            })
          : eventType === "bank_verified"
          ? buildBankVerifiedCopy({
              hostFirstName: hostProfile.first_name,
              adminComment,
            })
          : buildBankRejectedCopy({
              hostFirstName: hostProfile.first_name,
              adminComment,
            });

      await createNotification({
        user_id: hostProfile.id,
        role: "owner",
        type: eventType,
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        href: "/dashboard/verification",
        related_entity_type: "profile",
        related_entity_id: hostProfile.id,
      });

      if (hostProfile.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: hostSettingsUrl,
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: hostProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      const clearSubmittedTypes =
        eventType === "identity_verified" || eventType === "identity_rejected"
          ? ["identity_submitted"]
          : ["bank_submitted"];
      await markNotificationsReadByProfile(supabaseAdmin, {
        profileId: hostProfile.id,
        types: clearSubmittedTypes,
      });

      if (
        eventType === "identity_verified" ||
        eventType === "identity_rejected"
      ) {
        await (supabaseAdmin.from("owner_verification_documents") as any)
          .update({ status: eventType === "identity_verified" ? "verified" : "rejected" })
          .eq("owner_id", hostProfile.id)
          .in("document_type", ["id_front", "id_back"]);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Verification notification error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

