import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { nominatimReverse, nominatimSearch } from "@/lib/nominatim-server";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  const query = req.nextUrl.searchParams.get("q")?.trim() || "";
  const limitParam = req.nextUrl.searchParams.get("limit");

  try {
    if (latParam !== null && lngParam !== null) {
      const lat = Number(latParam);
      const lng = Number(lngParam);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
      }

      const result = await nominatimReverse(lat, lng);
      if (!result) {
        return NextResponse.json({ error: "No address found for this pin." }, { status: 404 });
      }

      return NextResponse.json({ result });
    }

    if (!query) {
      return NextResponse.json({ error: "q is required." }, { status: 400 });
    }

    if (query.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const limit = limitParam ? Number(limitParam) : 5;
    const results = await nominatimSearch(query, {
      limit: Number.isFinite(limit) ? limit : 5,
      countrycodes: "za",
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[admin/geocode]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geocoding failed." },
      { status: 502 }
    );
  }
}
