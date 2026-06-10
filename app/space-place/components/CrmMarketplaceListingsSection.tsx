"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SectionHeading } from "./SpacePlaceShell";

type MarketplaceListing = {
  id: string;
  title: string | null;
  status: string | null;
  status_label: string;
  city: string | null;
  suburb: string | null;
  admin_edit_url: string;
  public_url: string | null;
  linked_via?: string;
};

type CrmProperty = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
  owner_status: string;
  admin_url: string;
};

type Props = {
  mode: "organisation" | "contact";
  entityId: string;
  organisationName?: string;
  /** Required for contact mode — used for create/link listing URLs. */
  organisationId?: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function CrmMarketplaceListingsSection({
  mode,
  entityId,
  organisationName,
  organisationId,
}: Props) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [properties, setProperties] = useState<CrmProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setMessage("Please sign in again.");
        setListings([]);
        return;
      }
      const path =
        mode === "organisation"
          ? `/api/space-place/crm/organisations/${entityId}/listings`
          : `/api/space-place/crm/contacts/${entityId}/listings`;
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        listings?: MarketplaceListing[];
        properties?: CrmProperty[];
        error?: string;
      };
      if (!res.ok) {
        setMessage(json.error || "Could not load marketplace listings.");
        setListings([]);
        setProperties([]);
        return;
      }
      setListings(json.listings || []);
      setProperties(mode === "organisation" ? json.properties || [] : []);
    } catch {
      setMessage("Could not load marketplace listings.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFromOrganisation() {
    if (mode !== "organisation") return;
    setCreating(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setMessage("Please sign in again.");
        return;
      }
      const res = await fetch(
        `/api/space-place/crm/organisations/${entityId}/listings/create`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      const json = (await res.json()) as {
        admin_edit_url?: string;
        error?: string;
      };
      if (!res.ok) {
        setMessage(json.error || "Could not create listing.");
        return;
      }
      if (json.admin_edit_url) {
        window.open(json.admin_edit_url, "_blank", "noopener,noreferrer");
      }
      await load();
    } catch {
      setMessage("Could not create listing.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Marketplace listings</SectionHeading>
        {mode === "organisation" ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/properties/new?crm_org_id=${encodeURIComponent(
                entityId
              )}&crm_org_name=${encodeURIComponent(organisationName || "")}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0f2740] px-3 py-1.5 text-xs font-semibold text-[#0f2740]"
              target="_blank"
            >
              <Plus className="h-3.5 w-3.5" />
              Create property
            </Link>
            <button
              type="button"
              onClick={() => void createFromOrganisation()}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2740] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Create unclaimed listing
            </button>
          </div>
        ) : organisationId ? (
          <Link
            href={`/admin/unclaimed-listings/new?crm_org_id=${encodeURIComponent(
              organisationId
            )}&crm_org_name=${encodeURIComponent(organisationName || "")}&crm_contact_id=${encodeURIComponent(
              entityId
            )}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#0f2740] px-3 py-1.5 text-xs font-semibold text-[#0f2740]"
            target="_blank"
          >
            <Plus className="h-3.5 w-3.5" />
            Create unclaimed listing
          </Link>
        ) : null}
      </div>
      <p className="mb-3 text-sm text-[#64748b]">
        {mode === "organisation"
          ? `FindMySpace listings linked to ${organisationName || "this organisation"}.`
          : "Listings linked to this contact or their organisation."}
      </p>

      {mode === "organisation" && properties.length > 0 ? (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
            Properties
          </p>
          <ul className="space-y-2">
            {properties.map((property) => (
              <li
                key={property.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#0f172a]">{property.name}</p>
                  <p className="text-xs text-[#64748b]">
                    {[property.suburb, property.city].filter(Boolean).join(", ") ||
                      "Location TBC"}{" "}
                    · {property.owner_status}
                  </p>
                </div>
                <Link
                  href={property.admin_url}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                >
                  Admin
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#64748b]">Loading listings…</p>
      ) : listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-4 py-6 text-sm text-[#64748b]">
          No marketplace listings linked yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-[#0f172a]">
                  {listing.title || "Untitled listing"}
                </p>
                <p className="text-xs text-[#64748b]">
                  {[listing.suburb, listing.city].filter(Boolean).join(", ") ||
                    "Location TBC"}{" "}
                  · {listing.status_label}
                  {listing.linked_via === "contact" ? " · via contact" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {listing.public_url ? (
                  <Link
                    href={listing.public_url}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                  >
                    Public
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
                <Link
                  href={listing.admin_edit_url}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                >
                  Admin edit
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
