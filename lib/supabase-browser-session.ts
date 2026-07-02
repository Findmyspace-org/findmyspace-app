import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

let authChain: Promise<unknown> = Promise.resolve();
let cachedSession: Session | null | undefined;
let cacheExpiresAt = 0;

const SESSION_CACHE_MS = 2_000;

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "AbortError";
}

function runWithAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = authChain.then(operation, operation);
  authChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function readCachedSession(): Session | null | undefined {
  if (Date.now() > cacheExpiresAt) {
    cachedSession = undefined;
    return undefined;
  }
  return cachedSession;
}

/** Invalidate cached session after sign-in/out or token refresh. */
export function invalidateBrowserSessionCache(): void {
  cachedSession = undefined;
  cacheExpiresAt = 0;
}

/**
 * Serialized read of the current browser session.
 * Prevents navigator.locks contention from parallel getSession/getUser calls.
 */
export async function getBrowserSession(): Promise<Session | null> {
  const cached = readCachedSession();
  if (cached !== undefined) {
    return cached;
  }

  return runWithAuthLock(async () => {
    const stillCached = readCachedSession();
    if (stillCached !== undefined) {
      return stillCached;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        cachedSession = session;
        cacheExpiresAt = Date.now() + SESSION_CACHE_MS;
        return session;
      } catch (error) {
        lastError = error;
        if (!isAbortError(error) || attempt === 2) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }

    throw lastError;
  });
}

export async function getBrowserAccessToken(): Promise<string | null> {
  const session = await getBrowserSession();
  return session?.access_token ?? null;
}
