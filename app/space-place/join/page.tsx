"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  SPACER_INVITE_DISCLAIMER,
  SPACER_INVITE_HELPER,
} from "@/lib/space-place/access";
import { PrimaryButton } from "../components/SpacePlaceShell";

type InvitePreview = {
  valid: boolean;
  email?: string;
  full_name?: string;
  error?: string;
};

function JoinPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token")?.trim() || "";

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadInvite = useCallback(async () => {
    if (!token) {
      setInvite({ valid: false, error: "Missing invite token." });
      setLoading(false);
      return;
    }
    const res = await fetch(
      `/api/space-place/spacer-invites/validate?token=${encodeURIComponent(token)}`
    );
    const data = await res.json();
    setInvite(data as InvitePreview);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  async function acceptInvite() {
    if (!token) return;
    setAccepting(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const next = encodeURIComponent(`/space-place/join?token=${token}`);
      router.push(`/login?next=${next}`);
      return;
    }

    const res = await fetch("/api/space-place/spacer-invites/accept", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setAccepting(false);

    if (!res.ok) {
      setMessage(data.error || "Could not accept invite.");
      return;
    }

    router.replace("/space-place/today");
  }

  if (loading) {
    return <p className="text-neutral-600">Checking invite…</p>;
  }

  if (!invite?.valid) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Spacer invite</h1>
        <p className="mt-3 text-red-600">{invite?.error || "Invalid invite."}</p>
        <Link href="/" className="mt-6 inline-block text-[#c1121f] font-semibold">
          Back to FindMySpace
        </Link>
      </div>
    );
  }

  const loginNext = encodeURIComponent(`/space-place/join?token=${token}`);

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs font-medium uppercase tracking-wide text-[#c1121f]">
        The Space Place
      </p>
      <h1 className="mt-2 text-2xl font-bold">You&apos;re invited as a Spacer</h1>
      <p className="mt-2 text-neutral-600">{SPACER_INVITE_HELPER}</p>
      <p className="mt-1 text-sm text-neutral-500">{SPACER_INVITE_DISCLAIMER}</p>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-lg font-semibold">{invite.full_name}</p>
        <p className="text-neutral-600">{invite.email}</p>
      </div>

      {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}

      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={acceptInvite} disabled={accepting}>
          {accepting ? "Setting up…" : "Accept invite & continue"}
        </PrimaryButton>
        <Link
          href={`/login?next=${loginNext}`}
          className="block text-center text-sm font-semibold text-[#c1121f]"
        >
          Sign in with a different account
        </Link>
      </div>
    </div>
  );
}

export default function SpacerJoinPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-600">Loading…</p>}>
      <JoinPageContent />
    </Suspense>
  );
}
