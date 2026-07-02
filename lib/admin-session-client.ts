import { hasAdminUiAccess } from "@/lib/client-admin-access";
import { isSuperAdminRole } from "@/lib/admin-roles";

export type AdminSessionResult = {
  ok: true;
  userId: string;
  email: string | null;
  role: string;
  adminAccessDisabled: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type AdminSessionError = {
  ok: false;
  kind: "unauthorized" | "forbidden" | "disabled" | "network" | "server";
  message: string;
  status?: number;
};

export type AdminSessionResponse = AdminSessionResult | AdminSessionError;

type CacheEntry = {
  token: string;
  result: AdminSessionResponse;
  expiresAt: number;
};

const CACHE_MS = 30_000;

let inflight: {
  token: string;
  promise: Promise<AdminSessionResponse>;
} | null = null;

let cache: CacheEntry | null = null;

export function invalidateAdminSessionCache(): void {
  cache = null;
  inflight = null;
}

function parseAdminSessionResponse(
  status: number,
  json: Record<string, unknown>
): AdminSessionResponse {
  if (status === 401) {
    return {
      ok: false,
      kind: "unauthorized",
      message: "Unauthorized.",
      status,
    };
  }

  if (status === 403) {
    const message =
      (typeof json.error === "string" && json.error) || "Forbidden.";
    return {
      ok: false,
      kind: message.includes("disabled") ? "disabled" : "forbidden",
      message,
      status,
    };
  }

  if (!json.ok) {
    return {
      ok: false,
      kind: status >= 500 ? "server" : "network",
      message:
        (typeof json.error === "string" && json.error) || "Could not verify admin session.",
      status,
    };
  }

  const role = typeof json.role === "string" ? json.role : "";
  const adminAccessDisabled = Boolean(json.adminAccessDisabled);
  const isAdmin = hasAdminUiAccess(role, adminAccessDisabled);
  const isSuperAdmin = isSuperAdminRole(role) && !adminAccessDisabled;

  return {
    ok: true,
    userId: typeof json.userId === "string" ? json.userId : "",
    email: typeof json.email === "string" ? json.email : null,
    role,
    adminAccessDisabled,
    isAdmin,
    isSuperAdmin,
  };
}

export async function fetchAdminSession(
  accessToken: string,
  options?: { force?: boolean }
): Promise<AdminSessionResponse> {
  const now = Date.now();

  if (!options?.force && cache?.token === accessToken && cache.expiresAt > now) {
    return cache.result;
  }

  if (!options?.force && inflight?.token === accessToken) {
    return inflight.promise;
  }

  const promise = (async (): Promise<AdminSessionResponse> => {
    let lastError: AdminSessionError | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch("/api/admin/session", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const result = parseAdminSessionResponse(res.status, json);

        if (!result.ok && result.kind === "network" && attempt === 0) {
          lastError = result;
          await new Promise((resolve) => setTimeout(resolve, 120));
          continue;
        }

        cache = {
          token: accessToken,
          result,
          expiresAt: Date.now() + CACHE_MS,
        };
        return result;
      } catch (error) {
        lastError = {
          ok: false,
          kind: "network",
          message:
            error instanceof Error
              ? error.message
              : "Could not verify admin session.",
        };
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          continue;
        }
      }
    }

    const result =
      lastError ??
      ({
        ok: false,
        kind: "network",
        message: "Could not verify admin session.",
      } satisfies AdminSessionError);

    return result;
  })();

  inflight = { token: accessToken, promise };
  try {
    return await promise;
  } finally {
    if (inflight?.promise === promise) {
      inflight = null;
    }
  }
}
