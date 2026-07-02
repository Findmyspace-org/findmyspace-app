import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

declare global {
  // eslint-disable-next-line no-var
  var __supabase__: SupabaseClient | undefined;
}

function createBrowserClient(): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

function getSupabaseClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    if (!globalThis.__supabase__) {
      globalThis.__supabase__ = createBrowserClient();
    }
    return globalThis.__supabase__;
  }

  return globalThis.__supabase__ ?? createBrowserClient();
}

/** Shared browser Supabase client — one instance per tab. */
export const supabase = getSupabaseClient();

if (typeof window !== "undefined") {
  globalThis.__supabase__ = supabase;
}
