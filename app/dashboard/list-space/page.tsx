"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import { fetchManageableOrganisations } from "@/lib/access/organisation-access-client";
import { createOrganisationRequest } from "@/lib/organisation-commercial-client";
import { ORGANISATION_TYPES } from "@/lib/organisation-commercial-dto";
import {
  organisationListingHref,
  personalListingHref,
} from "@/lib/list-space-chooser";
import { supabase } from "@/lib/supabase";

export default function ListSpacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [organisations, setOrganisations] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [organisationType, setOrganisationType] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Please log in first.");
        setLoading(false);
        return;
      }
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("is_host")
        .eq("id", user.id)
        .maybeSingle();
      setIsHost(Boolean((profile as { is_host?: boolean } | null)?.is_host));
      const result = await fetchManageableOrganisations();
      setOrganisations(result.organisations || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load listing options.");
    }
    setLoading(false);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const created = await createOrganisationRequest({
        name,
        organisation_type: organisationType || null,
        registration_number: registrationNumber || null,
      });
      router.push(
        `/dashboard/organisation?organisation=${created.organisation.id}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create organisation.");
      setCreating(false);
    }
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafc] pb-12 text-[#192a3a]">
        <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
          <h1 className="text-3xl font-semibold text-[#0f172a]">List a space</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
            Who are you listing this space for? This choice sets the commercial context. It is not
            inferred from your login.
          </p>

          {message ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {message}
            </p>
          ) : null}

          {loading ? (
            <p className="mt-6 text-sm text-[#64748b]">Loading options...</p>
          ) : (
            <div className="mt-6 space-y-3">
              <Link
                href={personalListingHref(isHost)}
                className="block rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-sm transition hover:border-[#c1121f]"
              >
                <p className="font-semibold text-[#0f172a]">Myself</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  Personal host listing. Identity and personal banking stay on your own profile.
                </p>
              </Link>

              {organisations.map((organisation) => (
                <Link
                  key={organisation.id}
                  href={organisationListingHref(organisation.id)}
                  className="block rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-sm transition hover:border-[#c1121f]"
                >
                  <p className="font-semibold text-[#0f172a]">{organisation.name}</p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    Organisation listing. You will not be asked for personal host verification.
                  </p>
                </Link>
              ))}

              <button
                type="button"
                onClick={() => setShowCreate((open) => !open)}
                className="block w-full rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-5 py-4 text-left shadow-sm transition hover:border-[#c1121f]"
              >
                <p className="font-semibold text-[#0f172a]">Create an organisation</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  Start building immediately. Paid bookings stay blocked until FindMySpace verifies
                  the organisation.
                </p>
              </button>

              {showCreate ? (
                <form
                  onSubmit={handleCreate}
                  className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm"
                >
                  <label className="block text-sm font-medium text-[#334155]">
                    Organisation name
                    <input
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-[#334155]">
                    Type (optional)
                    <select
                      value={organisationType}
                      onChange={(event) => setOrganisationType(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                    >
                      <option value="">Select</option>
                      {ORGANISATION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 block text-sm font-medium text-[#334155]">
                    Registration number (optional)
                    <input
                      value={registrationNumber}
                      onChange={(event) => setRegistrationNumber(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={creating}
                    className="mt-4 min-h-[44px] rounded-xl bg-[#c1121f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create organisation"}
                  </button>
                </form>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
