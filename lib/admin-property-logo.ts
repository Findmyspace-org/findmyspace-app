import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
import type { AdminUploadFile } from "@/lib/admin-space-image-upload";

export const PROPERTY_LOGO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const PROPERTY_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg", "webp"]);

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export const PROPERTY_LOGO_TYPE_HINT = "PNG, JPG, SVG, or WebP";

function normalizeMimeType(type: string | undefined | null): string {
  return (type || "").toLowerCase().split(";")[0].trim();
}

function fileExtension(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return (parts.pop() || "").toLowerCase();
}

export function validatePropertyLogoFile(
  file: AdminUploadFile
): { ok: true; ext: string; contentType: string } | { ok: false; error: string } {
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

  const mime = normalizeMimeType(file.type);
  const ext = fileExtension(file.name);

  if (mime && PROPERTY_LOGO_ALLOWED_TYPES.has(mime)) {
    const resolvedExt = MIME_TO_EXTENSION[mime] || (ext && PROPERTY_LOGO_EXTENSIONS.has(ext) ? ext : "jpg");
    return { ok: true, ext: resolvedExt, contentType: mime };
  }

  if (ext && PROPERTY_LOGO_EXTENSIONS.has(ext)) {
    return {
      ok: true,
      ext: ext === "jpeg" ? "jpg" : ext,
      contentType: EXTENSION_TO_MIME[ext],
    };
  }

  const detected = [mime, ext].filter(Boolean).join(" / ") || "unknown";
  if (process.env.NODE_ENV === "development") {
    console.warn("[property-logo] rejected upload:", {
      name: file.name,
      mime,
      ext,
    });
  }

  return {
    ok: false,
    error: `Invalid file type (${detected}). Use ${PROPERTY_LOGO_TYPE_HINT}.`,
  };
}
