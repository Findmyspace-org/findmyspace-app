import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdminApi } from "@/lib/require-crm-admin-api";
import {
  buildSpacerInviteUrl,
  generateInviteToken,
  inviteExpiresAt,
} from "@/lib/space-place/invite-token";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireCrmAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: { full_name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim();
  if (!email || !fullName) {
    return NextResponse.json(
      { error: "full_name and email are required." },
      { status: 400 }
    );
  }

  const token = generateInviteToken();
  const expiresAt = inviteExpiresAt(14);

  const { data: invite, error } = await (auth.adminClient.from(
    "crm_spacer_invites"
  ) as any)
    .insert({
      email,
      full_name: fullName,
      phone: body.phone?.trim() || null,
      invite_token: token,
      invited_by: auth.userId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inviteUrl = buildSpacerInviteUrl(token);

  return NextResponse.json({
    invite,
    inviteUrl,
    message:
      "Share this invite link with your Spacer. Email delivery is not configured yet.",
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireCrmAdminApi(req);
  if ("response" in auth) return auth.response;

  const { data, error } = await (auth.adminClient.from(
    "crm_spacer_invites"
  ) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
}
