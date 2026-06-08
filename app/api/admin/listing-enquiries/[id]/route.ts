import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { LISTING_ENQUIRY_STATUSES } from "@/lib/listing-lifecycle";

type PatchBody = {
  status?: string;
  adminNotes?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    body.status &&
    !(LISTING_ENQUIRY_STATUSES as readonly string[]).includes(body.status)
  ) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status) updates.status = body.status;
  if (body.adminNotes !== undefined) {
    updates.admin_notes = body.adminNotes?.trim() || null;
  }

  const { data, error } = await (admin.from("listing_enquiries") as ReturnType<
    typeof admin.from
  >)
    .update(updates)
    .eq("id", id)
    .select("id, status, admin_notes")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enquiry: data });
}
