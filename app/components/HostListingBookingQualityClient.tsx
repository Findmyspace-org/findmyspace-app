"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  ListingBookingRequirements,
  ListingIntelCategory,
  mapSpaceTypeToIntelCategory,
  mergeQuestionnaireData,
  upsertListingBookingIntelTables,
} from "@/lib/booking-intelligence";
import {
  ListingBookingQualityFormFields,
  ListingQualityScoreSummary,
} from "@/app/components/listing-booking-quality-ui";
import { Loader2 } from "lucide-react";

type Props = {
  spaceId: string;
};

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
  const [persistError, setPersistError] = useState<string | null>(null);
  /** `listing_booking_requirements` row exists (DB) — one listing-quality section signal. */
  const [renterRequirementsCommitted, setRenterRequirementsCommitted] = useState(false);
  const [featureAttributes, setFeatureAttributes] = useState<Record<string, string[]>>({});
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listingQualityOptions = useMemo(
    () => ({
      renterRequirementsCommitted,
      spaceType,
      featureAttributes,
    }),
    [renterRequirementsCommitted, spaceType, featureAttributes]
  );

  const persist = useCallback(async () => {
    if (!spaceId || skipSaveRef.current) return;
    setSaving(true);
    setPersistError(null);
    try {
      const { questionnaireError, requirementsError } = await upsertListingBookingIntelTables(
        supabase as any,
        {
          spaceId,
          spaceType,
          questionnaireData: data,
          requirements,
        }
      );
      if (questionnaireError) {
        console.error("[FindMySpace] listing_questionnaires upsert failed:", questionnaireError);
        setPersistError(questionnaireError);
        return;
      }
      if (requirementsError) {
        console.error("[FindMySpace] listing_booking_requirements upsert failed:", requirementsError);
        setPersistError(
          requirementsError ||
            "Could not save renter requirements. Check table GRANTs and RLS (host must own the listing)."
        );
        return;
      }

      setLastSaved(new Date());
      setRenterRequirementsCommitted(true);
    } catch (e) {
      console.error("[FindMySpace] booking quality save:", e);
      setPersistError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [spaceId, spaceType, data, requirements]);

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

      const [{ data: qRow }, { data: reqRow }, { data: attrRows }] = await Promise.all([
        (supabase.from("listing_questionnaires" as never) as any)
          .select("data, category")
          .eq("space_id", spaceId)
          .maybeSingle(),
        (supabase.from("listing_booking_requirements" as never) as any)
          .select("*")
          .eq("space_id", spaceId)
          .maybeSingle(),
        supabase.from("space_attributes").select("attribute_key, attribute_value").eq("space_id", spaceId),
      ]);

      if (cancelled) return;

      const grouped: Record<string, string[]> = {};
      for (const r of (attrRows || []) as {
        attribute_key: string;
        attribute_value: string | null;
      }[]) {
        if (!r.attribute_value) continue;
        if (!grouped[r.attribute_key]) grouped[r.attribute_key] = [];
        grouped[r.attribute_key].push(r.attribute_value);
      }
      setFeatureAttributes(grouped);

      const merged = mergeQuestionnaireData(cat, (qRow?.data as Record<string, unknown>) || {});
      setData(merged);

      if (reqRow) {
        setRenterRequirementsCommitted(true);
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
        setRenterRequirementsCommitted(false);
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

  return (
    <div className="space-y-6">
      {persistError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900 shadow-sm"
          role="alert"
        >
          <p className="font-medium">Could not save changes</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">{persistError}</p>
        </div>
      ) : null}

      <div>
        <ListingQualityScoreSummary
          intelCategory={intelCategory}
          data={data}
          listingQualityOptions={listingQualityOptions}
          spaceTypeLabel={spaceType ? `Category: ${spaceType}` : "Category: general"}
        />
        <p className="mt-2 text-right text-xs text-gray-500">
          {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : "Changes save automatically"}
        </p>
      </div>

      <ListingBookingQualityFormFields
        intelCategory={intelCategory}
        questionnaireData={data}
        onPatchSection={patchSection}
        onPatchRoot={patchRoot}
        requirements={requirements}
        onRequirementsChange={setRequirements}
        renterRequirementsSubtitle="Hosts who ask for the right details get fewer back-and-forth messages."
        spaceType={spaceType ?? undefined}
      />

      <p className="text-center text-xs text-gray-500">
        {/* TODO: AI assistant integration — summarize questionnaire into host-facing tips. */}
        You can return anytime — progress is saved automatically.
      </p>
    </div>
  );
}
