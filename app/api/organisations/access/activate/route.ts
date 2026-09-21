import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json({
    ok: true,
    activatedCount: 0,
    invitationRequired: true,
  });
}
