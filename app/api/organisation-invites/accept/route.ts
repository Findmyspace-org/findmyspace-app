import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { acceptOrganisationAccessInvitation } from "@/lib/access/organisation-access-invite-server";
import { organisationAccessErrorResponse } from "@/lib/access/organisation-access-http";
import { OrganisationAccessError } from "@/lib/access/organisation-access-error";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  let body: {
    token?: string;
    userId?: string;
    organisationId?: string;
    role?: string;
    email?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  if (body.userId || body.organisationId || body.role || body.email) {
    return NextResponse.json(
      { error: "Invitation acceptance does not accept client identity fields." },
      { status: 400 }
    );
  }

  const { data: userData, error: userError } = await auth.admin.auth.admin.getUserById(
    auth.userId
  );
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await acceptOrganisationAccessInvitation(auth.admin, token, {
      userId: auth.userId,
      email: userData.user.email ?? null,
    });
    return NextResponse.json({
      ok: true,
      organisationId: result.organisationId,
      role: result.role,
      redirectTo: result.redirectTo,
    });
  } catch (error) {
    if (error instanceof OrganisationAccessError && error.code === "unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return organisationAccessErrorResponse(error);
  }
}
