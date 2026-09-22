import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { listManageableOrganisations } from "@/lib/access/organisation-access-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";
import { organisationCommercialErrorResponse } from "@/lib/organisation-commercial-http";
import { createOrganisationWithCommercialProfile } from "@/lib/organisation-create";
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

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { data: profile } = await auth.admin
      .from("profiles")
      .select("role, admin_access_disabled, email")
      .eq("id", auth.userId)
      .maybeSingle();
    const row = profile as {
      role?: string | null;
      admin_access_disabled?: boolean | null;
      email?: string | null;
    } | null;
    const isGlobalAdmin =
      isPlatformAdminRole(row?.role) && !Boolean(row?.admin_access_disabled);

    const organisation = await createOrganisationWithCommercialProfile(auth.admin, {
      actorUserId: auth.userId,
      actorEmail: row?.email ?? null,
      name: typeof body.name === "string" ? body.name : "",
      organisationType:
        typeof body.organisation_type === "string" ? body.organisation_type : null,
      registrationNumber:
        typeof body.registration_number === "string"
          ? body.registration_number
          : null,
      isGlobalAdmin,
    });

    return NextResponse.json({ organisation }, { status: 201 });
  } catch (error) {
    return organisationCommercialErrorResponse(error);
  }
}
