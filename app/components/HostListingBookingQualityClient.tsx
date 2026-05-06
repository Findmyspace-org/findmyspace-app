"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  computeListingQualityPercent,
  DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  ListingBookingRequirements,
  ListingIntelCategory,
  mapSpaceTypeToIntelCategory,
  mergeQuestionnaireData,
} from "@/lib/booking-intelligence";
import { ChevronDown, Loader2 } from "lucide-react";

type Props = {
  spaceId: string;
};

function SectionCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-[#e2e8f0] bg-white shadow-sm open:ring-1 open:ring-[#192a3a]/10"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-semibold text-[#192a3a]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p> : null}
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-[#eef2f6] px-5 py-4">{children}</div>
    </details>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e2e8f0] bg-[#fbfcfd] px-3 py-2.5 text-sm text-[#192a3a] transition hover:bg-[#f4f7f9]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span>{label}</span>
    </label>
  );
}

export default function HostListingBookingQualityClient({ spaceId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [spaceType, setSpaceType] = useState<string | null>(null);
  const [intelCategory, setIntelCategory] = useState<ListingIntelCategory>("storage");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [requirements, setRequirements] = useState<ListingBookingRequirements>(
    DEFAULT_LISTING_BOOKING_REQUIREMENTS
  );
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quality = useMemo(
    () => computeListingQualityPercent(intelCategory, data),
    [intelCategory, data]
  );

  const persist = useCallback(async () => {
    if (!spaceId || skipSaveRef.current) return;
    setSaving(true);
    try {
      const { error: qErr } = await (supabase.from("listing_questionnaires" as never) as any).upsert(
        {
          space_id: spaceId,
          category: intelCategory,
          data,
        },
        { onConflict: "space_id" }
      );
      if (qErr) throw qErr;

      const { error: rErr } = await (supabase.from("listing_booking_requirements" as never) as any).upsert(
        {
          space_id: spaceId,
          ...requirements,
        },
        { onConflict: "space_id" }
      );
      if (rErr) throw rErr;

      setLastSaved(new Date());
    } catch (e) {
      console.error("booking quality save:", e);
    } finally {
      setSaving(false);
    }
  }, [spaceId, intelCategory, data, requirements]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setForbidden(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/list-your-space?next=/spaces/${spaceId}/booking-quality`);
        return;
      }

      const { data: spaceRow, error: spaceErr } = await supabase
        .from("spaces")
        .select("owner_id, space_type")
        .eq("id", spaceId)
        .maybeSingle();

      if (spaceErr || !spaceRow) {
        if (!cancelled) setForbidden(true);
        return;
      }

      const row = spaceRow as { owner_id: string; space_type: string | null };
      if (row.owner_id !== user.id) {
        if (!cancelled) setForbidden(true);
        return;
      }

      const cat = mapSpaceTypeToIntelCategory(row.space_type);
      if (!cancelled) {
        setSpaceType(row.space_type);
        setIntelCategory(cat);
      }

      const [{ data: qRow }, { data: reqRow }] = await Promise.all([
        (supabase.from("listing_questionnaires" as never) as any)
          .select("data, category")
          .eq("space_id", spaceId)
          .maybeSingle(),
        (supabase.from("listing_booking_requirements" as never) as any)
          .select("*")
          .eq("space_id", spaceId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const merged = mergeQuestionnaireData(cat, (qRow?.data as Record<string, unknown>) || {});
      setData(merged);

      if (reqRow) {
        setRequirements({
          require_item_type: Boolean(reqRow.require_item_type),
          require_dimensions: Boolean(reqRow.require_dimensions),
          require_photos: Boolean(reqRow.require_photos),
          require_vehicle_details: Boolean(reqRow.require_vehicle_details),
          require_access_frequency: Boolean(reqRow.require_access_frequency),
          require_estimated_value: Boolean(reqRow.require_estimated_value),
          require_notes: Boolean(reqRow.require_notes),
        });
      } else {
        setRequirements({ ...DEFAULT_LISTING_BOOKING_REQUIREMENTS });
      }

      skipSaveRef.current = true;
      setLoading(false);
      requestAnimationFrame(() => {
        skipSaveRef.current = false;
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [spaceId, router]);

  useEffect(() => {
    if (loading || skipSaveRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist();
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data, requirements, loading, persist]);

  function patchSection(
    section: string,
    patch: Record<string, unknown>
  ) {
    setData((prev) => ({
      ...prev,
      [section]: {
        ...((prev[section] as Record<string, unknown>) || {}),
        ...patch,
      },
    }));
  }

  function patchRoot(patch: Record<string, unknown>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  if (forbidden) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-6 text-[#192a3a] shadow-sm">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-gray-600">You can only update your own listings.</p>
        <Link href="/dashboard/listings" className="mt-4 inline-block text-sm font-medium text-[#192a3a] underline">
          Back to listings
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white p-8 text-sm text-gray-600 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-[#192a3a]" aria-hidden />
        Loading booking quality tools…
      </div>
    );
  }

  const storageAccess = (data.access as Record<string, boolean>) || {};
  const storageSecurity = (data.security as Record<string, boolean>) || {};
  const storageEnv = (data.environment as Record<string, unknown>) || {};
  const storageDims = (data.dimensions_cm as Record<string, unknown>) || {};
  const storageRestrictions = (data.restrictions as Record<string, boolean>) || {};

  const parkingVehicles = (data.vehicle_types as Record<string, boolean>) || {};
  const parkingLimits = (data.limits_m as Record<string, unknown>) || {};
  const parkingAccess = (data.access as Record<string, boolean>) || {};

  const officeLayout = (data.layout_styles as Record<string, boolean>) || {};
  const officeAmenities = (data.amenities as Record<string, boolean>) || {};

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#e2e8f0] bg-gradient-to-b from-[#f8fafb] to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Listing quality</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-[#192a3a]">{quality.percent}%</p>
            <p className="mt-1 text-sm text-gray-600">
              Detailed listings receive better booking matches.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {quality.answered} of {quality.total} structured signals completed ·{" "}
              {spaceType ? `Category: ${spaceType}` : "Category: general"}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="h-2 w-full min-w-[200px] overflow-hidden rounded-full bg-[#e2e8f0] sm:w-56">
              <div
                className="h-full rounded-full bg-[#192a3a] transition-all"
                style={{ width: `${quality.percent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : "Changes save automatically"}
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        title="What should renters provide before requesting a booking?"
        subtitle="Hosts who ask for the right details get fewer back-and-forth messages."
        defaultOpen
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label="What they want to store, park, or use"
            checked={requirements.require_item_type}
            onChange={(v) => setRequirements((r) => ({ ...r, require_item_type: v }))}
          />
          <ToggleRow
            label="Dimensions"
            checked={requirements.require_dimensions}
            onChange={(v) => setRequirements((r) => ({ ...r, require_dimensions: v }))}
          />
          <ToggleRow
            label="Photos"
            checked={requirements.require_photos}
            onChange={(v) => setRequirements((r) => ({ ...r, require_photos: v }))}
          />
          <ToggleRow
            label="Vehicle details"
            checked={requirements.require_vehicle_details}
            onChange={(v) => setRequirements((r) => ({ ...r, require_vehicle_details: v }))}
          />
          <ToggleRow
            label="Estimated value"
            checked={requirements.require_estimated_value}
            onChange={(v) => setRequirements((r) => ({ ...r, require_estimated_value: v }))}
          />
          <ToggleRow
            label="Access frequency"
            checked={requirements.require_access_frequency}
            onChange={(v) => setRequirements((r) => ({ ...r, require_access_frequency: v }))}
          />
          <ToggleRow
            label="Additional notes"
            checked={requirements.require_notes}
            onChange={(v) => setRequirements((r) => ({ ...r, require_notes: v }))}
          />
        </div>
      </SectionCard>

      {intelCategory === "storage" && (
        <>
          <SectionCard title="Access" defaultOpen>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="24/7 access"
                checked={Boolean(storageAccess.full_247)}
                onChange={(v) => patchSection("access", { full_247: v })}
              />
              <ToggleRow
                label="Appointment required"
                checked={Boolean(storageAccess.appointment_required)}
                onChange={(v) => patchSection("access", { appointment_required: v })}
              />
              <ToggleRow
                label="Vehicle access"
                checked={Boolean(storageAccess.vehicle_access)}
                onChange={(v) => patchSection("access", { vehicle_access: v })}
              />
              <ToggleRow
                label="Loading access"
                checked={Boolean(storageAccess.loading_access)}
                onChange={(v) => patchSection("access", { loading_access: v })}
              />
            </div>
          </SectionCard>

          <SectionCard title="Security">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="CCTV" checked={Boolean(storageSecurity.cctv)} onChange={(v) => patchSection("security", { cctv: v })} />
              <ToggleRow label="Guarded" checked={Boolean(storageSecurity.guarded)} onChange={(v) => patchSection("security", { guarded: v })} />
              <ToggleRow label="Alarm" checked={Boolean(storageSecurity.alarm)} onChange={(v) => patchSection("security", { alarm: v })} />
              <ToggleRow label="Lockable" checked={Boolean(storageSecurity.lockable)} onChange={(v) => patchSection("security", { lockable: v })} />
            </div>
          </SectionCard>

          <SectionCard title="Environment">
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Indoor / outdoor</p>
              <div className="flex flex-wrap gap-2">
                {(["indoor", "outdoor", "both"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      patchSection("environment", {
                        indoor_outdoor: storageEnv.indoor_outdoor === opt ? "" : opt,
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      storageEnv.indoor_outdoor === opt
                        ? "bg-[#192a3a] text-white"
                        : "border border-[#e2e8f0] bg-white text-[#192a3a] hover:bg-[#f8fafb]"
                    }`}
                  >
                    {opt === "both" ? "Indoor & outdoor" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="Covered" checked={Boolean(storageEnv.covered)} onChange={(v) => patchSection("environment", { covered: v })} />
              <ToggleRow label="Ventilated" checked={Boolean(storageEnv.ventilated)} onChange={(v) => patchSection("environment", { ventilated: v })} />
              <ToggleRow label="Dry storage" checked={Boolean(storageEnv.dry_storage)} onChange={(v) => patchSection("environment", { dry_storage: v })} />
              <ToggleRow
                label="Climate controlled"
                checked={Boolean(storageEnv.climate_controlled)}
                onChange={(v) => patchSection("environment", { climate_controlled: v })}
              />
            </div>
          </SectionCard>

          <SectionCard title="Dimensions (cm)">
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
                    className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                  />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Restrictions">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="No chemicals" checked={Boolean(storageRestrictions.no_chemicals)} onChange={(v) => patchSection("restrictions", { no_chemicals: v })} />
              <ToggleRow label="No perishables" checked={Boolean(storageRestrictions.no_perishables)} onChange={(v) => patchSection("restrictions", { no_perishables: v })} />
              <ToggleRow label="No flammables" checked={Boolean(storageRestrictions.no_flammables)} onChange={(v) => patchSection("restrictions", { no_flammables: v })} />
              <ToggleRow label="No vehicles" checked={Boolean(storageRestrictions.no_vehicles)} onChange={(v) => patchSection("restrictions", { no_vehicles: v })} />
            </div>
          </SectionCard>
        </>
      )}

      {intelCategory === "parking" && (
        <>
          <SectionCard title="Vehicle types allowed" defaultOpen>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["car", "Car"],
                  ["suv", "SUV"],
                  ["boat", "Boat"],
                  ["trailer", "Trailer"],
                  ["caravan", "Caravan"],
                  ["motorcycle", "Motorcycle"],
                ] as const
              ).map(([key, label]) => (
                <ToggleRow
                  key={key}
                  label={label}
                  checked={Boolean(parkingVehicles[key])}
                  onChange={(v) => patchSection("vehicle_types", { [key]: v })}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Restrictions (metres)">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Height limit</label>
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
                  className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Length limit</label>
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
                  className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Access">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="Covered" checked={Boolean(parkingAccess.covered)} onChange={(v) => patchSection("access", { covered: v })} />
              <ToggleRow label="Remote gate" checked={Boolean(parkingAccess.remote_gate)} onChange={(v) => patchSection("access", { remote_gate: v })} />
              <ToggleRow label="24/7 access" checked={Boolean(parkingAccess.full_247)} onChange={(v) => patchSection("access", { full_247: v })} />
            </div>
          </SectionCard>
        </>
      )}

      {intelCategory === "office_event" && (
        <>
          <SectionCard title="Capacity & layout" defaultOpen>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">Capacity (people)</label>
              <input
                type="number"
                min={0}
                value={data.capacity_people != null ? String(data.capacity_people) : ""}
                onChange={(e) =>
                  patchRoot({
                    capacity_people: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-full max-w-xs rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
              />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Layout styles</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["theatre", "Theatre"],
                  ["classroom", "Classroom"],
                  ["boardroom", "Boardroom"],
                  ["banquet", "Banquet"],
                  ["open_plan", "Open plan"],
                ] as const
              ).map(([key, label]) => (
                <ToggleRow
                  key={key}
                  label={label}
                  checked={Boolean(officeLayout[key])}
                  onChange={(v) => patchSection("layout_styles", { [key]: v })}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Amenities & operations">
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="Wi‑Fi" checked={Boolean(officeAmenities.wifi)} onChange={(v) => patchSection("amenities", { wifi: v })} />
              <ToggleRow label="AV equipment" checked={Boolean(officeAmenities.av_equipment)} onChange={(v) => patchSection("amenities", { av_equipment: v })} />
              <ToggleRow label="Kitchen" checked={Boolean(officeAmenities.kitchen)} onChange={(v) => patchSection("amenities", { kitchen: v })} />
              <ToggleRow label="Restrooms" checked={Boolean(officeAmenities.restrooms)} onChange={(v) => patchSection("amenities", { restrooms: v })} />
              <ToggleRow
                label="Wheelchair access"
                checked={Boolean(officeAmenities.wheelchair_access)}
                onChange={(v) => patchSection("amenities", { wheelchair_access: v })}
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Noise level</label>
                <select
                  value={(data.noise_level as string) || ""}
                  onChange={(e) => patchRoot({ noise_level: e.target.value })}
                  className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                >
                  <option value="">Select…</option>
                  <option value="quiet">Quiet</option>
                  <option value="moderate">Moderate</option>
                  <option value="lively">Lively</option>
                </select>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Parking on site"
                checked={data.parking_available === true}
                onChange={(v) => patchRoot({ parking_available: v ? true : false })}
              />
              <ToggleRow
                label="Alcohol allowed (where legal)"
                checked={data.alcohol_allowed === true}
                onChange={(v) => patchRoot({ alcohol_allowed: v ? true : false })}
              />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">Setup / teardown notes</label>
              <textarea
                value={(data.setup_teardown_notes as string) || ""}
                onChange={(e) => patchRoot({ setup_teardown_notes: e.target.value })}
                rows={3}
                className="w-full rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                placeholder="Load-in windows, staffing, restrictions…"
              />
            </div>
          </SectionCard>
        </>
      )}

      <p className="text-center text-xs text-gray-500">
        {/* TODO: AI assistant integration — summarize questionnaire into host-facing tips. */}
        You can return anytime — progress is saved automatically.
      </p>
    </div>
  );
}
