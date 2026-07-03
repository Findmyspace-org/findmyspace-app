"use client";

import { Save, ShieldCheck } from "lucide-react";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";

type DepositType = "none" | "one_month" | "two_months" | null;

export type SpaceContentDraft = {
  title: string;
  description: string;
  city: string;
  suburb: string;
  address_line_1: string;
  space_type: string;
  booking_unit: string;
  price_per_hour: string;
  price_per_day: string;
  price_per_month: string;
  min_booking_hours: string;
  min_booking_days: string;
  min_booking_months: string;
  reason: string;
};

type SpaceSnapshot = {
  id: string;
  booking_unit: string | null;
  deposit_type: DepositType;
  deposit_months: number | null;
  monthly_payment_day: number | null;
};

type MarketplaceSpaceQuickEditPanelProps = {
  space: SpaceSnapshot;
  draft: SpaceContentDraft;
  canActivate: boolean;
  saving: boolean;
  feedback: { text: string; isError: boolean } | null;
  formatDepositType: (
    depositType: DepositType,
    depositMonths: number | null | undefined
  ) => string;
  onDraftChange: (patch: Partial<SpaceContentDraft>) => void;
  onSave: () => void;
};

export function MarketplaceSpaceQuickEditPanel({
  space,
  draft,
  canActivate,
  saving,
  feedback,
  formatDepositType,
  onDraftChange,
  onSave,
}: MarketplaceSpaceQuickEditPanelProps) {
  return (
    <div className="border-t border-gray-100 bg-blue-50/40 px-4 py-4">
      <h3 className="mb-1 text-sm font-semibold text-[#192a3a]">Quick content edit</h3>
      <p className="mb-3 text-xs text-gray-600">
        Safe space fields only (no status, fees, deposits, or ownership). Requires a short
        reason. For full editing — location, photos, booking requirements, AI — use Edit
        space in the row above.
      </p>
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Reason for change
          </label>
          <input
            type="text"
            value={draft.reason}
            onChange={(e) => onDraftChange({ reason: e.target.value })}
            placeholder="e.g. Fix typo in title"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onDraftChange({ title: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Description
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => onDraftChange({ description: e.target.value })}
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Address</label>
            <input
              type="text"
              value={draft.address_line_1}
              onChange={(e) => onDraftChange({ address_line_1: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Suburb</label>
            <input
              type="text"
              value={draft.suburb}
              onChange={(e) => onDraftChange({ suburb: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">City</label>
            <input
              type="text"
              value={draft.city}
              onChange={(e) => onDraftChange({ city: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Category (space type)
            </label>
            <select
              value={draft.space_type}
              onChange={(e) => onDraftChange({ space_type: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {LISTING_SPACE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Booking unit
            </label>
            <select
              value={draft.booking_unit}
              onChange={(e) => onDraftChange({ booking_unit: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="month">Month</option>
            </select>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Price / hour
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={draft.price_per_hour}
              onChange={(e) => onDraftChange({ price_per_hour: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Price / day
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={draft.price_per_day}
              onChange={(e) => onDraftChange({ price_per_day: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Price / month
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={draft.price_per_month}
              onChange={(e) => onDraftChange({ price_per_month: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Min hours</label>
            <input
              type="text"
              inputMode="numeric"
              value={draft.min_booking_hours}
              onChange={(e) => onDraftChange({ min_booking_hours: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Min days</label>
            <input
              type="text"
              inputMode="numeric"
              value={draft.min_booking_days}
              onChange={(e) => onDraftChange({ min_booking_days: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Min months</label>
            <input
              type="text"
              inputMode="numeric"
              value={draft.min_booking_months}
              onChange={(e) => onDraftChange({ min_booking_months: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        {space.booking_unit === "month" ? (
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            Deposit: {formatDepositType(space.deposit_type, space.deposit_months)} · Payment
            day: {space.monthly_payment_day ?? 1}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save content"}
          </button>
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              canActivate
                ? "border-green-300 bg-green-50 text-green-900"
                : "border-yellow-300 bg-yellow-50 text-yellow-900"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            {canActivate
              ? "Ready for live activation."
              : "Owner, bank, and ownership proof must be verified first."}
          </div>
        </div>
        {feedback ? (
          <div
            role="status"
            className={`rounded-md border px-3 py-2 text-sm ${
              feedback.isError
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {feedback.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
