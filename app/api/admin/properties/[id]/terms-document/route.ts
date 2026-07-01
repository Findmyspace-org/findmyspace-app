import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import {
  classifyStorageUploadError,
  missingServiceRoleMessage,
  normalizeFormUpload,
  type AdminUploadFile,
} from "@/lib/admin-space-image-upload";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, code: code ?? "terms_document_failed" }, { status });
}

function validateTermsFile(
  file: AdminUploadFile
): { ok: true; ext: string } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }
  const type = file.type || "";
  if (!ALLOWED_TYPES.has(type)) {
    return { ok: false, error: "Upload a PDF or image (JPG, PNG, WebP)." };
  }
  const ext =
    type === "application/pdf"
      ? "pdf"
      : type === "image/png"
        ? "png"
        : type === "image/webp"
          ? "webp"
          : "jpg";
  return { ok: true, ext };
}

async function removeStoredDocument(
  admin: NonNullable<ReturnType<typeof createServiceAdminClient>>,
  filePath: string | null | undefined
) {
  if (!filePath?.trim()) return;
  await admin.storage.from("space-images").remove([filePath]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { data: property, error: fetchErr } = await admin
    .from("properties")
    .select("id, terms_document_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !property) {
    return jsonError("Property not found.", 404, "property_not_found");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (formErr) {
    const msg =
      formErr instanceof Error ? formErr.message : "Could not read upload payload.";
    return jsonError(`Could not read uploaded file: ${msg}`, 400, "invalid_form_data");
  }

  const fileEntry = form.get("file") ?? form.get("files");
  const file = normalizeFormUpload(fileEntry as FormDataEntryValue, 0);
  if (!file) {
    return jsonError("No file provided.", 400, "no_file");
  }

  const validation = validateTermsFile(file);
  if (!validation.ok) {
    return jsonError(validation.error, 400, "invalid_file");
  }

  const filePath = `properties/${id}/terms-${Date.now()}.${validation.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage.from("space-images").upload(filePath, buffer, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadErr) {
    return jsonError(classifyStorageUploadError(uploadErr.message), 500, "storage_upload_failed");
  }

  const { data: pub } = admin.storage.from("space-images").getPublicUrl(filePath);
  const oldPath = (property as { terms_document_path?: string | null }).terms_document_path;

  const { data: updated, error: updateErr } = await admin
    .from("properties")
    .update({
      terms_document_url: pub.publicUrl,
      terms_document_path: filePath,
    })
    .eq("id", id)
    .select(
      "id, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
    )
    .maybeSingle();

  if (updateErr || !updated) {
    await admin.storage.from("space-images").remove([filePath]);
    return jsonError(updateErr?.message || "Could not save terms document.", 500);
  }

  await removeStoredDocument(admin, oldPath);

  await adminAudit({
    action: "property_terms_document_uploaded",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: id,
  });

  return NextResponse.json({ property: updated, terms_document_url: pub.publicUrl });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { data: property, error: fetchErr } = await admin
    .from("properties")
    .select("id, terms_document_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !property) {
    return jsonError("Property not found.", 404, "property_not_found");
  }

  const oldPath = (property as { terms_document_path?: string | null }).terms_document_path;
  await removeStoredDocument(admin, oldPath);

  const { data: updated, error: updateErr } = await admin
    .from("properties")
    .update({
      terms_document_url: null,
      terms_document_path: null,
    })
    .eq("id", id)
    .select(
      "id, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    return jsonError(updateErr.message, 500);
  }

  return NextResponse.json({ property: updated });
}
