"use client";

import Link from "next/link";
import {
  ORGANISATION_LISTING_VERIFICATION_ACTION,
  ORGANISATION_LISTING_VERIFICATION_BODY,
  ORGANISATION_LISTING_VERIFICATION_HEADING,
  organisationListingCommercialHref,
} from "@/lib/organisation-listing-copy";

export function OrganisationListingVerificationNotice({
  organisationId,
  showCommercialLink,
}: {
  organisationId: string;
  showCommercialLink: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2.5 sm:px-4">
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug text-[#0f172a] sm:text-sm">
          {ORGANISATION_LISTING_VERIFICATION_HEADING}
        </p>
        <p className="text-xs leading-snug text-[#64748b] sm:text-sm">
          {ORGANISATION_LISTING_VERIFICATION_BODY}
        </p>
      </div>
      {showCommercialLink ? (
        <Link
          href={organisationListingCommercialHref(organisationId)}
          className="shrink-0 text-sm font-medium text-[#c1121f] underline-offset-4 hover:underline"
        >
          {ORGANISATION_LISTING_VERIFICATION_ACTION}
        </Link>
      ) : null}
    </div>
  );
}
