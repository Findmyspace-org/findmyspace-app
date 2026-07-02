import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  createServiceAdminClient,
  fetchAdminManageableSpace,
} from "@/lib/admin-unclaimed-space";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = "[admin/spaces/images/reorder]";

  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server configuration error. SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 500 }
    );
  }

  const existing = await fetchAdminManageableSpace(admin, id);
  if (existing.error) {
    return NextResponse.json({ error: existing.error }, { status: 404 });
  }

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

  const imageIds = body.imageIds.map((v) => String(v).trim()).filter(Boolean);
  if (imageIds.length !== body.imageIds.length) {
    return NextResponse.json({ error: "Invalid image id in imageIds." }, { status: 400 });
  }

  const { data: rows, error: fetchErr } = await admin
    .from("space_images")
    .select("id")
    .eq("space_id", id);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const existingIds = new Set(((rows as { id: string }[]) || []).map((r) => r.id));
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
    const { error: updateErr } = await admin
      .from("space_images")
      .update({ sort_order: i })
      .eq("id", imageIds[i])
      .eq("space_id", id);

    if (updateErr) {
      console.error(logPrefix, "update failed:", updateErr.message, {
        spaceId: id,
        imageId: imageIds[i],
      });
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  console.info(
    logPrefix,
    "Reordered",
    JSON.stringify({ spaceId: id, count: imageIds.length })
  );

  return NextResponse.json({ ok: true, imageIds });
}
