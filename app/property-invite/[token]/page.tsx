"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sanitizeNextPath } from "@/lib/auth-redirect";

type PropertyInvitePreview = {
  valid: boolean;
  error?: string;
  status?: string;
  property?: {
    id: string;
    name: string;
    description: string | null;
    space_count: number;
    spaces: { id: string; title: string }[];
  };
  expires_at?: string;
  owner_email?: string;
};

function PropertyInviteContent() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [preview, setPreview] = useState<PropertyInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const returnPath = sanitizeNextPath(
    `/property-invite/${encodeURIComponent(token)}`,
    `/property-invite/${token}`
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
      `/api/property-invites/validate?token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as PropertyInvitePreview;
    setPreview(data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadPreview();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
  }, [loadPreview]);

  async function acceptInvite() {
    if (!token) return;
    setAccepting(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setMessage("Please sign in to accept this invitation.");
      setAccepting(false);
      return;
    }

    const res = await fetch("/api/property-invites/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
    const json = await res.json().catch(() => ({}));
    setAccepting(false);

    if (!res.ok) {
      setMessage(json.error || "Could not accept invitation.");
      return;
    }

    router.replace(json.redirectTo || `/dashboard/properties/${json.propertyId}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#0f2740]" />
      </main>
    );
  }

  if (!preview?.valid || !preview.property) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            {preview?.error || "This invitation link is not valid."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-semibold text-[#0f2740] hover:underline"
          >
            Go to FindMySpace
          </Link>
        </div>
      </main>
    );
  }

  const { property } = preview;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f2740]/10 text-[#0f2740]">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Property invitation
            </p>
            <h1 className="text-xl font-semibold text-gray-900">{property.name}</h1>
          </div>
        </div>

        {property.description ? (
          <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">
            {property.description}
          </p>
        ) : null}

        <p className="mt-4 text-sm text-gray-600">
          This invitation includes{" "}
          <strong>
            {property.space_count === 1
              ? "1 space"
              : `${property.space_count} spaces`}
          </strong>
          . Accepting grants you ownership of all spaces under this property.
        </p>

        {property.spaces.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-800">
            {property.spaces.map((space) => (
              <li key={space.id}>• {space.title}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-amber-800">
            No spaces have been added to this property yet. You can still accept and
            add listings later.
          </p>
        )}

        {!userId ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-gray-600">
              Sign in or create an account to accept this invitation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={loginUrl}
                className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
              <Link
                href={signupUrl}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              disabled={accepting}
              onClick={() => void acceptInvite()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Accept invitation
            </button>
          </div>
        )}

        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}

        {preview.expires_at ? (
          <p className="mt-4 text-xs text-gray-500">
            This link expires on{" "}
            {new Date(preview.expires_at).toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}
            .
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function PropertyInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[#0f2740]" />
        </main>
      }
    >
      <PropertyInviteContent />
    </Suspense>
  );
}
