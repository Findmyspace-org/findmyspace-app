/** Client-side resize/compress for listing and property image uploads. */

export const LISTING_IMAGE_COMPRESSION = {
  maxWidth: 1600,
  maxHeight: 1200,
  quality: 0.82,
} as const;

export const LOGO_IMAGE_COMPRESSION = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.85,
} as const;

/** Reject sources larger than this before decoding (browser memory safety). */
export const SOURCE_IMAGE_MAX_BYTES = 30 * 1024 * 1024;

export type ImageCompressionPreset = "listing" | "logo";

export type ImageCompressionOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  mimeType?: "image/webp" | "image/jpeg";
};

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

let webpSupported: boolean | null = null;

function resolvePreset(
  preset: ImageCompressionPreset | Partial<ImageCompressionOptions>
): ImageCompressionOptions {
  if (preset === "listing" || preset === "logo") {
    const base =
      preset === "logo" ? LOGO_IMAGE_COMPRESSION : LISTING_IMAGE_COMPRESSION;
    return { ...base };
  }
  return {
    ...LISTING_IMAGE_COMPRESSION,
    ...preset,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function detectWebpSupport(): Promise<boolean> {
  if (!isBrowser()) return false;
  if (webpSupported !== null) return webpSupported;

  webpSupported = await new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.toBlob(
      (blob) => resolve(blob?.type === "image/webp"),
      "image/webp",
      0.8
    );
  });

  return webpSupported ?? false;
}

export function isCompressibleImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (!type.startsWith("image/")) return false;
  if (type === "image/svg+xml" || type === "image/gif") return false;

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "svg" || ext === "gif") return false;

  if (type && COMPRESSIBLE_TYPES.has(type)) return true;
  return ["jpg", "jpeg", "png", "webp"].includes(ext);
}

function scaleToFit(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function buildCompressedFilename(originalName: string, mimeType: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  return `${base}.${ext}`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image "${file.name}".`));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Resize (never upscale) and re-encode a raster image file.
 * Returns the original file when compression is skipped or fails.
 */
export async function compressImageFile(
  file: File,
  preset: ImageCompressionPreset | Partial<ImageCompressionOptions> = "listing"
): Promise<File> {
  if (!isBrowser() || !isCompressibleImageFile(file)) {
    return file;
  }

  if (file.size > SOURCE_IMAGE_MAX_BYTES) {
    throw new Error(
      `"${file.name}" is too large to process (${Math.ceil(file.size / (1024 * 1024))} MB). Try a smaller photo.`
    );
  }

  const options = resolvePreset(preset);
  const outputMime =
    options.mimeType ||
    ((await detectWebpSupport()) ? "image/webp" : "image/jpeg");

  try {
    const img = await loadImageElement(file);
    const { width, height } = scaleToFit(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      options.maxWidth,
      options.maxHeight
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, outputMime, options.quality);
    if (!blob || blob.size <= 0) return file;

    // If re-encoding did not help and dimensions unchanged, keep original.
    if (
      blob.size >= file.size &&
      width === (img.naturalWidth || img.width) &&
      height === (img.naturalHeight || img.height)
    ) {
      return file;
    }

    return new File([blob], buildCompressedFilename(file.name, outputMime), {
      type: outputMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/** Compress image files; pass through non-images unchanged. */
export async function prepareFilesForUpload(
  files: File[],
  preset: ImageCompressionPreset | Partial<ImageCompressionOptions> = "listing"
): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) {
    if (!isCompressibleImageFile(file)) {
      prepared.push(file);
      continue;
    }
    prepared.push(await compressImageFile(file, preset));
  }
  return prepared;
}
