import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPlatformAdminRole } from "@/lib/admin-roles";

export const runtime = "nodejs";

/**
 * One-time Main Admin CRM profile for platform admins (profiles.role = admin).
 * Does not grant Space Place access to property owners or normal users.
 */
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

  const { data: platformProfile } = await (userClient.from("profiles") as any)
    .select("role, full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (!isPlatformAdminRole((platformProfile as { role?: string } | null)?.role)) {
    return NextResponse.json(
      { error: "Only FindMySpace platform admins can enable Main Admin access." },
      { status: 403 }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: existing } = await (adminClient.from("crm_profiles") as any)
    .select("id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ profile: existing, created: false });
  }

  const { data: created, error: insertErr } = await (
    adminClient.from("crm_profiles") as any
  )
    .insert({
      id: user.id,
      full_name:
        (platformProfile as { full_name?: string } | null)?.full_name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Main Admin",
      email: user.email,
      phone: (platformProfile as { phone?: string } | null)?.phone ?? null,
      role: "admin",
      active: true,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ profile: created, created: true });
}
