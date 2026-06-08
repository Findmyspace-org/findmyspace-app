import { NextRequest, NextResponse } from "next/server";
import { computeListingCompletion } from "@/lib/listing-completion";
import { requireOwnerListingApi } from "@/lib/require-owner-listing-api";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerListingApi(req, id);
  if ("response" in auth) return auth.response;

  const completion = await computeListingCompletion(auth.admin, id);
  if (!completion) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  return NextResponse.json(completion);
}
