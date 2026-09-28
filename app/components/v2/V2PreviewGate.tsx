"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchAdminSession } from "@/lib/admin-session-client";
import { getBrowserSession } from "@/lib/supabase-browser-session";
import {
  CLASSIC_HOME_HREF,
  parseUiVersion,
  UI_VERSION_QUERY_PARAM,
  V2_PREVIEW_HREF,
} from "@/lib/v2/ui-version";

type V2PreviewIdentity = {
  userId: string;
  email: string | null;
  role: string;
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
};

const V2PreviewContext = createContext<V2PreviewIdentity | null>(null);

export function useV2PreviewIdentity(): V2PreviewIdentity {
  const value = useContext(V2PreviewContext);
  if (!value) {
    throw new Error(
      "useV2PreviewIdentity must be used inside V2PreviewGate"
    );
  }
  return value;
}

export default function V2PreviewGate({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVersion = parseUiVersion(
    searchParams.get(UI_VERSION_QUERY_PARAM)
  );
  const [identity, setIdentity] = useState<V2PreviewIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyPreviewAccess() {
      if (requestedVersion !== "v2") {
        router.replace(CLASSIC_HOME_HREF);
        return;
      }

      try {
        const session = await getBrowserSession();
        if (cancelled) return;

        if (!session?.access_token) {
          router.replace(
            `/login?next=${encodeURIComponent(V2_PREVIEW_HREF)}`
          );
          return;
        }

        const result = await fetchAdminSession(session.access_token, {
          force: true,
        });
        if (cancelled) return;

        if (!result.ok || !result.isSuperAdmin) {
          router.replace(CLASSIC_HOME_HREF);
          return;
        }

        setIdentity({
          userId: result.userId,
          email: result.email,
          role: result.role,
          isPlatformAdmin: result.isAdmin,
          isSuperAdmin: result.isSuperAdmin,
        });
      } catch {
        if (!cancelled) {
          router.replace(CLASSIC_HOME_HREF);
        }
      }
    }

    void verifyPreviewAccess();

    return () => {
      cancelled = true;
    };
  }, [requestedVersion, router]);

  if (!identity) {
    return (
      <div className="fms-v2-root fms-v2-gate" aria-live="polite">
        <p>Checking V2 preview access…</p>
      </div>
    );
  }

  return (
    <V2PreviewContext.Provider value={identity}>
      {children}
    </V2PreviewContext.Provider>
  );
}
