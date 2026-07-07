"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2, Plus, Unlink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { SectionHeading } from "./SpacePlaceShell";
import { LinkPropertyPanel } from "@/app/components/crm-desktop/LinkPropertyPanel";
import type {
  DrawerMarketplaceCounts,
  DrawerMarketplaceListing,
  DrawerMarketplaceProperty,
} from "@/lib/crm-desktop/organisation-drawer-detail";
import { marketplaceCountsEqual } from "@/lib/crm-desktop/organisation-drawer-detail";

export type MarketplaceListingsData = {
  listings: DrawerMarketplaceListing[];
  properties: DrawerMarketplaceProperty[];
  counts: DrawerMarketplaceCounts;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

type Props = {
  mode: "organisation" | "contact";
  entityId: string;
  organisationName?: string;
  organisationId?: string;
  stackAboveDrawer?: boolean;
  onCountsChange?: (counts: DrawerMarketplaceCounts) => void;
  data?: MarketplaceListingsData;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

const EMPTY_COUNTS: DrawerMarketplaceCounts = {
  linkedPropertyCount: 0,
  linkedSpaceCount: 0,
  hasLinkedProperties: false,
  hasLinkedSpaces: false,
};

export function CrmMarketplaceListingsSection({
  mode,
  entityId,
  organisationName,
  organisationId,
  stackAboveDrawer = false,
  onCountsChange,
  data,
}: Props) {
  const controlled = Boolean(data);
  const onCountsChangeRef = useRef(onCountsChange);
  onCountsChangeRef.current = onCountsChange;
  const lastReportedCountsRef = useRef<DrawerMarketplaceCounts | null>(null);

  const [listings, setListings] = useState<DrawerMarketplaceListing[]>(
    data?.listings ?? []
  );
  const [properties, setProperties] = useState<DrawerMarketplaceProperty[]>(
    data?.properties ?? []
  );
  const [counts, setCounts] = useState<DrawerMarketplaceCounts>(
    data?.counts ?? EMPTY_COUNTS
  );
  const [loading, setLoading] = useState(data?.loading ?? !controlled);
  const [creating, setCreating] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(
    data?.error ?? null
  );

  const reportCounts = useCallback((next: DrawerMarketplaceCounts) => {
    setCounts(next);
    const last = lastReportedCountsRef.current;
    if (last && marketplaceCountsEqual(last, next)) return;
    lastReportedCountsRef.current = next;
    onCountsChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!controlled || !data) return;
    setListings(data.listings);
    setProperties(data.properties);
    setCounts(data.counts);
    setLoading(data.loading);
    setLocalError(data.error);
    // Granular deps avoid re-sync when parent passes a new `data` object with the same contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controlled section sync
  }, [
    controlled,
    data?.listings,
    data?.properties,
    data?.counts,
    data?.loading,
    data?.error,
  ]);

  const load = useCallback(async () => {
    if (controlled) return;
    setLoading(true);
    setMessage(null);
    setLocalError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setLocalError("Please sign in again.");
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
        listings?: DrawerMarketplaceListing[];
        properties?: DrawerMarketplaceProperty[];
        counts?: DrawerMarketplaceCounts;
        error?: string;
      };
      if (!res.ok) {
        setLocalError(json.error || "Could not load marketplace listings.");
        setListings([]);
        setProperties([]);
        return;
      }
      setListings(json.listings || []);
      setProperties(mode === "organisation" ? json.properties || [] : []);
      const nextCounts = json.counts ?? {
        linkedPropertyCount: json.properties?.length || 0,
        linkedSpaceCount: json.listings?.length || 0,
        hasLinkedProperties: (json.properties?.length || 0) > 0,
        hasLinkedSpaces: (json.listings?.length || 0) > 0,
      };
      reportCounts(nextCounts);
    } catch {
      setLocalError("Could not load marketplace listings.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [controlled, entityId, mode, reportCounts]);

  useEffect(() => {
    if (controlled) return;
    void load();
  }, [controlled, entityId, mode, load]);

  async function reloadListings() {
    if (controlled && data) {
      await data.reload();
      return;
    }
    await load();
  }

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
      await reloadListings();
    } catch {
      setMessage("Could not create listing.");
    } finally {
      setCreating(false);
    }
  }

  async function unlinkProperty(propertyId: string, propertyName: string) {
    if (
      !window.confirm(
        `Unlink "${propertyName}" from this CRM organisation? The property and its spaces will remain in Admin.`
      )
    ) {
      return;
    }
    setUnlinkingId(propertyId);
    setMessage(null);
    try {
      await adminApiFetch("/api/admin/crm/desktop/organisation-properties/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: entityId,
          propertyId,
        }),
      });
      await reloadListings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not unlink property.");
    } finally {
      setUnlinkingId(null);
    }
  }

  const sectionError = localError || message;
  const emptyState = !loading && properties.length === 0 && listings.length === 0;

  return (
    <section className="mt-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading>Marketplace listings</SectionHeading>
        {mode === "organisation" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0f2740] px-3 py-1.5 text-xs font-semibold text-[#0f2740]"
            >
              <Link2 className="h-3.5 w-3.5" />
              Link existing property
            </button>
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
          ? `Marketplace properties and spaces linked to ${organisationName || "this organisation"}.`
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
                    {property.address ||
                      [property.suburb, property.city].filter(Boolean).join(", ") ||
                      "Location TBC"}{" "}
                    · {property.owner_name || property.owner_status}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    {property.space_count ?? 0} space
                    {(property.space_count ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={property.admin_url}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0f2740] hover:underline"
                  >
                    Open property
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <button
                    type="button"
                    disabled={unlinkingId === property.id}
                    onClick={() => void unlinkProperty(property.id, property.name)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#c1121f] disabled:opacity-50"
                  >
                    <Unlink className="h-3 w-3" />
                    Unlink
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading && listings.length === 0 && properties.length === 0 ? (
        <p className="text-sm text-[#64748b]">Loading listings…</p>
      ) : emptyState ? (
        <p className="rounded-lg border border-dashed border-[#e2e8f0] bg-[#f8fafc] px-4 py-6 text-sm text-[#64748b]">
          No marketplace properties linked yet.
        </p>
      ) : counts.hasLinkedProperties && !counts.hasLinkedSpaces ? (
        <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Property linked, but no spaces added yet.
        </p>
      ) : null}

      {!loading && listings.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
            Spaces
          </p>
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
                    {listing.property_name ? ` · ${listing.property_name}` : ""}
                    {listing.is_bookable === false ? " · Not bookable" : ""}
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
                    Open space
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sectionError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-600">
          <span>{sectionError}</span>
          <button
            type="button"
            onClick={() => void reloadListings()}
            className="font-medium underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {mode === "organisation" ? (
        <LinkPropertyPanel
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          organisationId={entityId}
          organisationName={organisationName || "Organisation"}
          stackAboveDrawer={stackAboveDrawer}
          onLinked={() => {
            void reloadListings();
          }}
        />
      ) : null}
    </section>
  );
}
