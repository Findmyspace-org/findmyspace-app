import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAdvisorCode } from "@/lib/advisor-code";

/**
 * Public: validate an advisor code (active Space Advisor only).
 * Does not expose PII beyond display_name.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("code") || "";
    const code = normalizeAdvisorCode(raw);
    if (!code) {
      return NextResponse.json({ error: "Invalid advisor code." }, { status: 400 });
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
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: row, error } = await (admin.from("space_advisors") as any)
      .select("id, advisor_code, display_name, status")
      .eq("advisor_code", code)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row || (row as { status?: string }).status !== "active") {
      return NextResponse.json(
        { error: "Invalid or inactive advisor code." },
        { status: 404 }
      );
    }

    const r = row as {
      id: string;
      advisor_code: string;
      display_name: string;
      status: string;
    };

    return NextResponse.json({
      advisor: {
        id: r.id,
        advisor_code: r.advisor_code,
        display_name: r.display_name,
      },
    });
  } catch (e: unknown) {
    console.error("advisor lookup GET:", e);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
