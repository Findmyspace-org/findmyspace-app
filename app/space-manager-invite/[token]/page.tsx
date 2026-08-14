"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sanitizeNextPath } from "@/lib/auth-redirect";

type Preview = {
  valid: boolean;
  error?: string;
  email?: string;
  property?: {
    id: string;
    name: string;
    spaces: { id: string; title: string }[];
  };
};

function InviteContent() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const returnPath = sanitizeNextPath(
    `/space-manager-invite/${encodeURIComponent(token)}`,
    `/space-manager-invite/${token}`
  );
  const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;
  const signupUrl = `/signup?next=${encodeURIComponent(returnPath)}`;

  const loadPreview = useCallback(async () => {
    if (!token) {
      setPreview({ valid: false, error: "Missing invite token." });
      setLoading(false);
      return;
    }
    const res = await fetch(
      `/api/space-manager-invites/validate?token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as Preview;
    setPreview(data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void loadPreview();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
  }, [loadPreview]);

  async function accept() {
    setAccepting(true);
    setMessage(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      router.push(loginUrl);
      return;
    }
    const res = await fetch("/api/space-manager-invites/accept", {
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
    router.replace(
      typeof data.redirectTo === "string"
        ? data.redirectTo
        : "/dashboard/properties"
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9fb] px-4 py-12">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <Building2 className="h-8 w-8 text-[#0f2740]" />
        <h1 className="mt-3 text-xl font-semibold text-gray-900">
          Space manager invitation
        </h1>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Checking invite…</p>
        ) : !preview?.valid ? (
          <p className="mt-4 text-sm text-red-700">{preview?.error || "Invalid invite."}</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-700">
              You&apos;ve been invited to manage spaces at{" "}
              <span className="font-semibold">{preview.property?.name}</span>.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {(preview.property?.spaces || []).map((space) => (
                <li key={space.id}>{space.title}</li>
              ))}
            </ul>
            {message ? <p className="mt-3 text-sm text-red-700">{message}</p> : null}
            {userId ? (
              <button
                type="button"
                disabled={accepting}
                onClick={() => void accept()}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Accept invitation
              </button>
            ) : (
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <Link href={loginUrl} className="font-semibold text-[#0f2740] underline">
                  Sign in to accept
                </Link>
                <Link href={signupUrl} className="font-semibold text-[#0f2740] underline">
                  Create an account
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function SpaceManagerInvitePage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-gray-500">Loading…</main>}>
      <InviteContent />
    </Suspense>
  );
}
