import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { resolveAccessForOrganisation } from "@/lib/access/resolve-access";
import { isUuid } from "@/lib/access/organisation-access-policy";
import type { ManagedAuthOk, ManagedAuthFail } from "@/lib/access/require-managed-api";

export async function requireOrgCommercialApi(
  req: NextRequest,
  organisationId: string
): Promise<ManagedAuthOk | ManagedAuthFail> {
  if (!isUuid(organisationId)) {
    return {
      response: NextResponse.json(
        { error: "Invalid organisation id." },
        { status: 400 }
      ),
    };
  }

  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth;

  const { data: organisation, error } = await auth.admin
    .from("organisations")
    .select("id, name, status")
    .eq("id", organisationId)
    .maybeSingle();

  if (error || !organisation) {
    return {
      response: NextResponse.json(
        { error: "Organisation not found." },
        { status: 404 }
      ),
    };
  }

  const access = await resolveAccessForOrganisation(
    auth.admin,
    auth.userId,
    organisationId
  );

  if (!access.canManageOrganisationFinance) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { userId: auth.userId, admin: auth.admin, access };
}
