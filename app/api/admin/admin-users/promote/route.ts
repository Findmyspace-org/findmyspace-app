import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/require-super-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import { promoteUserToAdmin } from "@/lib/admin-user-server";

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: { email?: string; userId?: string; full_name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.email?.trim() && !body.userId?.trim()) {
    return NextResponse.json(
      { error: "email or userId is required." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const result = await promoteUserToAdmin(admin, {
      email: body.email,
      userId: body.userId,
      fullName: body.full_name,
    });

    await adminAudit({
      action: "admin_user_promoted",
      actorUserId: auth.userId,
      targetType: "profile",
      targetId: result.userId,
      meta: { email: body.email?.trim().toLowerCase(), email_sent: result.emailSent },
    });

    return NextResponse.json({
      ok: true,
      userId: result.userId,
      emailSent: result.emailSent,
      message: result.emailSent
        ? "User promoted to admin. Setup email sent."
        : "User promoted to admin. Email could not be sent — use Resend invite.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not promote user." },
      { status: 400 }
    );
  }
}
