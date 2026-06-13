import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import { resolveGoogleMapsUrlServer } from "@/lib/resolve-google-maps-url-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const urlParam = req.nextUrl.searchParams.get("url")?.trim();
  if (!urlParam) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  const result = await resolveGoogleMapsUrlServer(urlParam);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status }
    );
  }

  return NextResponse.json({
    resolvedUrl: result.resolvedUrl,
    coordinates: result.coordinates,
    searchQuery: result.searchQuery,
  });
}
