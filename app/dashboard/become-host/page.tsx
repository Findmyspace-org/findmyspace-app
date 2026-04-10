"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";

type ProfileRow = {
  id: string;
  is_host: boolean | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

export default function BecomeHostPage() {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
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
    } = await supabase.auth.getUser();

    if (!user) {
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

  async function handleStartHostSetup() {
    setStarting(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setStarting(false);
      return;
    }

    const { error } = await (supabase.from("profiles") as any)
      .update({
        is_host: true,
        owner_verification_status: "pending",
        bank_verification_status: "pending",
      })
      .eq("id", user.id);

    if (error) {
      setMessage(error.message);
      setStarting(false);
      return;
    }

    setMessage("Host setup started. Continue with verification.");
    setStarting(false);
    window.location.href = "/dashboard/verification?step=identity";
  }

  const alreadyHost = profile?.is_host === true;

  return (
    <RequireAuth>
      <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-md border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-2 text-4xl font-bold">Become a host "a spacer"</h1>
            <p className="mb-8 text-gray-600">
              Complete your host setup so you can list spaces and receive booking requests.
            </p>

            {message && (
              <div className="mb-6 rounded-md bg-gray-100 p-4 text-sm text-gray-800">
                {message}
              </div>
            )}

            {loading ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
                Loading host setup...
              </div>
            ) : (
              <>
                <div className="mb-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-5">
                    <h2 className="mb-2 text-lg font-semibold">1. Identity</h2>
                    <p className="text-sm text-gray-600">
                      Upload your ID document front and back for verification.
                    </p>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50 p-5">
                    <h2 className="mb-2 text-lg font-semibold">2. Bank details</h2>
                    <p className="text-sm text-gray-600">
                      Add your bank details and proof of bank account.
                    </p>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50 p-5">
                    <h2 className="mb-2 text-lg font-semibold">3. Listings</h2>
                    <p className="text-sm text-gray-600">
                      Each listing will also need ownership proof before going live.
                    </p>
                  </div>
                </div>

                <div className="mb-8 rounded-md border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-2xl font-semibold">What happens next</h2>
                  <ul className="space-y-3 text-sm text-gray-700">
                    <li>• Start host setup</li>
                    <li>• Upload your identity and bank verification documents</li>
                    <li>• Admin reviews your host profile</li>
                    <li>• You can then create listings and submit ownership proof per space</li>
                  </ul>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!alreadyHost ? (
                    <button
                      type="button"
                      onClick={handleStartHostSetup}
                      disabled={starting}
                      className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {starting ? "Starting..." : "Start host setup"}
                    </button>
                  ) : (
                    <Link
                      href="/dashboard/verification"
                      className="rounded-md bg-[#192a3a] px-5 py-3 text-sm font-medium text-white"
                    >
                      Continue verification
                    </Link>
                  )}

                  <Link
                    href="/dashboard"
                    className="rounded-md border border-gray-300 px-5 py-3 text-sm"
                  >
                    Back to dashboard
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </RequireAuth>
  );
}