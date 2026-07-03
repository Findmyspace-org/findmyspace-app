"use client";

import Link from "next/link";
import Image from "next/image";
import { Building2, ImageIcon } from "lucide-react";
import { AdminRowActionsMenu } from "@/app/components/admin/AdminRowActionsMenu";
import { FOCUS_HIGHLIGHT_CLASS } from "@/lib/use-focus-highlight";
import { isBookableListingStatus } from "@/lib/listing-lifecycle";
import type { OwnerListingNextAction } from "@/lib/listing-lifecycle";

export type OwnerSpaceTableRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  status: string | null;
  public_listing_mode?: string | null;
  created_at: string | null;
  ownership_proof_status?: string | null;
  owner_verification_status?: string | null;
  bank_verification_status?: string | null;
  cover_image_url?: string | null;
  property_id?: string | null;
  property_name?: string | null;
};

type OwnerSpacesTableProps = {
  spaces: OwnerSpaceTableRow[];
  highlightedId?: string | null;
  getStatusLabel: (space: OwnerSpaceTableRow) => string;
  getStatusBadgeClass: (status: string | null) => string;
  getVerificationBadgeClass: (status: string | null | undefined) => string;
  getPriceLabel: (space: OwnerSpaceTableRow) => string;
  getNextAction: (space: OwnerSpaceTableRow) => OwnerListingNextAction | null;
  nextActionButtonClass: (action: OwnerListingNextAction) => string;
  onViewDetails: (space: OwnerSpaceTableRow) => void;
  onTogglePause: (spaceId: string, nextStatus: "active" | "paused") => void;
  pauseUpdatingId?: string | null;
  canTogglePause: (space: OwnerSpaceTableRow) => boolean;
};

function verificationShortLabel(kind: string, status: string | null | undefined) {
  const value = status || "pending";
  const short =
    value === "verified"
      ? "OK"
      : value === "rejected"
        ? "Rejected"
        : value === "missing"
          ? "Missing"
          : "Pending";
  return `${kind}: ${short}`;
}

export function OwnerSpacesTable({
  spaces,
  highlightedId,
  getStatusLabel,
  getStatusBadgeClass,
  getVerificationBadgeClass,
  getPriceLabel,
  getNextAction,
  nextActionButtonClass,
  onViewDetails,
  onTogglePause,
  pauseUpdatingId,
  canTogglePause,
}: OwnerSpacesTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-0 table-fixed text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-14 px-2 py-3 font-medium">Image</th>
            <th className="min-w-0 px-2 py-3 font-medium">Space</th>
            <th className="hidden w-28 px-2 py-3 font-medium md:table-cell">Price</th>
            <th className="w-[7.5rem] px-2 py-3 font-medium">Status</th>
            <th className="hidden min-w-[11rem] px-2 py-3 font-medium lg:table-cell">
              Verification
            </th>
            <th className="w-[5.5rem] px-2 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {spaces.map((space) => {
            const location =
              [space.address_line_1, space.suburb, space.city]
                .filter(Boolean)
                .join(", ") || "Address not set";
            const nextAction = getNextAction(space);
            const isLive =
              space.status === "active" || space.status === "paused";
            const publicHref = isBookableListingStatus(space.status)
              ? `/spaces/${space.id}`
              : null;

            const menuActions = [
              {
                key: "details",
                label: "View details",
                onClick: () => onViewDetails(space),
              },
              ...(publicHref
                ? [
                    {
                      key: "public",
                      label: "View public page",
                      href: publicHref,
                      external: true,
                    },
                  ]
                : []),
              {
                key: "edit",
                label: "Edit space",
                href: `/spaces/${space.id}/edit`,
              },
              {
                key: "verification",
                label: "Verification center",
                href: "/dashboard/verification",
              },
              ...(nextAction
                ? [
                    {
                      key: "next",
                      label: nextAction.label,
                      href: nextAction.href,
                    },
                  ]
                : []),
              ...(canTogglePause(space) && space.status === "active"
                ? [
                    {
                      key: "pause",
                      label: "Pause",
                      disabled: pauseUpdatingId === space.id,
                      onClick: () => onTogglePause(space.id, "paused"),
                    },
                  ]
                : []),
              ...(canTogglePause(space) && space.status === "paused"
                ? [
                    {
                      key: "resume",
                      label: "Resume",
                      disabled: pauseUpdatingId === space.id,
                      onClick: () => onTogglePause(space.id, "active"),
                    },
                  ]
                : []),
            ];

            return (
              <tr
                key={space.id}
                id={`space-${space.id}`}
                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/80 ${
                  highlightedId === space.id ? FOCUS_HIGHLIGHT_CLASS : ""
                }`}
              >
                <td className="px-2 py-3 align-middle">
                  <button
                    type="button"
                    onClick={() => onViewDetails(space)}
                    className="block h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                    title="View details"
                  >
                    {space.cover_image_url ? (
                      <Image
                        src={space.cover_image_url}
                        alt=""
                        width={44}
                        height={44}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-gray-400">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </td>
                <td className="min-w-0 px-2 py-3 align-middle">
                  <button
                    type="button"
                    onClick={() => onViewDetails(space)}
                    className="block w-full truncate text-left font-semibold text-gray-900 hover:text-[#0f2740] hover:underline"
                    title={space.title || "Untitled space"}
                  >
                    {space.title || "Untitled space"}
                  </button>
                  <p className="mt-0.5 truncate text-xs text-gray-500" title={location}>
                    {location}
                  </p>
                  {space.property_name ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {space.property_id ? (
                        <Link
                          href={`/dashboard/properties/${space.property_id}`}
                          className="truncate hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {space.property_name}
                        </Link>
                      ) : (
                        space.property_name
                      )}
                    </p>
                  ) : null}
                  {nextAction ? (
                    <Link
                      href={nextAction.href}
                      className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${nextActionButtonClass(nextAction)}`}
                    >
                      {nextAction.label}
                    </Link>
                  ) : null}
                </td>
                <td className="hidden truncate px-2 py-3 text-xs text-gray-600 md:table-cell">
                  {getPriceLabel(space)}
                </td>
                <td className="px-2 py-3 align-middle">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                      space.status
                    )}`}
                  >
                    {getStatusLabel(space)}
                  </span>
                  {isLive ? (
                    <button
                      type="button"
                      title={space.status === "paused" ? "Resume" : "Pause"}
                      disabled={
                        pauseUpdatingId === space.id ||
                        !canTogglePause(space)
                      }
                      onClick={() =>
                        onTogglePause(
                          space.id,
                          space.status === "paused" ? "active" : "paused"
                        )
                      }
                      className={`relative mt-2 inline-flex h-5 w-10 items-center rounded-full transition ${
                        space.status === "active" ? "bg-green-600" : "bg-gray-300"
                      } ${
                        !canTogglePause(space) || pauseUpdatingId === space.id
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      aria-label={
                        space.status === "paused"
                          ? "Activate listing"
                          : "Pause listing"
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          space.status === "paused" ? "translate-x-1" : "translate-x-5"
                        }`}
                      />
                    </button>
                  ) : null}
                </td>
                <td className="hidden px-2 py-3 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getVerificationBadgeClass(
                        space.owner_verification_status
                      )}`}
                      title={`Owner verification: ${space.owner_verification_status || "pending"}`}
                    >
                      {verificationShortLabel(
                        "Owner",
                        space.owner_verification_status
                      )}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getVerificationBadgeClass(
                        space.bank_verification_status
                      )}`}
                      title={`Bank verification: ${space.bank_verification_status || "pending"}`}
                    >
                      {verificationShortLabel("Bank", space.bank_verification_status)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getVerificationBadgeClass(
                        space.ownership_proof_status
                      )}`}
                      title={`Ownership proof: ${space.ownership_proof_status || "pending"}`}
                    >
                      {verificationShortLabel(
                        "Proof",
                        space.ownership_proof_status
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-3 text-right align-middle">
                  <AdminRowActionsMenu
                    actions={menuActions}
                    loading={pauseUpdatingId === space.id}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
