import type { SupabaseClient } from "@supabase/supabase-js";

/** Private bucket for renter booking requirement documents. */
export const BOOKING_REQUIREMENT_FILES_BUCKET = "booking-requirement-files";

/** Legacy Phase 1 uploads used public space-images URLs — kept for read fallback only. */
export const LEGACY_BOOKING_REQUIREMENT_BUCKET = "space-images";

export const BOOKING_REQUIREMENT_SIGNED_URL_TTL_SEC = 60 * 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function buildBookingRequirementFilePath(
  renterId: string,
  bookingId: string,
  fieldId: string,
  fileName: string
): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
  return `${renterId}/${bookingId}/${fieldId}-${Date.now()}.${ext}`;
}

export function validateBookingRequirementUploadFile(
  file: { size: number; type: string; name: string }
): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }
  const type = file.type || "";
  if (!ALLOWED_TYPES.has(type)) {
    return {
      ok: false,
      error: "Upload a PDF, Word document, or image (JPG, PNG, WebP).",
    };
  }
  return { ok: true };
}

export async function uploadBookingRequirementFile(
  admin: SupabaseClient,
  path: string,
  file: Buffer,
  contentType: string
): Promise<void> {
  const { error } = await admin.storage.from(BOOKING_REQUIREMENT_FILES_BUCKET).upload(path, file, {
    contentType: contentType || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
}

function resolvePrivateStoragePath(
  filePath: string | null | undefined,
  fileUrl: string | null | undefined
): string | null {
  const path = filePath?.trim();
  if (path) return path;

  const legacy = fileUrl?.trim();
  if (!legacy) return null;
  if (legacy.startsWith("http://") || legacy.startsWith("https://")) {
    return null;
  }
  return legacy;
}

/**
 * Signed URL for private bucket files. Legacy public `space-images` http URLs are returned as-is.
 */
export async function resolveBookingRequirementFileUrl(
  admin: SupabaseClient,
  filePath: string | null | undefined,
  fileUrl: string | null | undefined
): Promise<string | null> {
  const legacyUrl = fileUrl?.trim();
  if (legacyUrl?.startsWith("http://") || legacyUrl?.startsWith("https://")) {
    return legacyUrl;
  }

  const path = resolvePrivateStoragePath(filePath, fileUrl);
  if (!path) return null;

  const { data, error } = await admin.storage
    .from(BOOKING_REQUIREMENT_FILES_BUCKET)
    .createSignedUrl(path, BOOKING_REQUIREMENT_SIGNED_URL_TTL_SEC);

  if (error) {
    console.error("[booking-requirement-storage] signed URL failed", {
      path,
      message: error.message,
    });
    return null;
  }

  return data?.signedUrl ?? null;
}
