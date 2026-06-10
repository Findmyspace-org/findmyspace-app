import { NextRequest, NextResponse } from "next/server";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { loadPropertyInvitePreview } from "@/lib/property-invite-server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, error: "token is required." });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json(
      { valid: false, error: "Server configuration error." },
      { status: 500 }
    );
  }

  const preview = await loadPropertyInvitePreview(admin, token);
  return NextResponse.json(preview);
}
