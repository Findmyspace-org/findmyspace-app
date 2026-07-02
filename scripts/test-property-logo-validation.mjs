/**
 * Property logo upload validation tests (mirrors lib/admin-property-logo.ts).
 */
import assert from "node:assert/strict";

const PROPERTY_LOGO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const PROPERTY_LOGO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg", "webp"]);

const EXTENSION_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

const MAX_BYTES = 4 * 1024 * 1024;

function validatePropertyLogoFile(file) {
  if (file.size <= 0) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too large" };

  const mime = (file.type || "").toLowerCase().split(";")[0].trim();
  const parts = file.name.split(".");
  const ext = parts.length < 2 ? "" : (parts.pop() || "").toLowerCase();

  if (mime && PROPERTY_LOGO_ALLOWED_TYPES.has(mime)) {
    const resolvedExt = MIME_TO_EXTENSION[mime] || ext || "jpg";
    return { ok: true, ext: resolvedExt, contentType: mime };
  }

  if (ext && PROPERTY_LOGO_EXTENSIONS.has(ext)) {
    return {
      ok: true,
      ext: ext === "jpeg" ? "jpg" : ext,
      contentType: EXTENSION_TO_MIME[ext],
    };
  }

  return { ok: false, error: "invalid" };
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test("accepts jpeg by mime regardless of whatsapp filename", () => {
  const result = validatePropertyLogoFile({
    name: "WhatsApp Image 2026-06-19 at 09.23.12 (7).jpeg",
    type: "image/jpeg",
    size: 1200,
  });
  assert.equal(result.ok, true);
  assert.equal(result.contentType, "image/jpeg");
});

test("accepts webp after client compression output", () => {
  const result = validatePropertyLogoFile({
    name: "WhatsApp Image 2026-06-19 at 09.23.12 (7).webp",
    type: "image/webp",
    size: 900,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ext, "webp");
});

test("accepts png and svg by extension when mime missing", () => {
  assert.equal(
    validatePropertyLogoFile({ name: "logo.PNG", type: "", size: 100 }).ok,
    true
  );
  assert.equal(
    validatePropertyLogoFile({ name: "mark.svg", type: "", size: 100 }).ok,
    true
  );
});

test("rejects pdf uploads", () => {
  assert.equal(
    validatePropertyLogoFile({ name: "logo.pdf", type: "application/pdf", size: 100 }).ok,
    false
  );
});

console.log("\nAll property logo validation tests passed.");
