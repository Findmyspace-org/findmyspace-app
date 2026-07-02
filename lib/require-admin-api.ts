import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/verify-admin-access";

export type AdminAuthOk = { userId: string; role: string };
export type AdminAuthFail = { response: NextResponse };

/**
 * Verify Bearer JWT and profiles.role is admin or super_admin (and not disabled).
 * Use in Route Handlers only.
 */
export async function requireAdminApi(
  req: NextRequest
): Promise<AdminAuthOk | AdminAuthFail> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
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

    return {
      response: NextResponse.json({ error: result.message }, { status }),
    };
  }

  return { userId: result.admin.userId, role: result.admin.role };
}
