import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Public validation of invite token (minimal fields only). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: invite, error } = await (admin.from("crm_spacer_invites") as any)
    .select("id, email, full_name, status, expires_at")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ valid: false, error: "Invite not found." });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({
      valid: false,
      error: `Invite is ${invite.status}.`,
    });
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await (admin.from("crm_spacer_invites") as any)
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json({ valid: false, error: "Invite has expired." });
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    full_name: invite.full_name,
    expires_at: invite.expires_at,
  });
}
