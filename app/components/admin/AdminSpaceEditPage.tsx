"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { AdminListingClaimPanel } from "@/app/components/AdminListingClaimPanel";
import {
  GuardedLink,
  useUnsavedBackFallback,
  useUnsavedGuardEnabled,
} from "@/app/components/UnsavedChangesProvider";
import { UnclaimedListingEnquirySocialProof } from "@/app/components/UnclaimedListingEnquirySocialProof";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { spacePricingFormFromRow } from "@/lib/space-pricing";
import { minBookingFormFromRow } from "@/lib/space-min-booking";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";
import { isLiveListingStatus } from "@/lib/admin-listing-routing";

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

type ManagePayload = {
  space: SpaceRow;
  readOnly: boolean;
  images: { id: string; image_url: string; sort_order: number | null }[];
  attributes: Record<string, string[]>;
  enquiry_count: number;
  claim_interest_count: number;
  property: { id: string; name: string } | null;
  crm_link: SpaceCrmLinkSummary | null;
};

function buildFormInitial(
  space: SpaceRow,
  attributes: Record<string, string[]>
) {
  return {
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
    minGroupSize: space.min_group_size != null ? String(space.min_group_size) : "",
    maxGroupSize: space.max_group_size != null ? String(space.max_group_size) : "",
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
  };
}

function resolveReturnHref(
  returnTo: string | null,
  propertyId: string | null
): string {
  if (returnTo && returnTo.startsWith("/admin")) {
    return returnTo;
  }
  if (propertyId) {
    return `/admin/properties/${propertyId}`;
  }
  return "/admin/spaces/all";
}

function spaceStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  if (status === "unclaimed") return "Unclaimed";
  if (status === "owner_claimed") return "Owner claimed";
  if (status === "active") return "Live";
  if (status === "paused") return "Paused";
  return status.replace(/_/g, " ");
}

type AdminSpaceEditPageProps = {
  spaceId: string;
  /** When set, rejects spaces that do not belong to this property. */
  propertyIdConstraint?: string;
};

export function AdminSpaceEditPage({
  spaceId,
  propertyIdConstraint,
}: AdminSpaceEditPageProps) {
  return (
    <Suspense fallback={<div className="text-gray-600">Loading…</div>}>
      <AdminSpaceEditPageContent
        spaceId={spaceId}
        propertyIdConstraint={propertyIdConstraint}
      />
    </Suspense>
  );
}

function AdminSpaceEditPageContent({
  spaceId,
  propertyIdConstraint,
}: AdminSpaceEditPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const showSavedBanner = searchParams.get("saved") === "1";

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<ManagePayload | null>(null);
  const loadedSpaceIdRef = useRef<string | null>(null);
  const payloadRef = useRef<ManagePayload | null>(null);
  payloadRef.current = payload;

  const propertyId = payload?.space.property_id ?? payload?.property?.id ?? null;
  const returnHref = useMemo(
    () => resolveReturnHref(returnTo, propertyId),
    [returnTo, propertyId]
  );

  useUnsavedBackFallback(returnHref);
  useUnsavedGuardEnabled(!payload?.readOnly);

  const load = useCallback(async (options?: { force?: boolean }) => {
    if (!spaceId) return;
    if (!options?.force && loadedSpaceIdRef.current === spaceId && payloadRef.current) {
      return;
    }

    setLoading(true);
    try {
      const result = (await adminApiFetch(
        `/api/admin/spaces/${spaceId}/manage`
      )) as ManagePayload;

      if (
        propertyIdConstraint &&
        result.space.property_id &&
        result.space.property_id !== propertyIdConstraint
      ) {
        setMessage("This space does not belong to the selected property.");
        setPayload(null);
        loadedSpaceIdRef.current = null;
        setLoading(false);
        return;
      }

      setPayload({
        ...result,
        images: sortSpaceImages(result.images || []),
      });
      loadedSpaceIdRef.current = spaceId;
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load space.");
      setPayload(null);
      loadedSpaceIdRef.current = null;
    }
    setLoading(false);
  }, [propertyIdConstraint, spaceId]);

  useEffect(() => {
    loadedSpaceIdRef.current = null;
    void load({ force: true });
  }, [spaceId, load]);

  if (loading) {
    return <div className="text-gray-600">Loading…</div>;
  }

  if (!payload?.space) {
    return (
      <div>
        <p className="text-red-600">{message || "Space not found."}</p>
        <Link
          href={returnHref}
          className="mt-4 inline-block text-sm font-medium text-[#0f2740] hover:underline"
        >
          Back
        </Link>
      </div>
    );
  }

  const { space, readOnly, images, attributes, enquiry_count, claim_interest_count, property, crm_link } =
    payload;
  const propertyName = property?.name || "Property";
  const isUnclaimedWorkflow =
    space.status === "draft" ||
    space.status === "unclaimed" ||
    space.status === "owner_claimed";
  const backLabel = propertyId
    ? "Back to property"
    : returnHref.includes("unclaimed")
      ? "Back to unclaimed spaces"
      : returnHref.includes("listings")
        ? "Back to marketplace spaces"
        : "Back";

  return (
    <div className="mx-auto max-w-3xl">
      {propertyId ? (
        <AdminPropertySpaceBreadcrumb
          propertyId={propertyId}
          propertyName={propertyName}
          spaceTitle={space.title?.trim() || "Untitled space"}
        />
      ) : (
        <GuardedLink
          href={returnHref}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </GuardedLink>
      )}

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
          ) : isLiveListingStatus(space.status) ? (
            <Link
              href={`/spaces/${space.id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-[#0f2740] hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
              View public listing
            </Link>
          ) : null}
          {enquiry_count > 0 ? (
            <Link
              href="/admin/listing-enquiries"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {enquiry_count} {enquiry_count === 1 ? "enquiry" : "enquiries"}
            </Link>
          ) : null}
          {claim_interest_count > 0 ? (
            <Link
              href={`/admin/listing-claim-interests?listing=${space.id}`}
              className="text-sm font-medium text-violet-700 hover:underline"
            >
              {claim_interest_count}{" "}
              {claim_interest_count === 1 ? "claim interest" : "claim interests"}
            </Link>
          ) : null}
      </div>

      <h1 className="text-2xl font-semibold text-gray-900">Edit space</h1>
      <p className="mt-2 text-sm text-gray-600">
        {propertyId
          ? `Edit the details, pricing, location, photos and booking requirements for this space under ${propertyName}. Platform admins can edit any non-deleted space.`
          : "Edit the details, pricing, location, photos and booking requirements for this space."}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        Status: {spaceStatusLabel(space.status)}
      </p>

      {showSavedBanner ? (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Space saved successfully.
        </p>
      ) : null}

      {enquiry_count > 0 ? (
        <div className="mt-4">
          <UnclaimedListingEnquirySocialProof count={enquiry_count} />
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {isUnclaimedWorkflow ? (
          <AdminListingClaimPanel
            spaceId={space.id}
            listingTitle={space.title || "Untitled listing"}
            spaceStatus={space.status}
            disabled={readOnly}
          />
        ) : null}

        <AdminUnclaimedSpaceForm
          mode="edit"
          wrapWithUnsavedGuard={false}
          spaceId={space.id}
          propertyId={propertyId ?? undefined}
          initialStatus={space.status}
          enquiryCount={enquiry_count}
          readOnly={readOnly}
          initialCrmLink={crm_link}
          backHref={returnHref}
          backLabel={backLabel}
          listHref={returnHref}
          listLabel={backLabel}
          onSavedAndExit={() => {
            const separator = returnHref.includes("?") ? "&" : "?";
            router.push(`${returnHref}${separator}saved=1`);
          }}
          initialImages={images}
          initial={buildFormInitial(space, attributes)}
        />
      </div>
    </div>
  );
}
