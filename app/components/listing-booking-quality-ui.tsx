"use client";

import { useMemo } from "react";
import {
  computeListingQualityPercent,
  getMissingListingQualitySignalLabels,
  ListingBookingRequirements,
  ListingIntelCategory,
  ListingQualityOptions,
  renterRequirementKeysForCategory,
  RENTER_REQUIREMENT_LABELS,
} from "@/lib/booking-intelligence";
import { HelpCircle } from "lucide-react";

/** Inner section card — matches `SpaceCategoryFields` rhythm. */
function BqSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e8edf2] bg-[#f8fafc] p-3 md:p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{title}</p>
      {children}
    </div>
  );
}

function BqCheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-transparent px-2 py-1.5 text-sm text-[#334155] transition hover:border-[#e2e8f0] hover:bg-white">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d4dbe2] text-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

const LISTING_QUALITY_HELP =
  "Score includes Features & amenities, booking details below, and saved renter requirements. Sections count — not every checkbox.";

export function ListingQualityScoreSummary({
  intelCategory,
  data,
  listingQualityOptions,
  spaceTypeLabel,
  compact = false,
  footerHint,
}: {
  intelCategory: ListingIntelCategory;
  data: Record<string, unknown>;
  listingQualityOptions: ListingQualityOptions;
  spaceTypeLabel?: string | null;
  compact?: boolean;
  footerHint?: string | null;
}) {
  const quality = useMemo(
    () => computeListingQualityPercent(intelCategory, data, listingQualityOptions),
    [intelCategory, data, listingQualityOptions]
  );

  const missingQualityLabels = useMemo(
    () => getMissingListingQualitySignalLabels(intelCategory, data, listingQualityOptions),
    [intelCategory, data, listingQualityOptions]
  );

  return (
    <div
      className={`rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${compact ? "p-3 sm:p-4" : "p-4 md:p-5"}`}
    >
      <div className="border-b border-[#e5e7eb] pb-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
          Listing quality
          <span
            className="inline-flex cursor-help text-gray-400 normal-case"
            title={LISTING_QUALITY_HELP}
            aria-label={LISTING_QUALITY_HELP}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          </span>
        </p>
        <p
          className={`mt-1 font-semibold tabular-nums text-[#0f172a] ${compact ? "text-2xl" : "text-3xl"}`}
        >
          {quality.percent}%
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
          Stronger listings get better-matched booking requests.
        </p>
        <p className="mt-2 text-xs text-[#64748b]">
          {quality.answered} of {quality.total} quality areas
          {spaceTypeLabel ? ` · ${spaceTypeLabel}` : ""}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]">
          <div
            className="h-full rounded-full bg-[#c1121f] transition-all duration-500"
            style={{ width: `${quality.percent}%` }}
          />
        </div>
      </div>

      {quality.percent < 100 && quality.total > 0 && missingQualityLabels.length > 0 ? (
        <div className="mt-4 border-t border-[#e5e7eb] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748b]">Still to complete</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-snug text-[#334155]">
            {missingQualityLabels.map((label, idx) => (
              <li key={`${idx}-${label}`}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {footerHint ? <p className="mt-3 text-xs text-gray-500">{footerHint}</p> : null}
    </div>
  );
}

export type ListingBookingQualityFormFieldsProps = {
  intelCategory: ListingIntelCategory;
  questionnaireData: Record<string, unknown>;
  onPatchSection: (section: string, patch: Record<string, unknown>) => void;
  onPatchRoot: (patch: Record<string, unknown>) => void;
  requirements: ListingBookingRequirements;
  onRequirementsChange: (next: ListingBookingRequirements) => void;
  renterRequirementsSubtitle?: string;
  /** Omit outer card — parent provides the surface (e.g. unified listing step). */
  embedded?: boolean;
  /** When event_space, Suitable for lives in Features & amenities only. */
  spaceType?: string | null;
};

export function ListingBookingQualityFormFields({
  intelCategory,
  questionnaireData: data,
  onPatchSection: patchSection,
  onPatchRoot: patchRoot,
  requirements,
  onRequirementsChange: setRequirements,
  renterRequirementsSubtitle = "Better details help you approve the right requests faster.",
  embedded = false,
  spaceType = null,
}: ListingBookingQualityFormFieldsProps) {
  const hideUseSuitability =
    spaceType === "event_space" && intelCategory === "office_event";
  const renterKeys = renterRequirementKeysForCategory(intelCategory);

  const storageAccess = (data.access as Record<string, boolean>) || {};
  const storageSuit = (data.storage_suitability as Record<string, boolean>) || {};
  const storageDims = (data.dimensions_cm as Record<string, unknown>) || {};
  const storageRestrictions = (data.restrictions as Record<string, boolean>) || {};

  const parkingLimits = (data.limits_m as Record<string, unknown>) || {};

  const capAccess = (data.capacity_access as Record<string, unknown>) || {};
  const useSuit = (data.use_suitability as Record<string, boolean>) || {};
  const opNotes = (data.operations_notes as Record<string, string>) || {
    load_in: "",
    setup: "",
    cleanup: "",
    house_rules: "",
  };

  const fieldsInner = (
    <div className="space-y-3">
      <div className="space-y-3">
        <BqSection title="What should renters provide on request?">
          <p className="mb-3 text-xs text-gray-600">{renterRequirementsSubtitle}</p>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {renterKeys.map((key) => (
              <BqCheckboxRow
                key={key}
                label={RENTER_REQUIREMENT_LABELS[key]}
                checked={Boolean(requirements[key])}
                onChange={(v) => setRequirements({ ...requirements, [key]: v })}
              />
            ))}
          </div>
        </BqSection>

        {intelCategory === "storage" && (
          <>
            <BqSection title="Storage suitability">
              <p className="mb-3 text-xs text-gray-600">What kinds of stored items are a good fit (not duplicate of amenity type).</p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["household_goods", "Household goods"],
                    ["furniture", "Furniture"],
                    ["business_stock", "Business stock"],
                    ["equipment_tools", "Equipment / tools"],
                    ["boxes", "Boxes / loose items"],
                    ["seasonal_items", "Seasonal items"],
                  ] as const
                ).map(([k, label]) => (
                  <BqCheckboxRow
                    key={k}
                    label={label}
                    checked={Boolean(storageSuit[k])}
                    onChange={(v) => patchSection("storage_suitability", { [k]: v })}
                  />
                ))}
              </div>
            </BqSection>

            <BqSection title="Access & restrictions">
              <p className="mb-3 text-xs text-gray-600">
                Operational access and rules — use Features &amp; amenities for CCTV, 24/7, lockable, climate, etc.
              </p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                <BqCheckboxRow
                  label="Loading / forklift access"
                  checked={Boolean(storageAccess.loading_access)}
                  onChange={(v) => patchSection("access", { loading_access: v })}
                />
                <BqCheckboxRow
                  label="Appointment required for access"
                  checked={Boolean(storageAccess.appointment_required)}
                  onChange={(v) => patchSection("access", { appointment_required: v })}
                />
                <BqCheckboxRow
                  label="Vehicle can reach the unit"
                  checked={Boolean(storageAccess.vehicle_access)}
                  onChange={(v) => patchSection("access", { vehicle_access: v })}
                />
                <BqCheckboxRow
                  label="Frequent access is OK"
                  checked={Boolean(storageAccess.frequent_access_ok)}
                  onChange={(v) => patchSection("access", { frequent_access_ok: v })}
                />
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Restrictions</p>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                <BqCheckboxRow
                  label="Hazardous / chemical storage not allowed"
                  checked={Boolean(storageRestrictions.no_chemicals)}
                  onChange={(v) => patchSection("restrictions", { no_chemicals: v })}
                />
                <BqCheckboxRow
                  label="No perishables"
                  checked={Boolean(storageRestrictions.no_perishables)}
                  onChange={(v) => patchSection("restrictions", { no_perishables: v })}
                />
                <BqCheckboxRow
                  label="No flammables"
                  checked={Boolean(storageRestrictions.no_flammables)}
                  onChange={(v) => patchSection("restrictions", { no_flammables: v })}
                />
                <BqCheckboxRow
                  label="No vehicles stored"
                  checked={Boolean(storageRestrictions.no_vehicles)}
                  onChange={(v) => patchSection("restrictions", { no_vehicles: v })}
                />
              </div>
            </BqSection>

            <BqSection title="Exact size (cm)">
              <p className="mb-3 text-xs text-gray-600">
                Optional exact dimensions for matching — amenity “size band” still counts toward quality if you skip this.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["width_cm", "length_cm", "height_cm"] as const).map((key) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      {key === "width_cm" ? "Width" : key === "length_cm" ? "Length" : "Height"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={storageDims[key] != null ? String(storageDims[key]) : ""}
                      onChange={(e) =>
                        patchSection("dimensions_cm", {
                          [key]: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                    />
                  </div>
                ))}
              </div>
            </BqSection>

            <BqSection title="Operational notes">
              <p className="mb-3 text-xs text-gray-600">Access instructions, restrictions, or security expectations for approved renters.</p>
              <textarea
                value={(data.operational_notes as string) || ""}
                onChange={(e) => patchRoot({ operational_notes: e.target.value })}
                rows={4}
                className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                placeholder="e.g. Gate code after approval, escorted access, what to avoid…"
              />
            </BqSection>
          </>
        )}

        {intelCategory === "parking" && (
          <>
            <BqSection title="Vehicle suitability">
              <p className="mb-3 text-xs text-gray-600">
                Set vehicle types under <strong>Features &amp; amenities</strong> (Vehicle suitability). This avoids duplicate
                lists — quality score uses that section.
              </p>
            </BqSection>

            <BqSection title="Bay count & size limits">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Number of bays (optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={data.parking_bays != null ? String(data.parking_bays) : ""}
                    onChange={(e) =>
                      patchRoot({
                        parking_bays:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Height limit (m)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={parkingLimits.height_limit_m != null ? String(parkingLimits.height_limit_m) : ""}
                    onChange={(e) =>
                      patchSection("limits_m", {
                        height_limit_m: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Length limit (m)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={parkingLimits.length_limit_m != null ? String(parkingLimits.length_limit_m) : ""}
                    onChange={(e) =>
                      patchSection("limits_m", {
                        length_limit_m: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-600">
                Covered, gated, 24/7, and security live under Features &amp; amenities.
              </p>
            </BqSection>

            <BqSection title="Operational notes">
              <textarea
                value={(data.operational_notes as string) || ""}
                onChange={(e) => patchRoot({ operational_notes: e.target.value })}
                rows={4}
                className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                placeholder="Access instructions, restrictions, or what renters should know before arrival…"
              />
            </BqSection>
          </>
        )}

        {intelCategory === "office_event" && (
          <>
            <BqSection title="Group size & access">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Minimum Group Size</label>
                  <input
                    type="number"
                    min={1}
                    value={data.min_group_size != null ? String(data.min_group_size) : ""}
                    onChange={(e) =>
                      patchRoot({
                        min_group_size: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Maximum Group Size</label>
                  <input
                    type="number"
                    min={1}
                    value={data.max_group_size != null ? String(data.max_group_size) : ""}
                    onChange={(e) =>
                      patchRoot({
                        max_group_size: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                  <p className="mt-1 text-xs text-gray-500">Example: 10 to 80 people</p>
                </div>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Parking bays on site (optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={
                      capAccess.parking_bays != null && capAccess.parking_bays !== ""
                        ? String(capAccess.parking_bays)
                        : ""
                    }
                    onChange={(e) =>
                      patchRoot({
                        capacity_access: {
                          ...capAccess,
                          parking_bays:
                            e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
              </div>
              <p className="mb-2 text-xs text-gray-600">
                Weekend and building access: set under Features &amp; amenities where possible. Use this for after-hours
                expectations for bookings.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">After-hours access</label>
                <select
                  value={
                    capAccess.after_hours_access === true
                      ? "yes"
                      : capAccess.after_hours_access === false
                        ? "no"
                        : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    patchRoot({
                      capacity_access: {
                        ...capAccess,
                        after_hours_access: v === "yes" ? true : v === "no" ? false : null,
                      },
                    });
                  }}
                  className="w-full max-w-md min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                >
                  <option value="">Select if relevant…</option>
                  <option value="yes">Available by arrangement</option>
                  <option value="no">Not typically available</option>
                </select>
              </div>
            </BqSection>

            {hideUseSuitability ? (
              <BqSection title="Suitable for">
                <p className="text-xs text-gray-600">
                  Suitable for options are set under <strong>Features &amp; amenities</strong>.
                </p>
              </BqSection>
            ) : (
              <BqSection title="Use & suitability">
                <p className="mb-3 text-xs text-gray-600">
                  What the space is well suited for — Wi‑Fi, AV, and wheelchair access stay in Features &amp; amenities.
                </p>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["meetings", "Meetings"],
                      ["workshops", "Workshops"],
                      ["training", "Training"],
                      ["small_events", "Small events"],
                      ["photography_content", "Photography / content"],
                      ["noise_sensitive", "Noise-sensitive use"],
                      ["catering_allowed", "Catering allowed"],
                      ["alcohol_where_legal", "Alcohol (where legal)"],
                    ] as const
                  ).map(([k, label]) => (
                    <BqCheckboxRow
                      key={k}
                      label={label}
                      checked={Boolean(useSuit[k])}
                      onChange={(v) => patchSection("use_suitability", { [k]: v })}
                    />
                  ))}
                </div>
              </BqSection>
            )}

            <BqSection title="Setup & operational notes">
              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Load-in instructions</label>
                  <textarea
                    value={opNotes.load_in || ""}
                    onChange={(e) =>
                      patchRoot({
                        operations_notes: { ...opNotes, load_in: e.target.value },
                      })
                    }
                    rows={2}
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Setup expectations</label>
                  <textarea
                    value={opNotes.setup || ""}
                    onChange={(e) =>
                      patchRoot({
                        operations_notes: { ...opNotes, setup: e.target.value },
                      })
                    }
                    rows={2}
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Cleanup requirements</label>
                  <textarea
                    value={opNotes.cleanup || ""}
                    onChange={(e) =>
                      patchRoot({
                        operations_notes: { ...opNotes, cleanup: e.target.value },
                      })
                    }
                    rows={2}
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">House rules</label>
                  <textarea
                    value={opNotes.house_rules || ""}
                    onChange={(e) =>
                      patchRoot({
                        operations_notes: { ...opNotes, house_rules: e.target.value },
                      })
                    }
                    rows={2}
                    className="w-full min-h-[40px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                  />
                </div>
              </div>
            </BqSection>
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return fieldsInner;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
      {fieldsInner}
    </div>
  );
}
