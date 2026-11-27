/** Production FindMySpace project. A non-production runtime must not use it. */
export const PRODUCTION_SUPABASE_PROJECT_REF = "ppdaubmxrmzgmxdnyxff";

export function isProductionSupabaseUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF));
}

/**
 * True when this process is not the production deployment and its Supabase URL
 * is the production project. Production itself is allowed to use that project.
 */
export function supabaseTargetIsBlocked(input: {
  supabaseUrl: string | null | undefined;
  vercelEnv: string | null | undefined;
}): boolean {
  if (!isProductionSupabaseUrl(input.supabaseUrl)) return false;
  return (input.vercelEnv || "") !== "production";
}

export function serverSupabaseTargetBlocked(): boolean {
  return supabaseTargetIsBlocked({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

export const PRODUCTION_DATABASE_BLOCKED_MESSAGE =
  "This environment is pointed at the production database. The connection was refused.";
