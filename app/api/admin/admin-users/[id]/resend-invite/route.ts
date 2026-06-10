import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/require-super-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import { resendAdminInvite } from "@/lib/admin-user-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const result = await resendAdminInvite(admin, id);
    await adminAudit({
      action: "admin_invite_resent",
      actorUserId: auth.userId,
      targetType: "profile",
      targetId: id,
      meta: { email_sent: result.emailSent },
    });

    return NextResponse.json({
      ok: true,
      emailSent: result.emailSent,
      message: result.emailSent
        ? "Invite email sent."
        : "Could not send email. Check email configuration.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resend invite." },
      { status: 400 }
    );
  }
}
