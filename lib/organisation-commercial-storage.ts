import type { SupabaseClient } from "@supabase/supabase-js";

export const ORGANISATION_VERIFICATION_BUCKET = "organisation-verification";
export const ORGANISATION_BANK_PROOFS_BUCKET = "organisation-bank-proofs";
export const ORGANISATION_COMMERCIAL_SIGNED_URL_TTL_SEC = 10 * 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateOrganisationCommercialUpload(file: {
  size: number;
  type: string;
  name: string;
}): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }
  if (!ALLOWED_TYPES.has(file.type || "")) {
    return { ok: false, error: "Upload a PDF or image (JPG, PNG, WebP)." };
  }
  return { ok: true };
}

export function organisationEntityDocumentPath(
  organisationId: string,
  documentId: string,
  fileName: string
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
  return `${organisationId}/entity/${documentId}/${Date.now()}.${ext}`;
}

export function organisationBankProofPath(
  organisationId: string,
  bankAccountId: string,
  fileName: string
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
  return `${organisationId}/bank/${bankAccountId}/${Date.now()}.${ext}`;
}

export async function uploadOrganisationCommercialFile(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  file: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(path, file, {
    contentType: contentType || "application/octet-stream",
    cacheControl: "private, max-age=3600",
    upsert: false,
  });
  if (error) throw error;
}

export async function signOrganisationCommercialFile(
  admin: SupabaseClient,
  bucket: string,
  filePath: string | null | undefined
): Promise<string | null> {
  const path = filePath?.trim();
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, ORGANISATION_COMMERCIAL_SIGNED_URL_TTL_SEC);
  if (error) {
    console.error("[organisation-commercial-storage] signed URL failed", {
      bucket,
      message: error.message,
    });
    return null;
  }
  return data?.signedUrl ?? null;
}
