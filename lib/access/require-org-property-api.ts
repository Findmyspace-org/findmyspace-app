import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { resolveAccessForOrganisation } from "@/lib/access/resolve-access";
import { isUuid } from "@/lib/access/organisation-access-policy";
import { canCreateOrganisationProperty } from "@/lib/organisation-property";
import type { ManagedAuthOk, ManagedAuthFail } from "@/lib/access/require-managed-api";

type OrgPropertyAuthOk = ManagedAuthOk & {
  organisation: { id: string; name: string; status: string };
};

export async function requireOrgPropertyCreateApi(
  req: NextRequest,
  organisationId: string
): Promise<OrgPropertyAuthOk | ManagedAuthFail> {
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
    .select("id, name, status, archived_at")
    .eq("id", organisationId)
    .maybeSingle();

  const access = await resolveAccessForOrganisation(
    auth.admin,
    auth.userId,
    organisationId
  );

  if (error || !organisation || !canCreateOrganisationProperty(access)) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  const row = organisation as {
    id: string;
    name: string;
    status: string;
    archived_at: string | null;
  };
  if (row.status === "archived" || row.archived_at) {
    return {
      response: NextResponse.json(
        { error: "This organisation is not available." },
        { status: 403 }
      ),
    };
  }

  return {
    userId: auth.userId,
    admin: auth.admin,
    access,
    organisation: { id: row.id, name: row.name, status: row.status },
  };
}
