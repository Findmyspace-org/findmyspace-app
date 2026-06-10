"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminPropertyInvitePanel } from "@/app/components/AdminPropertyInvitePanel";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { adminListingStatusBadgeClass } from "@/lib/admin-listing-status-display";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import { AdminPropertyForm } from "@/app/components/AdminPropertyForm";

type PropertyDetail = {
  id: string;
  name: string;
  description: string | null;
  formatted_address: string;
  address_line1: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  owner_email: string | null;
  owner_id: string | null;
  owner_status: string;
  owner_invited_at: string | null;
  owner_accepted_at: string | null;
  crm_organisation_id: string | null;
  crm_organisation: { id: string; name: string } | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  status: string | null;
  status_label: string;
  space_type: string | null;
  admin_edit_url: string;
};

export default function AdminPropertyDetailPage() {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}`);
      setProperty(result.property as PropertyDetail);
      setSpaces((result.spaces as SpaceRow[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load property.");
      setProperty(null);
      setSpaces([]);
    }
    setLoading(false);
  }, [propertyId]);

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
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (r === "admin") {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

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

  if (!property) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Property not found."}</p>
      </main>
    );
  }

  const hasOwner = Boolean(property.owner_id);

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <AdminNav current="properties" />

        <AdminPropertySpaceBreadcrumb
          propertyId={propertyId}
          propertyName={property.name}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{property.name}</h1>
            {property.formatted_address ? (
              <p className="mt-1 text-sm text-gray-600">{property.formatted_address}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                Edit property
              </button>
            ) : null}
            <Link
              href={`/admin/properties/${propertyId}/spaces/new`}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Add space
            </Link>
          </div>
        </div>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {editing ? (
          <div className="mt-6">
            <AdminPropertyForm
              mode="edit"
              propertyId={propertyId}
              initial={{
                name: property.name,
                description: property.description || "",
                ownerEmail: property.owner_email || "",
                crmOrganisationId:
                  property.crm_organisation?.id ?? property.crm_organisation_id,
                crmOrganisationName: property.crm_organisation?.name ?? null,
                location: {
                  streetAddress: property.address_line1 || "",
                  suburb: property.suburb || "",
                  city: property.city || "",
                  province: property.province || "",
                  postalCode: property.postal_code || "",
                  country: property.country || "South Africa",
                  latitude: property.latitude,
                  longitude: property.longitude,
                },
              }}
              onSuccess={async () => {
                setEditing(false);
                await load();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Property details
              </h2>
              {property.description ? (
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {property.description}
                </p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">No description.</p>
              )}

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Owner status</dt>
                  <dd className="font-medium text-gray-900">{property.owner_status}</dd>
                </div>
                {property.owner_email ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Owner email</dt>
                    <dd className="text-gray-900">{property.owner_email}</dd>
                  </div>
                ) : null}
                {property.crm_organisation ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">CRM organisation</dt>
                    <dd>
                      <Link
                        href={`/space-place/organisations/${property.crm_organisation.id}`}
                        className="inline-flex items-center gap-1 font-medium text-[#0f2740] hover:underline"
                      >
                        {property.crm_organisation.name}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <AdminPropertyInvitePanel
            propertyId={propertyId}
            propertyName={property.name}
            ownerEmailDefault={property.owner_email}
            hasOwner={hasOwner}
          />
          </div>
        )}

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Spaces</h2>
            <span className="text-sm text-gray-500">{spaces.length} total</span>
          </div>

          {spaces.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">
              No spaces yet.{" "}
              <Link
                href={`/admin/properties/${propertyId}/spaces/new`}
                className="font-semibold text-[#0f2740] hover:underline"
              >
                Add the first space
              </Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {spaces.map((space) => (
                <li
                  key={space.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <Link
                      href={space.admin_edit_url}
                      className="font-medium text-[#0f2740] hover:underline"
                    >
                      {space.title?.trim() || "Untitled space"}
                    </Link>
                    {space.space_type ? (
                      <p className="text-xs text-gray-500">
                        {formatSpaceTypeLabel(space.space_type)}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${adminListingStatusBadgeClass(space.status)}`}
                  >
                    {space.status_label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
