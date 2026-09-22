"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import SpaceForm from "@/app/components/SpaceForm";
import { fetchManageableOrganisations } from "@/lib/access/organisation-access-client";
import {
  canOpenOrganisationListingContext,
  organisationListingDeniedHref,
} from "@/lib/list-space-chooser";
import {
  HOST_VERIFICATION_IN_PROGRESS_NOTE,
  LISTING_GOES_LIVE_AFTER_APPROVALS,
} from "@/lib/host-onboarding-copy";

const HOST_LISTING_HERO_IMAGE = "/images/findmyspace-hero.jpg";

type ProfileRow = {
  id: string;
  is_host: boolean | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

function NewSpacePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOrganisationId = searchParams.get("organisation")?.trim() || null;
  const requestedPropertyId = searchParams.get("property")?.trim() || null;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [authorizedOrganisationId, setAuthorizedOrganisationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    void load();
  }, [requestedOrganisationId]);

  async function load() {
    setLoading(true);
    setMessage("");
    setAuthorizedOrganisationId(null);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    if (requestedOrganisationId) {
      try {
        const result = await fetchManageableOrganisations();
        const allowedOrganisationIds = (result.organisations || []).map(
          (organisation) => organisation.id
        );
        if (
          !canOpenOrganisationListingContext({
            requestedOrganisationId,
            allowedOrganisationIds,
          })
        ) {
          router.replace(organisationListingDeniedHref());
          return;
        }
        setAuthorizedOrganisationId(requestedOrganisationId);
        setLoading(false);
        return;
      } catch {
        router.replace(organisationListingDeniedHref());
        return;
      }
    }

    const { data, error } = await (supabase.from("profiles") as any)
      .select("id, is_host, owner_verification_status, bank_verification_status")
      .eq("id", user.id)
      .single();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setProfile(data as ProfileRow);
    setLoading(false);
  }

  if (loading) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-[#f8fafc] pb-12 text-[#192a3a]">
          <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
            <div className="rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-[0_28px_65px_rgba(15,23,42,0.08)]">
              <p className="text-sm text-[#64748b]">Loading your host profile...</p>
            </div>
          </div>
        </main>
      </RequireAuth>
    );
  }

  const organisationId =
    requestedOrganisationId &&
    authorizedOrganisationId === requestedOrganisationId
      ? authorizedOrganisationId
      : null;

  if (requestedOrganisationId && !organisationId) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-[#f8fafc] pb-12 text-[#192a3a]">
          <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
            <div className="rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-[0_28px_65px_rgba(15,23,42,0.08)]">
              <p className="text-sm text-[#64748b]">Checking listing access...</p>
            </div>
          </div>
        </main>
      </RequireAuth>
    );
  }

  if (!organisationId && !profile?.is_host) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-[#f8fafc] pb-12 text-[#192a3a]">
          <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
            <div className="rounded-3xl border border-[#e5e7eb] bg-white p-8 shadow-[0_28px_65px_rgba(15,23,42,0.08)]">
              <h1 className="mb-2 text-2xl font-semibold text-[#0f172a] sm:text-3xl">
                Become a host first
              </h1>
              <p className="mb-6 text-sm leading-relaxed text-[#64748b]">
                You need a host profile before you can create a listing.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/verification?step=overview"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#c1121f] px-5 py-3 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition hover:opacity-95"
                >
                  Go to host verification
                </Link>

                <Link
                  href="/dashboard/list-space"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[#d7dde3] bg-white px-5 py-3 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc]"
                >
                  Choose listing context
                </Link>
              </div>
            </div>
          </div>
        </main>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <main className="pb-12 text-[#192a3a]">
        <section className="relative h-[280px] w-full overflow-hidden sm:h-[320px] lg:h-[360px]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${HOST_LISTING_HERO_IMAGE}')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/75 via-white/55 to-white/38" />
          <div className="relative z-10 mx-auto h-full max-w-7xl px-4 sm:px-6">
            <div className="pt-10 sm:pt-12 lg:pt-14">
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
                List the right space
                <br />
                in the <span className="text-[#c1121f]">right place.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#1f2937] sm:text-lg">
                {organisationId
                  ? "This listing will belong to the organisation, not your personal host profile."
                  : "Create a trusted listing for storage, parking, workspaces and more."}
              </p>
            </div>
          </div>
        </section>

        <section className="relative z-20 mx-auto -mt-14 max-w-6xl px-4 sm:-mt-16 sm:px-6">
          <div className="space-y-5">
            <div className="rounded-3xl border border-sky-200/90 bg-sky-50/90 px-5 py-4 text-sm leading-relaxed text-sky-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
              {organisationId
                ? "Organisation listings can be built before verification. Paid bookings stay blocked until the organisation is verified."
                : LISTING_GOES_LIVE_AFTER_APPROVALS}
            </div>

            {!organisationId &&
            profile &&
            (profile.owner_verification_status !== "verified" ||
              profile.bank_verification_status !== "verified") ? (
              <div className="rounded-3xl border border-amber-200/90 bg-amber-50/90 px-5 py-4 text-sm leading-relaxed text-amber-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                {HOST_VERIFICATION_IN_PROGRESS_NOTE}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-3xl border border-[#e5e7eb] bg-white px-5 py-4 text-sm text-[#334155] shadow-sm">
                {message}
              </div>
            ) : null}

            <SpaceForm
              organisationId={organisationId}
              propertyId={organisationId ? requestedPropertyId : null}
              showOrganisationCommercialAction={Boolean(organisationId)}
              onCreated={async () => {
                const listingsHref = organisationId
                  ? `/dashboard/listings?created=pending&organisation=${encodeURIComponent(organisationId)}`
                  : "/dashboard/listings?created=pending";
                router.push(listingsHref);
                router.refresh();
              }}
            />
          </div>
        </section>
      </main>
    </RequireAuth>
  );
}

export default function NewSpacePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f8fafc] px-4 pt-10 text-sm text-[#64748b]">
          Loading listing form...
        </main>
      }
    >
      <NewSpacePageContent />
    </Suspense>
  );
}
