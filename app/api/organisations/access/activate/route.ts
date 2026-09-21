import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { activatePendingOrganisationAccess } from "@/lib/access/activate-pending-organisation-access";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  try {
    const activated = await activatePendingOrganisationAccess(
      auth.admin,
      auth.userId
    );
    return NextResponse.json({ ok: true, activatedCount: activated.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
