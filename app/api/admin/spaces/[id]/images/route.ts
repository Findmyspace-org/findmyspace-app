import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  createServiceAdminClient,
  fetchAdminUnclaimedSpace,
} from "@/lib/admin-unclaimed-space";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const existing = await fetchAdminUnclaimedSpace(admin, id);
  if (existing.error) {
    return NextResponse.json({ error: existing.error }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided." }, { status: 400 });
  }

  const { count: existingCount } = await admin
    .from("space_images")
    .select("id", { count: "exact", head: true })
    .eq("space_id", id);

  const startOrder = existingCount ?? 0;
  const inserted: { id: string; image_url: string; sort_order: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `admin-unclaimed/${id}/${Date.now()}-${i}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("space-images")
      .upload(filePath, buffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const { data: publicUrl } = admin.storage
      .from("space-images")
      .getPublicUrl(filePath);

    const sortOrder = startOrder + i;
    const { data: row, error: insertErr } = await admin
      .from("space_images")
      .insert({
        space_id: id,
        image_url: publicUrl.publicUrl,
        file_path: filePath,
        sort_order: sortOrder,
      })
      .select("id, image_url, sort_order")
      .single();

    if (insertErr || !row) {
      return NextResponse.json(
        { error: insertErr?.message || "Could not save image record." },
        { status: 500 }
      );
    }

    inserted.push(row as { id: string; image_url: string; sort_order: number });
  }

  return NextResponse.json({ ok: true, images: inserted });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const existing = await fetchAdminUnclaimedSpace(admin, id);
  if (existing.error) {
    return NextResponse.json({ error: existing.error }, { status: 404 });
  }

  let body: { imageId?: string };
  try {
    body = (await req.json()) as { imageId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const imageId = body.imageId?.trim();
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required." }, { status: 400 });
  }

  const { data: imageRow, error: fetchErr } = await admin
    .from("space_images")
    .select("id, file_path, space_id")
    .eq("id", imageId)
    .eq("space_id", id)
    .maybeSingle();

  if (fetchErr || !imageRow) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const filePath = (imageRow as { file_path: string | null }).file_path;
  if (filePath) {
    await admin.storage.from("space-images").remove([filePath]);
  }

  const { error: delErr } = await admin
    .from("space_images")
    .delete()
    .eq("id", imageId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
