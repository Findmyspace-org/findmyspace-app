import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

// One browser client per tab — avoids navigator.locks contention on auth calls.
if (typeof window !== "undefined") {
  globalThis.__supabase__ = supabase;
}