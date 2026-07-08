"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useState } from "react";
import { Building2, ImageIcon, Pencil, Save } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  adminCanonicalSpaceEditHref,
  adminListingReviewHref,
  needsReviewWorkflow,
} from "@/lib/admin-listing-routing";
import {
  adminListingStatusBadgeClass,
  adminListingStatusLabel,
} from "@/lib/admin-listing-status-display";
import {
  matrixStatusSelectValue,
  resolveMatrixStatus,
  type MatrixStatusValue,
} from "@/lib/admin-space-matrix";
import {
  adminSpacePublicViewHref,
  canAdminToggleLiveStatus,
} from "@/lib/admin-space-visibility";
import { formatSpaceTypeLabel } from "@/app/data/spaceFeatureConfig";
import { getDisplayName, isValidUuid } from "@/lib/utils";
import { AdminInlineSelect } from "@/app/components/admin/AdminInlineSelect";
import { AdminRowActionsMenu } from "@/app/components/admin/AdminRowActionsMenu";
import { MarketplaceSpaceDetailPanel } from "@/app/components/admin/MarketplaceSpaceDetailPanel";
import {
  MarketplaceSpaceQuickEditPanel,
  type SpaceContentDraft,
} from "@/app/components/admin/MarketplaceSpaceQuickEditPanel";
import { CrmCompletedActionsQuickMenu } from "@/app/components/crm-desktop/CrmCompletedActionsQuickMenu";
import { completedActionHref } from "@/app/components/crm-desktop/CrmCompletedActionsPanel";

type DepositType = "none" | "one_month" | "two_months" | null;

export type MarketplaceSpaceRow = {
  id: string;
  owner_id: string | null;
  title: string | null;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  status: string | null;
  public_listing_mode?: string | null;
  is_bookable?: boolean | null;
  ownership_proof_status: string | null;
  platform_fee_percent: number | null;
  deposit_type: DepositType;
  deposit_months: number | null;
  monthly_payment_day: number | null;
  created_at?: string | null;
  property_id: string | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  price_unit?: string | null;
  price_amount?: number | null;
  cover_image_url?: string | null;
  property_name?: string | null;
  crm_organisation_id?: string | null;
  enquiry_count?: number;
};

type OwnerProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
} | null;

export type MarketplaceListingRecord = {
  space: MarketplaceSpaceRow;
  ownerProfile: OwnerProfileRow;
  canActivate: boolean;
};

const MATRIX_STATUS_OPTIONS: { value: MatrixStatusValue; label: string }[] = [
  { value: "hidden", label: "Hidden" },
  { value: "live", label: "Live / bookable" },
  { value: "paused", label: "Paused" },
  { value: "enquiry", label: "Public enquiry-only" },
  { value: "archived", label: "Archived" },
];

type MarketplaceSpacesTableProps = {
  records: MarketplaceListingRecord[];
  feeInputs: Record<string, string>;
  setFeeInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingFeeId: string | null;
  onSavePlatformFee: (spaceId: string) => Promise<void>;
  quickEditId: string | null;
  onToggleQuickEdit: (spaceId: string, space: MarketplaceSpaceRow) => void;
  contentDrafts: Record<string, SpaceContentDraft>;
  setContentDrafts: React.Dispatch<React.SetStateAction<Record<string, SpaceContentDraft>>>;
  savingContentId: string | null;
  contentSaveFeedback: { spaceId: string; text: string; isError: boolean } | null;
  onSaveListingContent: (spaceId: string, space: MarketplaceSpaceRow) => Promise<void>;
  draftFromSpace: (space: MarketplaceSpaceRow) => SpaceContentDraft;
  formatDepositType: (
    depositType: DepositType,
    depositMonths: number | null | undefined
  ) => string;
  updatingId: string | null;
  onUpdateLiveStatus: (spaceId: string, nextStatus: "active" | "paused") => Promise<void>;
  onSpacePatched: (spaceId: string, patch: Partial<MarketplaceSpaceRow>) => void;
  onMessage: (message: string) => void;
  onReload: () => Promise<void>;
};

function ArchiveConfirmDialog({
  spaceTitle,
  busy,
  onCancel,
  onConfirm,
}: {
  spaceTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="marketplace-archive-title"
      >
        <h2 id="marketplace-archive-title" className="text-lg font-semibold text-gray-900">
          Archive this space?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{spaceTitle}</span> will be removed
          from public browse and default admin lists.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50"
          >
            {busy ? "Archiving…" : "Archive space"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceSpacesTable({
  records,
  feeInputs,
  setFeeInputs,
  savingFeeId,
  onSavePlatformFee,
  quickEditId,
  onToggleQuickEdit,
  contentDrafts,
  setContentDrafts,
  savingContentId,
  contentSaveFeedback,
  onSaveListingContent,
  draftFromSpace,
  formatDepositType,
  updatingId,
  onUpdateLiveStatus,
  onSpacePatched,
  onMessage,
  onReload,
}: MarketplaceSpacesTableProps) {
  const [viewId, setViewId] = useState<string | null>(null);
  const [feeEditId, setFeeEditId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MarketplaceListingRecord | null>(null);

  const applyMatrixStatus = useCallback(
    async (spaceId: string, next: MatrixStatusValue) => {
      setStatusLoadingId(spaceId);
      try {
        const result = await adminApiFetch(`/api/admin/spaces/${spaceId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });

        onSpacePatched(spaceId, {
          status: result.status as string | null,
          public_listing_mode: result.public_listing_mode as string | null,
          is_bookable: Boolean(result.is_bookable),
        });
        onMessage("Space status updated.");
        await onReload();
      } catch (err) {
        onMessage(err instanceof Error ? err.message : "Could not update status.");
      } finally {
        setStatusLoadingId(null);
        setArchiveTarget(null);
      }
    },
    [onMessage, onReload, onSpacePatched]
  );

  function requestMatrixStatus(record: MarketplaceListingRecord, next: MatrixStatusValue) {
    if (next === "archived") {
      setArchiveTarget(record);
      return;
    }
    void applyMatrixStatus(record.space.id, next);
  }

  function buildStatusOptions(space: MarketplaceSpaceRow) {
    const lifecycle = space.status || "pending";
    const matrixStatus = resolveMatrixStatus({
      status: space.status,
      public_listing_mode: space.public_listing_mode ?? null,
    });
    const inReview = needsReviewWorkflow(lifecycle);
    const isDraftLike = lifecycle === "draft" || lifecycle === "unclaimed";

    const options: {
      value: MatrixStatusValue;
      label: string;
      disabled?: boolean;
      hint?: string;
    }[] = [];

    if (isDraftLike) {
      options.push({
        value: matrixStatus,
        label: adminListingStatusLabel(lifecycle),
        disabled: true,
        hint: "Manage in Unclaimed spaces",
      });
      return options;
    }

    for (const option of MATRIX_STATUS_OPTIONS) {
      const disabled =
        option.value === matrixStatus ||
        (inReview && (option.value === "live" || option.value === "enquiry"));

      options.push({
        ...option,
        disabled,
        hint:
          inReview && (option.value === "live" || option.value === "enquiry")
            ? "Approve in Listing reviews first"
            : undefined,
      });
    }

    return options;
  }

  const colSpan = 7;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-0 table-fixed text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-14 px-2 py-3 font-medium">Image</th>
              <th className="min-w-0 px-2 py-3 font-medium">Space</th>
              <th className="w-[7.5rem] px-2 py-3 font-medium">Status</th>
              <th className="hidden w-24 px-2 py-3 font-medium sm:table-cell">Type</th>
              <th className="hidden w-20 px-2 py-3 font-medium md:table-cell">Fee</th>
              <th className="hidden w-28 px-2 py-3 font-medium lg:table-cell">Owner</th>
              <th className="w-[5.5rem] px-2 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.flatMap((record) => {
              const space = record.space;
              const location =
                [space.suburb, space.city].filter(Boolean).join(", ") ||
                space.address_line_1 ||
                "—";
              const editHref = adminCanonicalSpaceEditHref(space.id, {
                returnTo: "/admin/listings",
              });
              const publicHref = adminSpacePublicViewHref({
                id: space.id,
                status: space.status,
                public_listing_mode: space.public_listing_mode ?? null,
              });
              const ownerLabel = isValidUuid(space.owner_id)
                ? getDisplayName(record.ownerProfile)
                : "Unassigned";
              const matrixStatus = resolveMatrixStatus({
                status: space.status,
                public_listing_mode: space.public_listing_mode ?? null,
              });
              const statusOptions = buildStatusOptions(space);
              const feeEditing = feeEditId === space.id;
              const savedFee = Number(space.platform_fee_percent ?? 15);

              const menuActions = [
                {
                  key: "view",
                  label: viewId === space.id ? "Close details" : "View",
                  onClick: () =>
                    setViewId((current) => (current === space.id ? null : space.id)),
                },
                {
                  key: "edit",
                  label: "Edit space",
                  href: editHref,
                },
                ...(space.crm_organisation_id
                  ? [
                      {
                        key: "completed-view",
                        label: "View completed actions",
                        href: completedActionHref({
                          organisationId: space.crm_organisation_id,
                          propertyId: space.property_id || undefined,
                          spaceId: space.id,
                        }),
                      },
                      {
                        key: "completed-add",
                        label: "Add completed action",
                        href: completedActionHref({
                          organisationId: space.crm_organisation_id,
                          propertyId: space.property_id || undefined,
                          spaceId: space.id,
                        }),
                      },
                    ]
                  : []),
                {
                  key: "quick",
                  label:
                    quickEditId === space.id ? "Close quick edit" : "Quick edit",
                  onClick: () => onToggleQuickEdit(space.id, space),
                },
                {
                  key: "fee",
                  label: feeEditing ? "Close fee editor" : "Change platform fee",
                  onClick: () =>
                    setFeeEditId((current) => (current === space.id ? null : space.id)),
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
                ...(needsReviewWorkflow(space.status)
                  ? [
                      {
                        key: "review",
                        label: "Open review",
                        href: adminListingReviewHref(space.id),
                      },
                    ]
                  : []),
                ...(canAdminToggleLiveStatus(space) && space.status === "active"
                  ? [
                      {
                        key: "pause",
                        label: "Pause",
                        disabled: updatingId === space.id,
                        onClick: () => void onUpdateLiveStatus(space.id, "paused"),
                      },
                    ]
                  : []),
                ...(canAdminToggleLiveStatus(space) && space.status === "paused"
                  ? [
                      {
                        key: "resume",
                        label: "Resume",
                        disabled: updatingId === space.id,
                        onClick: () => void onUpdateLiveStatus(space.id, "active"),
                      },
                    ]
                  : []),
              ];

              const rows = [
                <tr
                  key={space.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80"
                >
                  <td className="px-2 py-3 align-middle">
                    <Link
                      href={editHref}
                      className="block h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                      title="Edit space"
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
                    </Link>
                  </td>
                  <td className="min-w-0 px-2 py-3 align-middle">
                    <Link
                      href={editHref}
                      className="block truncate font-semibold text-gray-900 hover:text-[#0f2740] hover:underline"
                      title={space.title || "Untitled space"}
                    >
                      {space.title || "Untitled space"}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-gray-500" title={location}>
                      {location}
                    </p>
                    {space.property_name ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {isValidUuid(space.property_id) ? (
                          <Link
                            href={`/admin/properties/${space.property_id}`}
                            className="truncate hover:underline"
                          >
                            {space.property_name}
                          </Link>
                        ) : (
                          space.property_name
                        )}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 align-middle">
                    <AdminInlineSelect
                      value={matrixStatusSelectValue(matrixStatus)}
                      displayLabel={adminListingStatusLabel(space.status)}
                      pillClass={adminListingStatusBadgeClass(space.status)}
                      options={statusOptions}
                      loading={statusLoadingId === space.id}
                      disabled={
                        space.status === "deleted" ||
                        statusOptions.every((option) => option.disabled)
                      }
                      onSelect={(next) => requestMatrixStatus(record, next)}
                    />
                  </td>
                  <td className="hidden truncate px-2 py-3 text-xs text-gray-600 sm:table-cell">
                    {formatSpaceTypeLabel(space.space_type)}
                  </td>
                  <td className="hidden px-2 py-3 md:table-cell">
                    {feeEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={feeInputs[space.id] ?? ""}
                          onChange={(e) =>
                            setFeeInputs((current) => ({
                              ...current,
                              [space.id]: e.target.value,
                            }))
                          }
                          className="w-12 rounded border border-gray-300 px-1 py-0.5 text-xs outline-none"
                          aria-label="Platform fee percent"
                        />
                        <span className="text-[10px] text-gray-500">%</span>
                        <button
                          type="button"
                          onClick={() => void onSavePlatformFee(space.id)}
                          disabled={savingFeeId === space.id}
                          className="rounded border border-gray-300 p-0.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          title="Save platform fee"
                        >
                          <Save className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFeeEditId(space.id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-[#0f2740]"
                        title="Change platform fee"
                      >
                        <span>{savedFee}%</span>
                        <Pencil className="h-3 w-3 opacity-60" />
                      </button>
                    )}
                  </td>
                  <td className="hidden min-w-0 px-2 py-3 lg:table-cell">
                    <p className="truncate text-xs font-medium text-gray-800" title={ownerLabel}>
                      {ownerLabel}
                    </p>
                    {record.ownerProfile?.email ? (
                      <p
                        className="truncate text-[11px] text-gray-500"
                        title={record.ownerProfile.email}
                      >
                        {record.ownerProfile.email}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 text-right align-middle">
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      {space.crm_organisation_id ? (
                        <CrmCompletedActionsQuickMenu
                          organisationId={space.crm_organisation_id}
                          propertyId={space.property_id}
                          spaceId={space.id}
                        />
                      ) : null}
                      <AdminRowActionsMenu
                        loading={updatingId === space.id || statusLoadingId === space.id}
                        actions={menuActions}
                      />
                    </div>
                  </td>
                </tr>,
              ];

              if (viewId === space.id) {
                rows.push(
                  <tr key={`${space.id}-view`}>
                    <td colSpan={colSpan} className="p-0">
                      <MarketplaceSpaceDetailPanel
                        space={space}
                        ownerProfile={record.ownerProfile}
                      />
                    </td>
                  </tr>
                );
              }

              if (quickEditId === space.id) {
                const draft = contentDrafts[space.id] ?? draftFromSpace(space);
                rows.push(
                  <tr key={`${space.id}-quick`}>
                    <td colSpan={colSpan} className="p-0">
                      <MarketplaceSpaceQuickEditPanel
                        space={space}
                        draft={draft}
                        canActivate={record.canActivate}
                        saving={savingContentId === space.id}
                        feedback={
                          contentSaveFeedback?.spaceId === space.id
                            ? {
                                text: contentSaveFeedback.text,
                                isError: contentSaveFeedback.isError,
                              }
                            : null
                        }
                        formatDepositType={formatDepositType}
                        onDraftChange={(patch) =>
                          setContentDrafts((prev) => ({
                            ...prev,
                            [space.id]: {
                              ...(prev[space.id] ?? draftFromSpace(space)),
                              ...patch,
                            },
                          }))
                        }
                        onSave={() => void onSaveListingContent(space.id, space)}
                      />
                    </td>
                  </tr>
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>

      {archiveTarget ? (
        <ArchiveConfirmDialog
          spaceTitle={archiveTarget.space.title || "Untitled space"}
          busy={statusLoadingId === archiveTarget.space.id}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => void applyMatrixStatus(archiveTarget.space.id, "archived")}
        />
      ) : null}
    </>
  );
}
