import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAdvisorCode } from "@/lib/advisor-code";

/**
 * First-touch: attach Space Advisor to the signed-in user's profile when
 * `advisor_id` is still null. Uses Bearer JWT + service role update.
 */
export async function POST(req: NextRequest) {
  try {
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

    let body: { code?: string };
    try {
      body = (await req.json()) as { code?: string };
    } catch {
      body = {};
    }

    const code = normalizeAdvisorCode(body.code);
    if (!code) {
      return NextResponse.json({ error: "Invalid advisor code." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: advisorRow, error: advErr } = await (admin
      .from("space_advisors") as any)
      .select("id, advisor_code, status")
      .eq("advisor_code", code)
      .maybeSingle();

    if (advErr) {
      return NextResponse.json({ error: advErr.message }, { status: 500 });
    }
    const adv = advisorRow as { id: string; advisor_code: string; status: string } | null;
    if (!adv || adv.status !== "active") {
      return NextResponse.json(
        { error: "Invalid or inactive advisor code." },
        { status: 404 }
      );
    }

    const { data: existing, error: readErr } = await (admin.from("profiles") as any)
      .select("advisor_id")
      .eq("id", user.id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    if ((existing as { advisor_id?: string | null } | null)?.advisor_id) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_set" });
    }

    const now = new Date().toISOString();
    const { error: updErr } = await (admin.from("profiles") as any)
      .update({
        advisor_id: adv.id,
        advisor_code: adv.advisor_code,
        advisor_source: "link",
        advisor_assigned_at: now,
      })
      .eq("id", user.id)
      .is("advisor_id", null);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      advisor_code: adv.advisor_code,
    });
  } catch (e: unknown) {
    console.error("advisor claim-profile POST:", e);
    return NextResponse.json({ error: "Could not apply advisor." }, { status: 500 });
  }
}
