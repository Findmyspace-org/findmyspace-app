import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Public host names for the authenticated renter's own organisation bookings only. */
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: bookings, error } = await admin.from("bookings").select("id, organisation_id").eq("renter_id", user.id);
  if (error) return NextResponse.json({ error: "Could not load hosts" }, { status: 500 });
  const ids = [...new Set((bookings || []).map(b => b.organisation_id).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ labels: {} });
  const { data: organisations, error: orgError } = await admin.from("organisations").select("id, name").in("id", ids);
  if (orgError) return NextResponse.json({ error: "Could not load hosts" }, { status: 500 });
  const names = new Map((organisations || []).map(o => [o.id, o.name]));
  const labels = Object.fromEntries((bookings || []).filter(b => names.has(b.organisation_id)).map(b => [b.id, names.get(b.organisation_id)]));
  return NextResponse.json({ labels }, { headers: { "Cache-Control": "private, no-store" } });
}
