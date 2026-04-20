import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// TEMPORARY (remove after diagnosing local Supabase): logs only in `next dev`, not production builds.
// NEXT_PUBLIC_* is inlined per bundle; if this disagrees with `.env.local`, restart dev or clear `.next`.
if (process.env.NODE_ENV === "development") {
  console.debug(
    "[supabase env][TEMP] NEXT_PUBLIC_SUPABASE_URL =",
    supabaseUrl ?? "(undefined)",
    "| trimmed length =",
    supabaseUrl?.trim().length ?? 0
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

declare global {
  // eslint-disable-next-line no-var
  var __supabase__: ReturnType<typeof createClient> | undefined;
}

export const supabase =
  globalThis.__supabase__ ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__supabase__ = supabase;
}