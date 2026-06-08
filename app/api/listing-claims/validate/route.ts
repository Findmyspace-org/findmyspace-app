import { NextRequest, NextResponse } from "next/server";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { loadClaimPreview } from "@/lib/listing-claim-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const preview = await loadClaimPreview(admin, token);
  return NextResponse.json(preview);
}
