import type { SupabaseClient } from "@supabase/supabase-js";

/** Private buckets — never use public URLs for verification documents. */
export const OWNER_VERIFICATION_BUCKET = "owner-verification";
export const BANK_PROOFS_BUCKET = "bank-proofs";
export const LISTING_OWNERSHIP_BUCKET = "listing-ownership";

/** Signed URL lifetime for in-app previews (seconds). */
export const VERIFICATION_SIGNED_URL_TTL_SEC = 60 * 60;

export type VerificationStorageBucket =
  | typeof OWNER_VERIFICATION_BUCKET
  | typeof BANK_PROOFS_BUCKET
  | typeof LISTING_OWNERSHIP_BUCKET;

/**
 * Create a short-lived signed URL for a private storage object.
 * Prefer `file_path` from the database — stored `file_url` values expire.
 */
function resolveVerificationStoragePath(
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

export async function createVerificationSignedUrl(
  client: SupabaseClient,
  bucket: VerificationStorageBucket,
  filePath: string | null | undefined,
  fileUrl?: string | null
): Promise<string | null> {
  const path = resolveVerificationStoragePath(filePath, fileUrl);
  if (!path) return null;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, VERIFICATION_SIGNED_URL_TTL_SEC);

  if (error) {
    console.error("[verification-storage] signed URL failed", {
      bucket,
      filePath: path,
      message: error.message,
    });
    return null;
  }

  return data?.signedUrl ?? null;
}
