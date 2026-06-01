"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SPACE_PLACE_ACCESS_DENIED_MESSAGE,
  SPACER_INVITE_DISCLAIMER,
} from "@/lib/space-place/access";
import { useSpacePlace } from "../SpacePlaceContext";
import { PrimaryButton } from "./SpacePlaceShell";

export function SpacePlaceAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, error, canBootstrapMainAdmin, refreshProfile } =
    useSpacePlace();
  const pathname = usePathname();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  if (pathname.startsWith("/space-place/join")) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <p className="text-lg text-neutral-600">Loading The Space Place…</p>
      </div>
    );
  }

  if (profile) {
    return <>{children}</>;
  }

  async function enableMainAdmin() {
    setBootstrapping(true);
    setBootstrapError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setBootstrapError("Please sign in again.");
      setBootstrapping(false);
      return;
    }

    const res = await fetch("/api/space-place/bootstrap-admin", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();
    setBootstrapping(false);

    if (!res.ok) {
      setBootstrapError(data.error || "Could not enable access.");
      return;
    }

    await refreshProfile();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[#c1121f]">
        Internal only
      </p>
      <p className="text-xl font-semibold text-neutral-900">The Space Place</p>
      <p className="max-w-md text-base text-neutral-600">
        {error || SPACE_PLACE_ACCESS_DENIED_MESSAGE}
      </p>
      <p className="max-w-md text-sm text-neutral-500">{SPACER_INVITE_DISCLAIMER}</p>

      {canBootstrapMainAdmin ? (
        <div className="w-full max-w-sm space-y-3">
          <p className="text-sm text-neutral-600">
            You are a FindMySpace platform admin. Enable your Main Admin Space
            Place profile to manage Spacers and all spaces.
          </p>
          {bootstrapError ? (
            <p className="text-sm text-red-600">{bootstrapError}</p>
          ) : null}
          <PrimaryButton onClick={enableMainAdmin} disabled={bootstrapping}>
            {bootstrapping ? "Enabling…" : "Enable Main Admin access"}
          </PrimaryButton>
        </div>
      ) : null}

      <Link
        href="/"
        className="mt-2 rounded-full border border-neutral-200 bg-white px-6 py-3 text-base font-semibold text-neutral-800"
      >
        Back to FindMySpace
      </Link>
    </div>
  );
}
