import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { listManageableOrganisations } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";
import { isPlatformAdminRole } from "@/lib/admin-roles";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { data: profile } = await auth.admin
      .from("profiles")
      .select("role, admin_access_disabled")
      .eq("id", auth.userId)
      .maybeSingle();
    const isGlobalAdmin =
      isPlatformAdminRole((profile as { role?: string | null } | null)?.role) &&
      !Boolean(
        (profile as { admin_access_disabled?: boolean | null } | null)
          ?.admin_access_disabled
      );

    const organisations = await listManageableOrganisations(
      auth.admin,
      auth.userId,
      isGlobalAdmin
    );
    return NextResponse.json({ organisations });
  } catch (error) {
    return organisationAccessErrorResponse(error);
  }
}
