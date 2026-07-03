"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchAdminSession,
  invalidateAdminSessionCache,
  type AdminSessionResponse,
} from "@/lib/admin-session-client";
import {
  getBrowserSession,
  invalidateBrowserSessionCache,
} from "@/lib/supabase-browser-session";

export type AdminRoleState = {
  role: string | null;
  loading: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminAccessDisabled: boolean;
  /** Transient verification failure — not a confirmed non-admin result. */
  sessionError: string | null;
  refresh: () => void;
};

type AdminRoleContextValue = AdminRoleState;

const INITIAL_STATE: AdminRoleContextValue = {
  role: null,
  loading: true,
  signedIn: false,
  userId: null,
  email: null,
  isAdmin: false,
  isSuperAdmin: false,
  adminAccessDisabled: false,
  sessionError: null,
  refresh: () => undefined,
};

const AdminRoleContext = createContext<AdminRoleContextValue | null>(null);

function logAdminAccessDebug(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[admin-access]", payload);
}

function applySessionResult(
  session: Awaited<ReturnType<typeof getBrowserSession>>,
  result: AdminSessionResponse
): Omit<AdminRoleState, "refresh"> {
  const user = session?.user ?? null;

  if (!user) {
    return {
      role: null,
      loading: false,
      signedIn: false,
      userId: null,
      email: null,
      isAdmin: false,
      isSuperAdmin: false,
      adminAccessDisabled: false,
      sessionError: null,
    };
  }

  if (!session?.access_token) {
    return {
      role: null,
      loading: false,
      signedIn: true,
      userId: user.id,
      email: user.email ?? null,
      isAdmin: false,
      isSuperAdmin: false,
      adminAccessDisabled: false,
      sessionError: "Missing access token.",
    };
  }

  if (!result.ok) {
    if (result.kind === "network" || result.kind === "server") {
      return {
        role: null,
        loading: false,
        signedIn: true,
        userId: user.id,
        email: user.email ?? null,
        isAdmin: false,
        isSuperAdmin: false,
        adminAccessDisabled: false,
        sessionError: result.message,
      };
    }

    return {
      role: null,
      loading: false,
      signedIn: true,
      userId: user.id,
      email: user.email ?? null,
      isAdmin: false,
      isSuperAdmin: false,
      adminAccessDisabled: result.kind === "disabled",
      sessionError: null,
    };
  }

  return {
    role: result.role,
    loading: false,
    signedIn: true,
    userId: result.userId || user.id,
    email: result.email ?? user.email ?? null,
    isAdmin: result.isAdmin,
    isSuperAdmin: result.isSuperAdmin,
    adminAccessDisabled: result.adminAccessDisabled,
    sessionError: null,
  };
}

export function AdminRoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AdminRoleState, "refresh">>(INITIAL_STATE);
  const refreshGenerationRef = useRef(0);

  const load = useCallback(async (options?: { force?: boolean; silent?: boolean }) => {
    const force = options?.force ?? false;
    const silent = options?.silent ?? false;
    const generation = ++refreshGenerationRef.current;

    if (!silent) {
      setState((current) => ({
        ...current,
        loading: true,
        sessionError: null,
      }));
    } else {
      setState((current) => ({
        ...current,
        sessionError: null,
      }));
    }

    try {
      if (force) {
        invalidateBrowserSessionCache();
        invalidateAdminSessionCache();
      }

      const session = await getBrowserSession();
      if (generation !== refreshGenerationRef.current) return;

      const user = session?.user ?? null;
      if (!user) {
        logAdminAccessDebug({ check: "session", result: "no_session" });
        setState(applySessionResult(session, {
          ok: false,
          kind: "unauthorized",
          message: "Unauthorized.",
        }));
        return;
      }

      const token = session?.access_token;
      if (!token) {
        logAdminAccessDebug({
          userId: user.id,
          email: user.email,
          check: "session",
          result: "missing_access_token",
        });
        setState(applySessionResult(session, {
          ok: false,
          kind: "unauthorized",
          message: "Unauthorized.",
        }));
        return;
      }

      const result = await fetchAdminSession(token, { force });
      if (generation !== refreshGenerationRef.current) return;

      logAdminAccessDebug({
        userId: user.id,
        email: user.email,
        role: result.ok ? result.role : null,
        check: "api/admin/session",
        result: result.ok ? "allowed" : result.kind,
        error: result.ok ? undefined : result.message,
      });

      setState(applySessionResult(session, result));
    } catch (error) {
      if (generation !== refreshGenerationRef.current) return;

      logAdminAccessDebug({
        check: "admin-role-load",
        result: "failed",
        error: error instanceof Error ? error.message : String(error),
      });

      if (silent) {
        return;
      }

      setState((current) => ({
        ...current,
        loading: false,
        sessionError:
          error instanceof Error
            ? error.message
            : "Could not verify admin session.",
      }));
    }
  }, []);

  const refresh = useCallback(() => {
    void load({ force: true, silent: false });
  }, [load]);

  useEffect(() => {
    void load({ force: false, silent: false });

    let authTimer: ReturnType<typeof setTimeout> | null = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        invalidateBrowserSessionCache();
        return;
      }

      if (event === "INITIAL_SESSION") {
        return;
      }

      const silent = event === "USER_UPDATED";

      invalidateBrowserSessionCache();
      invalidateAdminSessionCache();
      if (authTimer) clearTimeout(authTimer);
      authTimer = setTimeout(() => {
        void load({ force: true, silent });
      }, 80);
    });

    return () => {
      if (authTimer) clearTimeout(authTimer);
      subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<AdminRoleContextValue>(
    () => ({
      ...state,
      refresh,
    }),
    [refresh, state]
  );

  return (
    <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>
  );
}

export function useAdminRole(): AdminRoleState {
  const context = useContext(AdminRoleContext);
  if (!context) {
    throw new Error("useAdminRole must be used within AdminRoleProvider");
  }
  return context;
}
