"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import SpaceForm from "@/app/components/SpaceForm";
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

export default function NewSpacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
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

  if (!profile?.is_host) {
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
                  href="/dashboard"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[#d7dde3] bg-white px-5 py-3 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc]"
                >
                  Back to dashboard
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
                Create a trusted listing for storage, parking, workspaces and more.
              </p>
            </div>
          </div>
        </section>

        <section className="relative z-20 mx-auto -mt-14 max-w-6xl px-4 sm:-mt-16 sm:px-6">
          <div className="space-y-5">
            <div className="rounded-3xl border border-sky-200/90 bg-sky-50/90 px-5 py-4 text-sm leading-relaxed text-sky-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
              {LISTING_GOES_LIVE_AFTER_APPROVALS}
            </div>

            {(profile.owner_verification_status !== "verified" ||
              profile.bank_verification_status !== "verified") && (
              <div className="rounded-3xl border border-amber-200/90 bg-amber-50/90 px-5 py-4 text-sm leading-relaxed text-amber-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                {HOST_VERIFICATION_IN_PROGRESS_NOTE}
              </div>
            )}

            {message ? (
              <div className="rounded-3xl border border-[#e5e7eb] bg-white px-5 py-4 text-sm text-[#334155] shadow-sm">
                {message}
              </div>
            ) : null}

            <SpaceForm
              onCreated={async () => {
                router.push("/dashboard/listings?created=pending");
                router.refresh();
              }}
            />
          </div>
        </section>
      </main>
    </RequireAuth>
  );
}