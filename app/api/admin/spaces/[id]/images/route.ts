import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  createServiceAdminClient,
  fetchAdminUnclaimedSpace,
} from "@/lib/admin-unclaimed-space";
import {
  classifySpaceImagesInsertError,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = "[admin/unclaimed/images]";
  let spaceId = "";

  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    spaceId = id;

    if (!UUID_RE.test(id)) {
      return jsonError("Invalid listing id.", 400, "invalid_listing_id");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      console.error(logPrefix, missingServiceRoleMessage());
      return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
    }

    const admin = createServiceAdminClient();
    if (!admin) {
      console.error(logPrefix, "createServiceAdminClient returned null.");
      return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
    }

    const existing = await fetchAdminUnclaimedSpace(admin, id);
    if (existing.error) {
      console.warn(logPrefix, "Listing not found or not editable:", existing.error, {
        spaceId: id,
      });
      return jsonError(existing.error, 404, "listing_not_found");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch (formErr) {
      const msg =
        formErr instanceof Error ? formErr.message : "Could not read upload payload.";
      console.error(logPrefix, "formData parse failed:", msg, { spaceId: id });
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
      console.warn(logPrefix, "No files in multipart form.", {
        spaceId: id,
        rawCount: rawEntries.length,
      });
      return jsonError(
        "No files provided. Select at least one JPG, PNG, or WebP image.",
        400,
        "no_files"
      );
    }

    console.info(
      logPrefix,
      "Upload start",
      JSON.stringify({
        spaceId: id,
        adminUserId: auth.userId,
        fileCount: files.length,
        names: files.map((f) => f.name),
      })
    );

    const { count: existingCount, error: countErr } = await admin
      .from("space_images")
      .select("id", { count: "exact", head: true })
      .eq("space_id", id);

    if (countErr) {
      console.error(logPrefix, "space_images count failed:", countErr.message, {
        spaceId: id,
      });
      return jsonError(
        classifySpaceImagesInsertError(countErr.message),
        500,
        "space_images_read_denied"
      );
    }

    const startOrder = existingCount ?? 0;
    const inserted: { id: string; image_url: string; sort_order: number }[] = [];
    const failed: { name: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateAdminUploadFile(file);
      if (!validation.ok) {
        console.warn(logPrefix, "File rejected:", validation.error, {
          spaceId: id,
          fileName: file.name,
        });
        failed.push({ name: file.name, error: validation.error });
        continue;
      }

      const filePath = `admin-unclaimed/${id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${validation.ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await admin.storage
        .from("space-images")
        .upload(filePath, buffer, {
          contentType: validation.contentType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        const errMsg = classifyStorageUploadError(uploadErr.message);
        console.error(
          logPrefix,
          "Storage upload failed:",
          JSON.stringify({
            spaceId: id,
            filePath,
            fileName: file.name,
            message: uploadErr.message,
          })
        );
        failed.push({ name: file.name, error: errMsg });
        continue;
      }

      const { data: publicUrl } = admin.storage
        .from("space-images")
        .getPublicUrl(filePath);

      const sortOrder = startOrder + inserted.length;
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
        console.error(
          logPrefix,
          "space_images insert failed:",
          JSON.stringify({
            spaceId: id,
            filePath,
            code: insertErr?.code,
            message: insertErr?.message,
            hint: insertErr?.hint,
          })
        );
        await admin.storage.from("space-images").remove([filePath]);
        failed.push({
          name: file.name,
          error: classifySpaceImagesInsertError(
            insertErr?.message || "Unknown database error."
          ),
        });
        continue;
      }

      inserted.push(row as { id: string; image_url: string; sort_order: number });
    }

    console.info(
      logPrefix,
      "Upload complete",
      JSON.stringify({
        spaceId: id,
        uploaded: inserted.length,
        failed: failed.length,
      })
    );

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      logPrefix,
      "Unhandled error:",
      message,
      err instanceof Error ? err.stack : undefined,
      { spaceId }
    );
    return jsonError(`Photo upload failed unexpectedly: ${message}`, 500, "unexpected_error");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = "[admin/unclaimed/images]";
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return jsonError("Invalid listing id.", 400, "invalid_listing_id");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
    }

    const admin = createServiceAdminClient();
    if (!admin) {
      return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
    }

    const existing = await fetchAdminUnclaimedSpace(admin, id);
    if (existing.error) {
      return jsonError(existing.error, 404, "listing_not_found");
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
      .from("space_images")
      .select("id, file_path, space_id")
      .eq("id", imageId)
      .eq("space_id", id)
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
          spaceId: id,
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
      .from("space_images")
      .delete()
      .eq("id", imageId);

    if (delErr) {
      console.error(logPrefix, "space_images delete failed:", delErr.message, {
        spaceId: id,
        imageId,
      });
      return jsonError(
        classifySpaceImagesInsertError(delErr.message),
        500,
        "space_images_delete_denied"
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(logPrefix, "DELETE unhandled error:", message);
    return jsonError(`Could not remove image: ${message}`, 500, "unexpected_error");
  }
}
