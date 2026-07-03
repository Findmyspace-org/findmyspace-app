import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPropertyAddress } from "@/lib/admin-property";

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: properties, error } = await client
    .from("properties")
    .select("id, name, city, suburb, address_line1, province, owner_accepted_at, created_at")
    .eq("owner_id", user.id)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (properties || []) as Record<string, unknown>[];
  const propertyIds = rows.map((r) => r.id as string);
  const spaceCountByProperty = new Map<string, number>();

    if (propertyIds.length > 0) {
    const { data: spaces } = await client
      .from("spaces")
      .select("property_id")
      .in("property_id", propertyIds)
      .neq("status", "deleted");

    for (const space of (spaces as { property_id: string }[]) || []) {
      spaceCountByProperty.set(
        space.property_id,
        (spaceCountByProperty.get(space.property_id) || 0) + 1
      );
    }
  }

  const list = rows.map((row) => ({
    id: row.id,
    name: row.name,
    formatted_address: formatPropertyAddress({
      address_line1: row.address_line1 as string | null,
      suburb: row.suburb as string | null,
      city: row.city as string | null,
      province: row.province as string | null,
    }),
    space_count: spaceCountByProperty.get(row.id as string) || 0,
    owner_accepted_at: row.owner_accepted_at,
    created_at: row.created_at,
  }));

  return NextResponse.json({ properties: list });
}
