"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { UnclaimedListingEnquirySocialProof } from "@/app/components/UnclaimedListingEnquirySocialProof";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { spacePricingFormFromRow } from "@/lib/space-pricing";
import { minBookingFormFromRow } from "@/lib/space-min-booking";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  space_type: string | null;
  booking_unit: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  property_id: string | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  price_amount?: number | null;
  price_unit?: string | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
};

export default function EditPropertySpacePage() {
  return (
    <Suspense fallback={<div className="text-gray-600">Loading…</div>}>
      <EditPropertySpacePageContent />
    </Suspense>
  );
}

function EditPropertySpacePageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSavedBanner = searchParams.get("saved") === "1";
  const propertyId = typeof params.id === "string" ? params.id : "";
  const spaceId = typeof params.spaceId === "string" ? params.spaceId : "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [space, setSpace] = useState<SpaceRow | null>(null);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [images, setImages] = useState<
    { id: string; image_url: string; sort_order: number | null }[]
  >([]);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [crmLink, setCrmLink] = useState<SpaceCrmLinkSummary | null>(null);

  const load = useCallback(async () => {
    if (!spaceId || !propertyId) return;
    setLoading(true);
    try {
      const [spaceResult, propertyResult] = await Promise.all([
        adminApiFetch(`/api/admin/properties/${propertyId}/spaces/${spaceId}`),
        adminApiFetch(`/api/admin/properties/${propertyId}`),
      ]);

      const spaceRow = spaceResult.space as SpaceRow;
      if (spaceRow.property_id && spaceRow.property_id !== propertyId) {
        setMessage("This space does not belong to the selected property.");
        setSpace(null);
        setLoading(false);
        return;
      }

      setSpace(spaceRow);
      setPropertyName((propertyResult.property as { name: string }).name);
      setAttributes((spaceResult.attributes as Record<string, string[]>) || {});
      setImages(
        sortSpaceImages(
          (spaceResult.images as {
            id: string;
            image_url: string;
            sort_order: number | null;
          }[]) || []
        )
      );
      setEnquiryCount((spaceResult.enquiry_count as number) || 0);
      setReadOnly(Boolean(spaceResult.readOnly));
      setCrmLink((spaceResult.crm_link as SpaceCrmLinkSummary | null) ?? null);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load space.");
      setSpace(null);
    }
    setLoading(false);
  }, [propertyId, spaceId]);

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
      if (hasAdminUiAccess(r)) {
        await load();
      } else {
        setLoading(false);
      }
    }
    void init();
  }, [load]);

  if (loading) {
    return <div className="text-gray-600">Loading…</div>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <div>
        <p className="text-red-600">Access denied.</p>
      </div>
    );
  }

  if (!space) {
    return (
      <div>
        <p className="text-red-600">{message || "Space not found."}</p>
        <Link
          href={`/admin/properties/${propertyId}`}
          className="mt-4 inline-block text-sm font-medium text-[#0f2740] hover:underline"
        >
          Back to property
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPropertySpaceBreadcrumb
        propertyId={propertyId}
        propertyName={propertyName || "Property"}
        spaceTitle={space.title?.trim() || "Untitled space"}
      />

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {space.status === "draft" || space.status === "unclaimed" ? (
          <Link
            href={
              space.status === "unclaimed"
                ? `/spaces/${space.id}`
                : `/admin/unclaimed-listings/${space.id}/preview`
            }
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-[#0f2740] hover:bg-gray-50"
          >
            <Eye className="h-4 w-4" />
            Preview listing
          </Link>
        ) : null}
      </div>

      <h1 className="text-2xl font-semibold text-gray-900">Edit space</h1>
      <p className="mt-2 text-sm text-gray-600">
        Save your draft, upload photos, then publish when ready. This space is linked
        to {propertyName || "the property"}.
      </p>

      {showSavedBanner ? (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Space saved. You can now add photos and AI Information.
        </p>
      ) : null}

      {enquiryCount > 0 ? (
        <div className="mt-4">
          <UnclaimedListingEnquirySocialProof count={enquiryCount} />
        </div>
      ) : null}

      <div className="mt-6">
        <AdminUnclaimedSpaceForm
          mode="edit"
          spaceId={space.id}
          propertyId={propertyId}
          initialStatus={space.status}
          enquiryCount={enquiryCount}
          readOnly={readOnly}
          initialCrmLink={crmLink}
          backHref={`/admin/properties/${propertyId}`}
          backLabel="Back to property"
          onSavedAndExit={() =>
            router.push(`/admin/properties/${propertyId}?saved=1`)
          }
          initialImages={images}
          initial={{
            title: space.title || "",
            description: space.description || "",
            spaceType: space.space_type || "storage",
            bookingUnit: space.booking_unit || "day",
            city: space.city || "",
            suburb: space.suburb || "",
            streetAddress: space.street_address || "",
            province: space.province || "",
            postalCode: space.postal_code || "",
            country: space.country || "South Africa",
              latitude: space.latitude,
              longitude: space.longitude,
              minGroupSize:
                space.min_group_size != null ? String(space.min_group_size) : "",
              maxGroupSize:
                space.max_group_size != null ? String(space.max_group_size) : "",
              ...(() => {
                const pricing = spacePricingFormFromRow(space);
                return {
                  priceAmount: pricing.priceAmount,
                  priceUnit: pricing.priceUnit,
                  depositRequired: pricing.depositRequired,
                  depositAmount: pricing.depositAmount,
                };
              })(),
              ...(() => {
                const minBooking = minBookingFormFromRow(space);
                return {
                  minBookingDuration: minBooking.duration,
                  minBookingUnit: minBooking.unit,
                };
              })(),
              attributes,
            }}
        />
      </div>
    </div>
  );
}
