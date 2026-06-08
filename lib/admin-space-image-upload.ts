/** Shared validation + error mapping for admin unclaimed listing photo uploads. */

export const ADMIN_SPACE_IMAGE_MAX_BYTES = 4 * 1024 * 1024; // Vercel request body ~4.5MB

export const ADMIN_SPACE_IMAGE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export type AdminUploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function normalizeFormUpload(
  entry: FormDataEntryValue,
  index: number
): AdminUploadFile | null {
  if (!(entry instanceof Blob)) return null;
  const file = entry as File;
  const name =
    file instanceof File && file.name?.trim()
      ? file.name.trim()
      : `upload-${index}.jpg`;
  return {
    name,
    type: file.type || "",
    size: file.size,
    arrayBuffer: () => file.arrayBuffer(),
  };
}

export function validateAdminUploadFile(
  file: AdminUploadFile
): { ok: true; ext: string; contentType: string } | { ok: false; error: string } {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Invalid file type "${file.name}". Use JPG, PNG, or WebP.`,
    };
  }

  const contentType =
    file.type && ADMIN_SPACE_IMAGE_ALLOWED_TYPES.has(file.type)
      ? file.type
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

  if (file.size <= 0) {
    return { ok: false, error: `File "${file.name}" is empty.` };
  }

  if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
    const mb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `File "${file.name}" is too large. Maximum size is ${mb} MB per image.`,
    };
  }

  return { ok: true, ext, contentType };
}

export function classifyStorageUploadError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("bucket not found") || lower.includes("bucket does not exist")) {
    return 'Storage bucket "space-images" is missing. Create it in Supabase Storage.';
  }
  if (
    lower.includes("permission") ||
    lower.includes("denied") ||
    lower.includes("not authorized") ||
    lower.includes("403")
  ) {
    return `Storage permission denied for space-images bucket: ${message}`;
  }
  if (
    lower.includes("too large") ||
    lower.includes("entity too large") ||
    lower.includes("payload")
  ) {
    return `File too large for storage upload: ${message}`;
  }
  if (lower.includes("invalid") && lower.includes("mime")) {
    return `Invalid file type for storage: ${message}`;
  }
  return `Storage upload failed: ${message}`;
}

export function classifySpaceImagesInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("permission denied")) {
    return `space_images insert permission denied. Apply migration 019 (service_role grants) on the database. Details: ${message}`;
  }
  if (lower.includes("violates") || lower.includes("constraint")) {
    return `Could not save image record: ${message}`;
  }
  return `Could not save image record: ${message}`;
}

export function missingServiceRoleMessage(): string {
  return "Server configuration error. SUPABASE_SERVICE_ROLE_KEY is not set.";
}
