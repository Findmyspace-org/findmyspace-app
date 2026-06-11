import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import {
  classifyPropertyImagesInsertError,
  classifyStorageUploadError,
  missingServiceRoleMessage,
  normalizeFormUpload,
  validateAdminUploadFile,
} from "@/lib/admin-space-image-upload";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const maxDuration = 60;

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, code: code ?? "upload_failed" }, { status });
}

async function assertPropertyExists(
  admin: NonNullable<ReturnType<typeof createServiceAdminClient>>,
  propertyId: string
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await admin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Property not found." };
  return { ok: true };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(_req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return jsonError("Invalid property id.", 400, "invalid_property_id");
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return jsonError("Server configuration error.", 500, "missing_service_role");
  }

  const exists = await assertPropertyExists(admin, id);
  if ("error" in exists) {
    return jsonError(exists.error, 404, "property_not_found");
  }

  const { data, error } = await admin
    .from("property_images")
    .select("id, image_url, sort_order, caption")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return jsonError(error.message, 500, "property_images_read_failed");
  }

  return NextResponse.json({ images: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = "[admin/property/images]";
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return jsonError("Invalid property id.", 400, "invalid_property_id");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
  }

  const exists = await assertPropertyExists(admin, id);
  if ("error" in exists) {
    return jsonError(exists.error, 404, "property_not_found");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (formErr) {
    const msg =
      formErr instanceof Error ? formErr.message : "Could not read upload payload.";
    const lower = msg.toLowerCase();
    if (lower.includes("too large") || lower.includes("payload")) {
      return jsonError(
        "Upload payload too large. Use images under 4 MB each.",
        413,
        "payload_too_large"
      );
    }
    return jsonError(`Could not read uploaded files: ${msg}`, 400, "invalid_form_data");
  }

  const rawEntries = form.getAll("files");
  const files = rawEntries
    .map((entry, index) => normalizeFormUpload(entry, index))
    .filter((f): f is NonNullable<typeof f> => f !== null);

  if (files.length === 0) {
    return jsonError(
      "No files provided. Select at least one JPG, PNG, or WebP image.",
      400,
      "no_files"
    );
  }

  const { count: existingCount, error: countErr } = await admin
    .from("property_images")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id);

  if (countErr) {
    return jsonError(
      classifyPropertyImagesInsertError(countErr.message),
      500,
      "property_images_read_denied"
    );
  }

  const startOrder = existingCount ?? 0;
  const inserted: { id: string; image_url: string; sort_order: number }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validation = validateAdminUploadFile(file);
    if (!validation.ok) {
      failed.push({ name: file.name, error: validation.error });
      continue;
    }

    const filePath = `properties/${id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${validation.ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from("space-images")
      .upload(filePath, buffer, {
        contentType: validation.contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadErr) {
      console.error(logPrefix, "Storage upload failed:", uploadErr.message, {
        propertyId: id,
        filePath,
      });
      failed.push({
        name: file.name,
        error: classifyStorageUploadError(uploadErr.message),
      });
      continue;
    }

    const { data: publicUrl } = admin.storage
      .from("space-images")
      .getPublicUrl(filePath);

    const imageUrl = publicUrl.publicUrl;
    const sortOrder = startOrder + inserted.length;

    const { data: row, error: insertErr } = await admin
      .from("property_images")
      .insert({
        property_id: id,
        image_url: imageUrl,
        file_path: filePath,
        sort_order: sortOrder,
      })
      .select("id, image_url, sort_order")
      .single();

    if (insertErr || !row) {
      console.error(logPrefix, "property_images insert failed:", insertErr?.message, {
        propertyId: id,
      });
      await admin.storage.from("space-images").remove([filePath]);
      failed.push({
        name: file.name,
        error: classifyPropertyImagesInsertError(insertErr?.message || "Insert failed."),
      });
      continue;
    }

    inserted.push(row as { id: string; image_url: string; sort_order: number });
  }

  return NextResponse.json({ images: inserted, failed });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = "[admin/property/images]";
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return jsonError("Invalid property id.", 400, "invalid_property_id");
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
  }

  let body: { imageId?: string };
  try {
    body = (await req.json()) as { imageId?: string };
  } catch {
    return jsonError("Invalid JSON.", 400, "invalid_json");
  }

  const imageId = body.imageId?.trim();
  if (!imageId) {
    return jsonError("imageId is required.", 400, "missing_image_id");
  }

  const { data: imageRow, error: fetchErr } = await admin
    .from("property_images")
    .select("id, file_path, property_id")
    .eq("id", imageId)
    .eq("property_id", id)
    .maybeSingle();

  if (fetchErr || !imageRow) {
    return jsonError("Image not found.", 404, "image_not_found");
  }

  const filePath = (imageRow as { file_path: string | null }).file_path;
  if (filePath) {
    const { error: storageErr } = await admin.storage
      .from("space-images")
      .remove([filePath]);
    if (storageErr) {
      console.error(logPrefix, "Storage delete failed:", storageErr.message, {
        propertyId: id,
        filePath,
      });
      return jsonError(
        classifyStorageUploadError(storageErr.message),
        500,
        "storage_delete_failed"
      );
    }
  }

  const { error: delErr } = await admin
    .from("property_images")
    .delete()
    .eq("id", imageId);

  if (delErr) {
    return jsonError(
      classifyPropertyImagesInsertError(delErr.message),
      500,
      "property_images_delete_denied"
    );
  }

  return NextResponse.json({ ok: true });
}
