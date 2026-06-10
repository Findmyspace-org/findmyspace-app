import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/require-super-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import { inviteAdminUser, listAdminUsers } from "@/lib/admin-user-server";
import { ADMIN_ROLE } from "@/lib/admin-roles";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const admins = await listAdminUsers(admin);
    return NextResponse.json({ admins });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load admin users." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: { full_name?: string; email?: string; role?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const result = await inviteAdminUser(admin, {
      fullName: body.full_name || "",
      email: body.email || "",
      role: body.role || ADMIN_ROLE,
    });

    await adminAudit({
      action: "admin_user_invited",
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
        ? "Admin invited. Password setup email sent."
        : "Admin invited. Email could not be sent — use Resend invite.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not invite admin." },
      { status: 400 }
    );
  }
}
