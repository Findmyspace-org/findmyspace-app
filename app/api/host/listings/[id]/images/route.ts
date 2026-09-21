import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import {
  classifySpaceImagesInsertError,
  classifyStorageUploadError,
  normalizeFormUpload,
  validateAdminUploadFile,
} from "@/lib/admin-space-image-upload";

export const maxDuration = 60;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Could not read uploaded files.", 400);
  }

  const files = form
    .getAll("files")
    .map((entry, index) => normalizeFormUpload(entry, index))
    .filter((file): file is NonNullable<typeof file> => file !== null);

  if (files.length === 0) {
    return jsonError("No files provided. Select at least one JPG, PNG, or WebP image.", 400);
  }

  const { data: maxSortRows, error: maxSortErr } = await auth.admin
    .from("space_images")
    .select("sort_order")
    .eq("space_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (maxSortErr) {
    return jsonError(classifySpaceImagesInsertError(maxSortErr.message), 500);
  }

  const startOrder =
    maxSortRows && maxSortRows.length > 0
      ? ((maxSortRows[0] as { sort_order: number | null }).sort_order ?? 0) + 1
      : 0;
  const inserted: { id: string; image_url: string; sort_order: number }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validation = validateAdminUploadFile(file);
    if (!validation.ok) {
      failed.push({ name: file.name, error: validation.error });
      continue;
    }

    const filePath = `host/${auth.userId}/${id}/${Date.now()}-${i}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${validation.ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await auth.admin.storage
      .from("space-images")
      .upload(filePath, buffer, {
        contentType: validation.contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadErr) {
      failed.push({
        name: file.name,
        error: classifyStorageUploadError(uploadErr.message),
      });
      continue;
    }

    const { data: publicUrl } = auth.admin.storage
      .from("space-images")
      .getPublicUrl(filePath);
    const sortOrder = startOrder + inserted.length;
    const { data: row, error: insertErr } = await auth.admin
      .from("space_images")
      .insert({
        space_id: id,
        image_url: publicUrl.publicUrl,
        file_path: filePath,
        sort_order: sortOrder,
      })
      .select("id, image_url, file_path, sort_order")
      .single();

    if (insertErr || !row) {
      await auth.admin.storage.from("space-images").remove([filePath]);
      failed.push({
        name: file.name,
        error: classifySpaceImagesInsertError(
          insertErr?.message || "Could not save photo."
        ),
      });
      continue;
    }

    inserted.push(row as { id: string; image_url: string; sort_order: number });
  }

  if (inserted.length === 0 && failed.length > 0) {
    return NextResponse.json(
      {
        error: `All ${failed.length} photo(s) failed to upload.`,
        failed,
        images: [],
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    images: inserted,
    failed,
    partial: failed.length > 0,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireManagedListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { imageId?: string };
  try {
    body = (await req.json()) as { imageId?: string };
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const imageId = body.imageId?.trim();
  if (!imageId) {
    return jsonError("imageId is required.", 400);
  }

  const { data: imageRow, error: fetchErr } = await auth.admin
    .from("space_images")
    .select("id, file_path, space_id")
    .eq("id", imageId)
    .eq("space_id", id)
    .maybeSingle();

  if (fetchErr || !imageRow) {
    return jsonError("Image not found.", 404);
  }

  const filePath = (imageRow as { file_path: string | null }).file_path;
  if (filePath) {
    const { error: storageErr } = await auth.admin.storage
      .from("space-images")
      .remove([filePath]);
    if (storageErr) {
      return jsonError(classifyStorageUploadError(storageErr.message), 500);
    }
  }

  const { error: delErr } = await auth.admin
    .from("space_images")
    .delete()
    .eq("id", imageId)
    .eq("space_id", id);

  if (delErr) {
    return jsonError(classifySpaceImagesInsertError(delErr.message), 500);
  }

  return NextResponse.json({ ok: true });
}
