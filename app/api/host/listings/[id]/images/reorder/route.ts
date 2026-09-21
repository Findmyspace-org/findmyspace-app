import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { imageIds?: unknown };
  try {
    body = (await req.json()) as { imageIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    return NextResponse.json(
      { error: "imageIds must be a non-empty array of image ids." },
      { status: 400 }
    );
  }

  const imageIds = body.imageIds.map((value) => String(value).trim()).filter(Boolean);
  if (imageIds.length !== body.imageIds.length) {
    return NextResponse.json({ error: "Invalid image id in imageIds." }, { status: 400 });
  }

  const { data: rows, error: fetchErr } = await auth.admin
    .from("space_images")
    .select("id")
    .eq("space_id", id);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const existingIds = new Set(((rows as { id: string }[]) || []).map((row) => row.id));
  if (existingIds.size !== imageIds.length) {
    return NextResponse.json(
      {
        error:
          "imageIds must include every photo for this listing in the desired order.",
      },
      { status: 400 }
    );
  }

  for (const imageId of imageIds) {
    if (!existingIds.has(imageId)) {
      return NextResponse.json(
        { error: `Image ${imageId} does not belong to this listing.` },
        { status: 400 }
      );
    }
  }

  for (let i = 0; i < imageIds.length; i++) {
    const { error: updateErr } = await auth.admin
      .from("space_images")
      .update({ sort_order: i })
      .eq("id", imageIds[i])
      .eq("space_id", id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, imageIds });
}
