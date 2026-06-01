import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: invite, error: inviteErr } = await (
    admin.from("crm_spacer_invites") as any
  )
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();

  if (inviteErr || !invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}.` },
      { status: 400 }
    );
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await (admin.from("crm_spacer_invites") as any)
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json({ error: "Invite has expired." }, { status: 400 });
  }

  const userEmail = user.email?.trim().toLowerCase();
  const inviteEmail = invite.email?.trim().toLowerCase();
  if (userEmail && inviteEmail && userEmail !== inviteEmail) {
    return NextResponse.json(
      {
        error: `Please sign in with ${invite.email} to accept this invite.`,
      },
      { status: 403 }
    );
  }

  const { data: existingCrm } = await (admin.from("crm_profiles") as any)
    .select("id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (existingCrm?.active && existingCrm.role === "admin") {
    return NextResponse.json(
      { error: "You already have Main Admin Space Place access." },
      { status: 400 }
    );
  }

  const profilePayload = {
    id: user.id,
    full_name: invite.full_name || user.user_metadata?.full_name || "Spacer",
    email: user.email || invite.email,
    phone: invite.phone || null,
    role: "spacer",
    active: true,
  };

  const { data: profile, error: profileErr } = await (
    admin.from("crm_profiles") as any
  )
    .upsert(profilePayload, { onConflict: "id" })
    .select("*")
    .single();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  await (admin.from("crm_spacer_invites") as any)
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  return NextResponse.json({ profile, accepted: true });
}
