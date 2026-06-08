"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { useAdminRole } from "@/lib/use-admin-role";
import { scoutFormFromAttributes } from "@/lib/venue-scout-tags";
import { VenueScoutCaptureForm } from "@/app/components/VenueScoutCaptureForm";
import { VenueScoutNextActions } from "@/app/components/VenueScoutNextActions";
import { AdminListingClaimPanel } from "@/app/components/AdminListingClaimPanel";

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  space_type: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  listing_admin_comment?: string | null;
};

function VenueScoutEditContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const showSaved = searchParams.get("saved") === "1";

  const { isAdmin, loading: roleLoading } = useAdminRole();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [images, setImages] = useState<
    { id: string; image_url: string; sort_order: number | null }[]
  >([]);
  const [readOnly, setReadOnly] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/spaces/${id}/unclaimed`);
      setSpace(result.space as SpaceRow);
      setAttributes((result.attributes as Record<string, string[]>) || {});
      setImages(
        sortSpaceImages(
          (result.images as {
            id: string;
            image_url: string;
            sort_order: number | null;
          }[]) || []
        )
      );
      setReadOnly(Boolean(result.readOnly));
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load listing.");
      setSpace(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin) void load();
    else if (!roleLoading) setLoading(false);
  }, [isAdmin, roleLoading, load]);

  useEffect(() => {
    if (showSaved) {
      window.history.replaceState({}, "", `/admin/venue-scout/${id}`);
    }
  }, [showSaved, id]);

  if (roleLoading || loading) {
    return <main className="p-8 text-gray-600">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  if (!space) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Listing not found."}</p>
        <Link href="/admin/venue-scout" className="mt-4 inline-block text-sm underline">
          Back to venue scout
        </Link>
      </main>
    );
  }

  const scout = scoutFormFromAttributes(attributes);

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/admin/venue-scout"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to venue scout
        </Link>

        <VenueScoutNextActions
          spaceId={space.id}
          title={space.title || "Untitled"}
          status={space.status || "draft"}
          hasPhotos={images.length > 0}
        />

        <div className="mt-6">
          <VenueScoutCaptureForm
            key={space.id}
            mode="edit"
            spaceId={space.id}
            initialStatus={space.status}
            showSavedBanner={showSaved}
            readOnly={readOnly}
            initialAttributes={attributes}
            initialImages={images}
            initialAdminNotes={space.listing_admin_comment || ""}
            initial={{
              title: space.title || "",
              description: space.description || "",
              spaceType: space.space_type || "event_space",
              city: space.city || "Paarl",
              suburb: space.suburb || "",
              streetAddress: space.street_address || "",
              province: space.province || "Western Cape",
              postalCode: space.postal_code || "",
              country: space.country || "South Africa",
              latitude: space.latitude,
              longitude: space.longitude,
              website: scout.website,
              phone: scout.phone,
              capacity: scout.capacity,
              tags: scout.tags,
            }}
          />
        </div>

        <div id="scout-claim-panel" className="mt-6">
          <AdminListingClaimPanel
            spaceId={space.id}
            listingTitle={space.title || "Untitled listing"}
            spaceStatus={space.status}
            disabled={readOnly}
          />
        </div>
      </div>
    </main>
  );
}

export default function VenueScoutEditPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <VenueScoutEditContent />
    </Suspense>
  );
}
