import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/verify-admin-access";

/**
 * Server-verified admin session for the admin UI.
 * Uses the same profiles.role + admin_access_disabled checks as admin APIs.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const result = await verifyAdminAccess(accessToken);

  if (!result.ok) {
    const status =
      result.reason === "config"
        ? 500
        : result.reason === "unauthorized"
          ? 401
          : 403;

    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    userId: result.admin.userId,
    email: result.admin.email,
    role: result.admin.role,
    adminAccessDisabled: result.admin.adminAccessDisabled,
  });
}
