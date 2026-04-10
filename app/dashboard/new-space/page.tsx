"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import SpaceForm from "@/app/components/SpaceForm";

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
        <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-md border border-gray-200 bg-white p-8 shadow-sm">
              <p className="text-sm text-gray-600">Loading your host profile...</p>
            </div>
          </div>
        </main>
      </RequireAuth>
    );
  }

  if (!profile?.is_host) {
    return (
      <RequireAuth>
        <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-md border border-gray-200 bg-white p-8 shadow-sm">
              <h1 className="mb-2 text-3xl font-semibold">Become a host first</h1>
              <p className="mb-6 text-sm text-gray-600">
                You need a host profile before you can create a listing.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/verification?step=overview"
                  className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white"
                >
                  Go to host verification
                </Link>

                <Link
                  href="/dashboard"
                  className="rounded-md border border-gray-300 px-5 py-3 text-sm"
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
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            You can create your listing now. It will stay pending until identity,
            bank, and ownership proof are approved.
          </div>

          {(profile.owner_verification_status !== "verified" ||
            profile.bank_verification_status !== "verified") && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
              Your host verification is still in progress. That does not stop you
              from creating a listing, but the listing will only go live after all
              required checks are approved.
            </div>
          )}

          {message && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
              {message}
            </div>
          )}

          <SpaceForm
            onCreated={async () => {
              router.push("/dashboard/listings?created=pending");
              router.refresh();
            }}
          />
        </div>
      </main>
    </RequireAuth>
  );
}