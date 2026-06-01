import { NextRequest, NextResponse } from "next/server";
import { requireCrmAdminApi } from "@/lib/require-crm-admin-api";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  let body: { active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active boolean required." }, { status: 400 });
  }

  if (id === auth.userId && body.active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own Main Admin profile." },
      { status: 400 }
    );
  }

  const { data, error } = await (auth.adminClient.from("crm_profiles") as any)
    .update({ active: body.active })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
