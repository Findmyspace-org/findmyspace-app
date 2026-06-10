"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminLocationSection } from "@/app/components/AdminLocationSection";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

function NewPropertyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crmOrgId = searchParams.get("crm_org_id") || "";
  const crmOrgName = searchParams.get("crm_org_name") || "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState(searchParams.get("name") || "");
  const [description, setDescription] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [crmOrganisationId, setCrmOrganisationId] = useState(crmOrgId);
  const [location, setLocation] = useState({
    streetAddress: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    country: "South Africa",
    latitude: null as number | null,
    longitude: null as number | null,
  });

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole((profile as { role?: string } | null)?.role ?? null);
      setLoading(false);
    }
    void init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await adminApiFetch("/api/admin/properties", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          owner_email: ownerEmail || null,
          crm_organisation_id: crmOrganisationId || null,
          address_line1: location.streetAddress || null,
          suburb: location.suburb || null,
          city: location.city || null,
          province: location.province || null,
          postal_code: location.postalCode || null,
          country: location.country || null,
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
      const id = (result.property as { id: string }).id;
      router.replace(`/admin/properties/${id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create property.");
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (role !== "admin") {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <AdminNav current="properties" />

        <Link
          href="/admin/properties"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to properties
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900">New property</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create a venue profile, then add spaces and invite the owner.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Property name *
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. Paarl Boys High"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={FIELD_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Owner email (optional)
              </span>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className={FIELD_CLASS}
                placeholder="owner@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                CRM organisation ID
              </span>
              <input
                value={crmOrganisationId}
                onChange={(e) => setCrmOrganisationId(e.target.value)}
                className={FIELD_CLASS}
                placeholder="UUID"
              />
              {crmOrgName ? (
                <p className="mt-1 text-xs text-gray-500">Linked from: {crmOrgName}</p>
              ) : null}
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Address</h2>
            <div className="mt-4">
              <AdminLocationSection
                value={location}
                onChange={(patch) => setLocation((prev) => ({ ...prev, ...patch }))}
              />
            </div>
          </div>

          {message ? <p className="text-sm text-red-600">{message}</p> : null}

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create property
          </button>
        </form>
      </div>
    </main>
  );
}

export default function NewPropertyPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <NewPropertyContent />
    </Suspense>
  );
}
