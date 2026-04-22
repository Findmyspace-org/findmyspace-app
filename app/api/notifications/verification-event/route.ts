import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type VerificationEventType = "identity_submitted" | "bank_submitted";

type NotificationInsertRow = {
  user_id: string;
  role: "admin";
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

function verificationAdminTemplate(input: {
  eventType: VerificationEventType;
  hostName: string;
  hostEmail: string | null;
  adminUrl: string;
}) {
  const typeLabel =
    input.eventType === "identity_submitted"
      ? "Identity verification submitted"
      : "Bank verification submitted";
  const detailsLabel =
    input.eventType === "identity_submitted"
      ? "The host uploaded identity documents."
      : "The host submitted bank details/proof.";

  return `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;">${typeLabel}</h1>
        <p style="margin:0 0 12px;font-size:15px;">A host is awaiting admin review.</p>
        <div style="margin:0 0 20px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>Host:</strong> ${input.hostName}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${input.hostEmail || "Not available"}</p>
          <p style="margin:0;font-size:14px;">${detailsLabel}</p>
        </div>
        <p style="margin:0 0 8px;">
          <a href="${input.adminUrl}" style="display:inline-block;padding:12px 18px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
            Review verification queue
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b;">FindMySpace</p>
      </div>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, eventType } = (await req.json()) as {
      userId?: string;
      eventType?: VerificationEventType;
    };

    if (!userId || !eventType) {
      return NextResponse.json(
        { error: "Missing userId or eventType." },
        { status: 400 }
      );
    }

    if (eventType !== "identity_submitted" && eventType !== "bank_submitted") {
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

    const title =
      eventType === "identity_submitted"
        ? "Identity verification submitted"
        : "Bank verification submitted";
    const detail =
      eventType === "identity_submitted"
        ? `${getDisplayName(hostProfile)} uploaded identity documents and is pending review.`
        : `${getDisplayName(hostProfile)} submitted bank verification details and is pending review.`;

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
        console.error("Admin verification notification insert failed:", error);
      }
    }

    for (const admin of ((admins || []) as { id: string; email?: string | null }[])) {
      if (!admin?.id) continue;

      // Prevent duplicate pending notifications for unchanged re-saves.
      const { data: existing } = await (supabaseAdmin.from("notifications") as any)
        .select("id")
        .eq("user_id", admin.id)
        .eq("type", eventType)
        .eq("related_entity_type", "profile")
        .eq("related_entity_id", hostProfile.id)
        .eq("is_read", false)
        .limit(1);

      if ((existing || []).length > 0) continue;

      await createNotification({
        user_id: admin.id,
        role: "admin",
        type: eventType,
        title,
        message: detail,
        href: "/admin/verification",
        related_entity_type: "profile",
        related_entity_id: hostProfile.id,
      });
    }

    if (ADMIN_NOTIFICATION_EMAIL) {
      await sendEmail({
        to: ADMIN_NOTIFICATION_EMAIL,
        subject: `Admin review needed: ${title}`,
        html: verificationAdminTemplate({
          eventType,
          hostName: getDisplayName(hostProfile),
          hostEmail: hostProfile.email || null,
          adminUrl: adminVerificationUrl,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Verification notification error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

