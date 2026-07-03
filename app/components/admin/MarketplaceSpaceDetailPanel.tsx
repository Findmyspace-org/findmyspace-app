"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { format } from "date-fns";
import { Building2 } from "lucide-react";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";
import { getAdminSpaceVisibilityInfo } from "@/lib/admin-space-visibility";
import { formatGroupSizeAdmin } from "@/lib/group-size";
import { formatSpacePriceDisplay } from "@/lib/space-pricing";
import { publicListingModeLabel } from "@/lib/public-listing-mode";
import { getDisplayName, isValidUuid } from "@/lib/utils";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";

type DetailSpace = {
  id: string;
  title: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  status: string | null;
  public_listing_mode?: string | null;
  is_bookable?: boolean | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
  price_unit?: string | null;
  price_amount?: number | null;
  property_id: string | null;
  property_name?: string | null;
  owner_id: string | null;
  platform_fee_percent?: number | null;
  created_at?: string | null;
  enquiry_count?: number;
};

type OwnerProfile = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | null;

type MarketplaceSpaceDetailPanelProps = {
  space: DetailSpace;
  ownerProfile: OwnerProfile;
};

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-800">{children}</dd>
    </div>
  );
}

export function MarketplaceSpaceDetailPanel({
  space,
  ownerProfile,
}: MarketplaceSpaceDetailPanelProps) {
  const location =
    [space.suburb, space.city].filter(Boolean).join(", ") ||
    space.address_line_1 ||
    "—";
  const visibility = getAdminSpaceVisibilityInfo(space);
  const ownerLabel = isValidUuid(space.owner_id)
    ? getDisplayName(ownerProfile)
    : "Unassigned";
  const groupLabel =
    formatGroupSizeAdmin(space.min_group_size, space.max_group_size) || "—";

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
      <h3 className="mb-3 text-sm font-semibold text-[#192a3a]">Space details</h3>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <DetailRow label="Group / capacity">{groupLabel}</DetailRow>
        <DetailRow label="Price">
          {formatSpacePriceDisplay(space)}
          {space.booking_unit ? (
            <span className="text-gray-500"> · {space.booking_unit}</span>
          ) : null}
        </DetailRow>
        <DetailRow label="Type">{formatSpaceTypeLabel(space.space_type)}</DetailRow>
        <DetailRow label="Location">{location}</DetailRow>
        <DetailRow label="Property">
          {space.property_name && isValidUuid(space.property_id) ? (
            <Link
              href={`/admin/properties/${space.property_id}`}
              className="inline-flex items-center gap-1 font-medium text-[#0f2740] hover:underline"
            >
              <Building2 className="h-3.5 w-3.5" />
              {space.property_name}
            </Link>
          ) : space.property_name ? (
            space.property_name
          ) : (
            "—"
          )}
        </DetailRow>
        <DetailRow label="Owner">
          <span>{ownerLabel}</span>
          {ownerProfile?.email ? (
            <p className="text-xs text-gray-500">{ownerProfile.email}</p>
          ) : null}
        </DetailRow>
        <DetailRow label="Lifecycle status">
          {adminListingStatusLabel(space.status)}
        </DetailRow>
        <DetailRow label="Public listing mode">
          {publicListingModeLabel(space.public_listing_mode)}
        </DetailRow>
        <DetailRow label="Browse visibility">
          <span className={visibility.visibilityBadgeClass}>
            {visibility.visibilityLabel}
          </span>
          <p className="mt-1 text-xs text-gray-500">{visibility.bookabilityLabel}</p>
        </DetailRow>
        <DetailRow label="Bookable">
          {space.is_bookable ? "Yes" : "No"}
        </DetailRow>
        <DetailRow label="Platform fee">
          {Number(space.platform_fee_percent ?? 15)}%
        </DetailRow>
        <DetailRow label="Created">
          {space.created_at
            ? format(new Date(space.created_at), "dd MMM yyyy")
            : "—"}
        </DetailRow>
        <DetailRow label="Enquiries">{space.enquiry_count ?? 0}</DetailRow>
      </dl>
    </div>
  );
}
