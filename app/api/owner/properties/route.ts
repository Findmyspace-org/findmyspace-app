import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPropertyAddress } from "@/lib/admin-property";
import { fetchOwnerPropertiesForUser } from "@/lib/owner-properties-query";

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

  const result = await fetchOwnerPropertiesForUser(client, user.id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 500 }
    );
  }

  const rows = result.properties;
  const propertyIds = rows.map((r) => r.id);
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
      address_line1: row.address_line1,
      suburb: row.suburb,
      city: row.city,
      province: row.province,
    }),
    space_count: spaceCountByProperty.get(row.id) || 0,
    owner_accepted_at: row.owner_accepted_at,
    created_at: row.created_at,
  }));

  return NextResponse.json({
    properties: list,
    ...(result.migrationWarning
      ? { migration_warning: result.migrationWarning }
      : {}),
  });
}
