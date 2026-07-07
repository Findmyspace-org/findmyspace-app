import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "@/lib/crm-marketing/unsubscribe-token";
import { processPublicUnsubscribe } from "@/lib/crm-marketing/mutations";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server configuration error.");
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing unsubscribe token." }, { status: 400 });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    maskedEmail: maskEmail(verified.payload.emailNormalised),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ ok: false, error: "Missing unsubscribe token." }, { status: 400 });
  }

  const verified = verifyUnsubscribeToken(body.token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  }

  try {
    const admin = getServiceClient();
    await processPublicUnsubscribe(admin, {
      marketingContactId: verified.payload.marketingContactId,
      emailNormalised: verified.payload.emailNormalised,
    });
    return NextResponse.json({
      ok: true,
      message: "You have been unsubscribed from FindMySpace marketing emails.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unsubscribe failed.",
      },
      { status: 400 }
    );
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
