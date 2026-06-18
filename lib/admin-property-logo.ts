import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
import type { AdminUploadFile } from "@/lib/admin-space-image-upload";

export const PROPERTY_LOGO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

const PROPERTY_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg"]);

export function validatePropertyLogoFile(
  file: AdminUploadFile
): { ok: true; ext: string; contentType: string } | { ok: false; error: string } {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!PROPERTY_LOGO_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Invalid file type "${file.name}". Use PNG, JPG, or SVG.`,
    };
  }

  const contentType =
    file.type && PROPERTY_LOGO_ALLOWED_TYPES.has(file.type)
      ? file.type
      : ext === "png"
        ? "image/png"
        : ext === "svg"
          ? "image/svg+xml"
          : "image/jpeg";

  if (file.size <= 0) {
    return { ok: false, error: "Logo file is empty." };
  }

  if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
    const mb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `Logo file is too large. Maximum size is ${mb} MB.`,
    };
  }

  return { ok: true, ext, contentType };
}
