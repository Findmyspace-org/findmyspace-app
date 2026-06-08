"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sanitizeNextPath } from "@/lib/auth-redirect";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";

type ClaimPreview = {
  valid: boolean;
  error?: string;
  status?: string;
  listing?: {
    id: string;
    title: string | null;
    description: string | null;
    city: string | null;
    suburb: string | null;
    space_type: string | null;
    cover_image_url: string | null;
  };
  expires_at?: string;
};

function ClaimListingContent() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const returnPath = sanitizeNextPath(
    `/claim-listing/${encodeURIComponent(token)}`,
    `/claim-listing/${token}`
  );
  const loginUrl = `/login?next=${encodeURIComponent(returnPath)}`;
  const signupUrl = `/signup?next=${encodeURIComponent(returnPath)}`;

  const loadPreview = useCallback(async () => {
    if (!token) {
      setPreview({ valid: false, error: "Missing claim token." });
      setLoading(false);
      return;
    }
    const res = await fetch(
      `/api/listing-claims/validate?token=${encodeURIComponent(token)}`
    );
    const data = (await res.json()) as ClaimPreview;
    setPreview(data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadPreview();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
  }, [loadPreview]);

  async function claimListing() {
    if (!token) return;
    setClaiming(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setMessage("Please sign in to claim this listing.");
      setClaiming(false);
      return;
    }

    const res = await fetch("/api/listing-claims/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
    const json = await res.json().catch(() => ({}));
    setClaiming(false);

    if (!res.ok) {
      setMessage(json.error || "Could not claim listing.");
      return;
    }

    router.replace(json.redirectTo || `/dashboard/listings/${json.spaceId}/complete`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-6">
        <p className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Validating claim link…
        </p>
      </main>
    );
  }

  if (!preview?.valid || !preview.listing) {
    return (
      <main className="min-h-screen bg-[#f8fafb] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Claim link unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            {preview?.error || "This claim link is invalid, expired, or has already been used."}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-[#0f2740] hover:underline">
            Go to homepage
          </Link>
        </div>
      </main>
    );
  }

  const listing = preview.listing;
  const location = [listing.suburb, listing.city].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#f8fafb] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0f2740]">
            FindMySpace owner claim
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Claim this listing
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            FindMySpace prepared this space profile for you. Claim it to review the
            details and complete verification, pricing, and availability. Claiming does{" "}
            <strong>not</strong> make the listing live or bookable.
          </p>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
            {listing.cover_image_url ? (
              <div className="relative aspect-[16/9] bg-gray-100">
                <Image
                  src={listing.cover_image_url}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null}
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {formatSpaceTypeLabel(listing.space_type)}
                {location ? ` · ${location}` : ""}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {listing.title || "Untitled listing"}
              </h2>
              {listing.description ? (
                <p className="mt-2 line-clamp-4 text-sm text-gray-600">
                  {listing.description}
                </p>
              ) : null}
            </div>
          </div>

          {!userId ? (
            <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-100">
              <p className="font-semibold">Sign in to claim</p>
              <p className="mt-1">
                Create an account or sign in, then return here to claim this listing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={loginUrl}
                  className="inline-flex rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
                >
                  Sign in
                </Link>
                <Link
                  href={signupUrl}
                  className="inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950"
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void claimListing()}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#0f2740] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {claiming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming…
                </>
              ) : (
                "Claim this listing"
              )}
            </button>
          )}

          {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
        </div>
      </div>
    </main>
  );
}

export default function ClaimListingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-6">
          <p className="text-gray-600">Loading…</p>
        </main>
      }
    >
      <ClaimListingContent />
    </Suspense>
  );
}
