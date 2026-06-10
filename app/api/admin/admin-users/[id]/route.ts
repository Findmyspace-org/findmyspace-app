import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/require-super-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import {
  countSuperAdmins,
  removeAdminAccess,
  setAdminAccessDisabled,
} from "@/lib/admin-user-server";
import { isSuperAdminRole } from "@/lib/admin-roles";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action?.trim();
  if (!action || !["disable", "enable", "remove"].includes(action)) {
    return NextResponse.json(
      { error: "action must be disable, enable, or remove." },
      { status: 400 }
    );
  }

  if (id === auth.userId && action !== "enable") {
    return NextResponse.json(
      { error: "You cannot modify your own admin access." },
      { status: 400 }
    );
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  const targetRole = (targetProfile as { role?: string | null } | null)?.role;

  if (action === "remove" && isSuperAdminRole(targetRole)) {
    const superAdminCount = await countSuperAdmins(admin);
    if (superAdminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last super admin." },
        { status: 400 }
      );
    }
  }

  try {
    if (action === "disable") {
      await setAdminAccessDisabled(admin, id, true);
      await adminAudit({
        action: "admin_access_disabled",
        actorUserId: auth.userId,
        targetType: "profile",
        targetId: id,
      });
      return NextResponse.json({ ok: true, message: "Admin access disabled." });
    }

    if (action === "enable") {
      await setAdminAccessDisabled(admin, id, false);
      await adminAudit({
        action: "admin_access_enabled",
        actorUserId: auth.userId,
        targetType: "profile",
        targetId: id,
      });
      return NextResponse.json({ ok: true, message: "Admin access enabled." });
    }

    await removeAdminAccess(admin, id);
    await adminAudit({
      action: "admin_access_removed",
      actorUserId: auth.userId,
      targetType: "profile",
      targetId: id,
      meta: { previous_role: targetRole },
    });
    return NextResponse.json({ ok: true, message: "Admin access removed." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed." },
      { status: 400 }
    );
  }
}
