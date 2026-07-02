import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import { validatePropertyLogoFile, PROPERTY_LOGO_TYPE_HINT } from "@/lib/admin-property-logo";
import {
  classifyStorageUploadError,
  missingServiceRoleMessage,
  normalizeFormUpload,
} from "@/lib/admin-space-image-upload";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { requireAdminApi } from "@/lib/require-admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, code: code ?? "logo_failed" }, { status });
}

async function removeStoredLogo(
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
    .select("id, logo_file_path")
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
    return jsonError(`No file provided. Upload a ${PROPERTY_LOGO_TYPE_HINT} logo.`, 400, "no_file");
  }

  const validation = validatePropertyLogoFile(file);
  if (!validation.ok) {
    return jsonError(validation.error, 400, "invalid_file");
  }

  const filePath = `properties/${id}/logo-${Date.now()}.${validation.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("space-images")
    .upload(filePath, buffer, {
      contentType: validation.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    return jsonError(classifyStorageUploadError(uploadErr.message), 500, "storage_upload_failed");
  }

  const { data: publicUrl } = admin.storage.from("space-images").getPublicUrl(filePath);
  const logoUrl = publicUrl.publicUrl;

  const previousPath = (property as { logo_file_path: string | null }).logo_file_path;

  const { data: updated, error: updateErr } = await admin
    .from("properties")
    .update({
      logo_url: logoUrl,
      logo_file_path: filePath,
    })
    .eq("id", id)
    .select("logo_url, logo_file_path")
    .maybeSingle();

  if (updateErr || !updated) {
    await admin.storage.from("space-images").remove([filePath]);
    return jsonError(updateErr?.message || "Could not save logo.", 500, "update_failed");
  }

  await removeStoredLogo(admin, previousPath);

  await adminAudit({
    action: "property_logo_updated",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: id,
    meta: { logo_url: logoUrl },
  });

  return NextResponse.json({
    ok: true,
    logo_url: (updated as { logo_url: string }).logo_url,
  });
}

export async function DELETE(
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
    return jsonError(missingServiceRoleMessage(), 500, "missing_service_role");
  }

  const { data: property, error: fetchErr } = await admin
    .from("properties")
    .select("id, logo_file_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !property) {
    return jsonError("Property not found.", 404, "property_not_found");
  }

  const previousPath = (property as { logo_file_path: string | null }).logo_file_path;

  const { error: updateErr } = await admin
    .from("properties")
    .update({
      logo_url: null,
      logo_file_path: null,
    })
    .eq("id", id);

  if (updateErr) {
    return jsonError(updateErr.message, 500, "update_failed");
  }

  await removeStoredLogo(admin, previousPath);

  await adminAudit({
    action: "property_logo_removed",
    actorUserId: auth.userId,
    targetType: "property",
    targetId: id,
  });

  return NextResponse.json({ ok: true, logo_url: null });
}
