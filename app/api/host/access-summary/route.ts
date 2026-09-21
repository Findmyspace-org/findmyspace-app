import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { loadHostingAccessSummary } from "@/lib/access/load-hosting-access";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const summary = await loadHostingAccessSummary(auth.admin, auth.userId);
  return NextResponse.json({ summary });
}
