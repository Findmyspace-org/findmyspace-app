import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTION_DATABASE_BLOCKED_MESSAGE } from "@/lib/supabase-target-guard";

const blockedError = { message: PRODUCTION_DATABASE_BLOCKED_MESSAGE, name: "ProductionDatabaseBlocked" };

/**
 * A client that never reaches Supabase. Query methods resolve with an error
 * so a mispointed preview cannot read or write the production project.
 */
export function createBlockedSupabaseClient(): SupabaseClient {
  const promise = Promise.resolve({ data: null, error: blockedError, count: null });
  const query: any = new Proxy(function blockedQuery() {
    return query;
  }, {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => query;
    },
    apply() {
      return query;
    },
  });

  const auth = {
    getSession: async () => ({ data: { session: null }, error: blockedError }),
    getUser: async () => ({ data: { user: null }, error: blockedError }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: blockedError }),
    signUp: async () => ({ data: { user: null, session: null }, error: blockedError }),
    signInWithOAuth: async () => ({ data: { provider: null, url: null }, error: blockedError }),
    resetPasswordForEmail: async () => ({ data: null, error: blockedError }),
    updateUser: async () => ({ data: { user: null }, error: blockedError }),
    exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: blockedError }),
    setSession: async () => ({ data: { session: null, user: null }, error: blockedError }),
  };

  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === "auth") return auth;
      if (prop === "from" || prop === "rpc" || prop === "storage" || prop === "channel") return () => query;
      return query;
    },
  });
}
