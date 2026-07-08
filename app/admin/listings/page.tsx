"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { isLiveListingStatus, needsReviewWorkflow } from "@/lib/admin-listing-routing";
import { isValidUuid } from "@/lib/utils";
import { type SpaceContentDraft } from "@/app/components/admin/MarketplaceSpaceQuickEditPanel";
import {
  MarketplaceSpacesTable,
  type MarketplaceListingRecord,
  type MarketplaceSpaceRow,
} from "@/app/components/admin/MarketplaceSpacesTable";

type AdminProfileRow = {
  role: string | null;
};

type DepositType = "none" | "one_month" | "two_months" | null;

type OwnerProfileRow = {
  id: string;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

export default function AdminListingsPage() {
  return (
    <Suspense fallback={<main className="p-8 text-gray-600">Loading…</main>}>
      <AdminListingsPageContent />
    </Suspense>
  );
}

function AdminListingsPageContent() {
  const searchParams = useSearchParams();
  const focusSpaceId = searchParams.get("space");
  const [role, setRole] = useState<string | null>(null);
  const [records, setRecords] = useState<MarketplaceListingRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null);
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [contentDrafts, setContentDrafts] = useState<Record<string, SpaceContentDraft>>({});
  const [savingContentId, setSavingContentId] = useState<string | null>(null);
  /** Shown next to Save content so feedback is visible when the row is scrolled down. */
  const [contentSaveFeedback, setContentSaveFeedback] = useState<{
    spaceId: string;
    text: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    loadListings();
  }, []);

  async function loadListings() {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    const { data: rawAdminProfile, error: adminProfileError } = await (supabase
      .from("profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single();

    const adminProfile = rawAdminProfile as AdminProfileRow | null;

    if (adminProfileError) {
      setMessage(adminProfileError.message);
      setLoading(false);
      return;
    }

    if (!hasAdminUiAccess(adminProfile?.role)) {
      setRole("user");
      setLoading(false);
      return;
    }

    setRole("admin");

    const { data: rawSpaces, error: spacesError } = await (supabase
      .from("spaces") as any)
      .select(
        "id, owner_id, title, description, city, suburb, address_line_1, space_type, booking_unit, price_per_hour, price_per_day, price_per_month, price_unit, price_amount, min_booking_hours, min_booking_days, min_booking_months, min_group_size, max_group_size, status, public_listing_mode, is_bookable, ownership_proof_status, platform_fee_percent, deposit_type, deposit_months, monthly_payment_day, property_id, crm_organisation_id, created_at"
      )
      .order("created_at", { ascending: false });

    if (spacesError) {
      setMessage(spacesError.message);
      setLoading(false);
      return;
    }

    const spaces = (rawSpaces || []) as MarketplaceSpaceRow[];
    const spaceIds = spaces.map((space) => space.id);
    const ownerIds = Array.from(
      new Set(
        spaces
          .map((space) => space.owner_id)
          .filter((id): id is string => isValidUuid(id))
      )
    );
    const propertyIds = Array.from(
      new Set(
        spaces
          .map((space) => space.property_id)
          .filter((id): id is string => isValidUuid(id))
      )
    );

    const imageMap = new Map<string, string>();
    const propertyMap = new Map<string, string>();
    const enquiryCounts = new Map<string, number>();

    if (spaceIds.length > 0) {
      const { data: imagesData, error: imagesError } = await supabase
        .from("space_images")
        .select("space_id, image_url, sort_order")
        .in("space_id", spaceIds)
        .order("sort_order", { ascending: true });

      if (imagesError) {
        setMessage(imagesError.message);
        setLoading(false);
        return;
      }

      for (const image of (imagesData || []) as {
        space_id: string;
        image_url: string;
      }[]) {
        if (!imageMap.has(image.space_id)) {
          imageMap.set(image.space_id, image.image_url);
        }
      }

      const { data: enquiryRows, error: enquiryError } = await supabase
        .from("listing_enquiries")
        .select("listing_id")
        .in("listing_id", spaceIds);

      if (enquiryError) {
        setMessage(enquiryError.message);
        setLoading(false);
        return;
      }

      for (const row of (enquiryRows || []) as { listing_id: string }[]) {
        enquiryCounts.set(
          row.listing_id,
          (enquiryCounts.get(row.listing_id) || 0) + 1
        );
      }
    }

    if (propertyIds.length > 0) {
      const { data: propertyRows, error: propertiesError } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds);

      if (propertiesError) {
        setMessage(propertiesError.message);
        setLoading(false);
        return;
      }

      for (const row of (propertyRows || []) as { id: string; name: string }[]) {
        propertyMap.set(row.id, row.name);
      }
    }

    let ownerProfilesMap = new Map<string, OwnerProfileRow>();

    if (ownerIds.length > 0) {
      const { data: rawOwnerProfiles, error: ownerProfilesError } = await (supabase
        .from("profiles") as any)
        .select(
          "id, owner_verification_status, bank_verification_status, first_name, last_name, email"
        )
        .in("id", ownerIds);

      if (ownerProfilesError) {
        setMessage(ownerProfilesError.message);
        setLoading(false);
        return;
      }

      ownerProfilesMap = new Map(
        ((rawOwnerProfiles || []) as OwnerProfileRow[]).map((profile) => [
          profile.id,
          profile,
        ])
      );
    }

    const merged: MarketplaceListingRecord[] = spaces.map((space) => {
      const ownerProfile = isValidUuid(space.owner_id)
        ? ownerProfilesMap.get(space.owner_id) || null
        : null;

      const canActivate =
        Boolean(space.owner_id) &&
        ownerProfile?.owner_verification_status === "verified" &&
        ownerProfile?.bank_verification_status === "verified" &&
        space.ownership_proof_status === "verified";

      const enrichedSpace: MarketplaceSpaceRow = {
        ...space,
        cover_image_url: imageMap.get(space.id) || null,
        property_name: isValidUuid(space.property_id)
          ? propertyMap.get(space.property_id) || null
          : null,
        enquiry_count: enquiryCounts.get(space.id) || 0,
      };

      return {
        space: enrichedSpace,
        ownerProfile,
        canActivate,
      };
    });

    const initialFeeInputs: Record<string, string> = {};
    merged.forEach((record) => {
      initialFeeInputs[record.space.id] = String(
        record.space.platform_fee_percent ?? 15
      );
    });

    setFeeInputs(initialFeeInputs);
    setRecords(merged);
    setLoading(false);
  }

  useEffect(() => {
    if (!focusSpaceId || records.length === 0) return;
    const record = records.find((item) => item.space.id === focusSpaceId);
    if (!record) return;
    setStatusFilter("all");
    setQuickEditId(focusSpaceId);
    setContentDrafts((current) => ({
      ...current,
      [focusSpaceId]: current[focusSpaceId] ?? draftFromSpace(record.space),
    }));
  }, [focusSpaceId, records]);

  async function updateListingStatus(
    spaceId: string,
    nextStatus: "active" | "paused"
  ) {
    setUpdatingId(spaceId);
    setMessage("");

    const record = records.find((item) => item.space.id === spaceId);

    if (!record) {
      setMessage("Space not found.");
      setUpdatingId(null);
      return;
    }

    if (!isLiveListingStatus(record.space.status) && nextStatus === "paused") {
      setMessage("Only live spaces can be paused.");
      setUpdatingId(null);
      return;
    }

    if (
      nextStatus === "active" &&
      !isLiveListingStatus(record.space.status) &&
      needsReviewWorkflow(record.space.status)
    ) {
      setMessage(
        "Use the listing review queue to approve this space before it goes live."
      );
      setUpdatingId(null);
      return;
    }

    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/live-status`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });

      setRecords((current) =>
        current.map((item) =>
          item.space.id === spaceId
            ? {
                ...item,
                space: {
                  ...item.space,
                  status: nextStatus,
                },
              }
            : item
        )
      );

      setMessage(`Space status updated to ${nextStatus}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update status.");
    }

    setUpdatingId(null);
  }

  async function savePlatformFee(spaceId: string) {
    setSavingFeeId(spaceId);
    setMessage("");

    const rawValue = feeInputs[spaceId];

    if (rawValue === "") {
      setMessage("Please enter a platform fee.");
      setSavingFeeId(null);
      return;
    }

    const parsedValue = Number(Number(rawValue).toFixed(2));

    if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 100) {
      setMessage("Platform fee must be a number between 0 and 100.");
      setSavingFeeId(null);
      return;
    }

    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/listing-meta`, {
        method: "PATCH",
        body: JSON.stringify({ platform_fee_percent: parsedValue }),
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save fee.");
      setSavingFeeId(null);
      return;
    }

    setRecords((current) =>
      current.map((item) =>
        item.space.id === spaceId
          ? {
              ...item,
              space: {
                ...item.space,
                platform_fee_percent: parsedValue,
              },
            }
          : item
      )
    );

    setFeeInputs((current) => ({
      ...current,
      [spaceId]: String(parsedValue),
    }));

    setMessage(`Platform fee updated to ${parsedValue}% for this space.`);
    setSavingFeeId(null);
  }

  function draftFromSpace(s: MarketplaceSpaceRow): SpaceContentDraft {
    return {
      title: s.title ?? "",
      description: s.description ?? "",
      city: s.city ?? "",
      suburb: s.suburb ?? "",
      address_line_1: s.address_line_1 ?? "",
      space_type: s.space_type ?? "storage",
      booking_unit: s.booking_unit ?? "day",
      price_per_hour:
        typeof s.price_per_hour === "number" ? String(s.price_per_hour) : "",
      price_per_day:
        typeof s.price_per_day === "number" ? String(s.price_per_day) : "",
      price_per_month:
        typeof s.price_per_month === "number" ? String(s.price_per_month) : "",
      min_booking_hours:
        typeof s.min_booking_hours === "number"
          ? String(s.min_booking_hours)
          : "1",
      min_booking_days:
        typeof s.min_booking_days === "number"
          ? String(s.min_booking_days)
          : "1",
      min_booking_months:
        typeof s.min_booking_months === "number"
          ? String(s.min_booking_months)
          : "1",
      reason: "",
    };
  }

  function toggleQuickEdit(spaceId: string, space: MarketplaceSpaceRow) {
    setQuickEditId((current) => {
      const next = current === spaceId ? null : spaceId;
      if (next) {
        setContentDrafts((d) =>
          d[spaceId] ? d : { ...d, [spaceId]: draftFromSpace(space) }
        );
      }
      return next;
    });
  }

  async function saveListingContent(spaceId: string, space: MarketplaceSpaceRow) {
    const draft = contentDrafts[spaceId] ?? draftFromSpace(space);
    const reason = draft.reason.trim();
    if (reason.length < 3) {
      setContentSaveFeedback({
        spaceId,
        text: "Enter a short reason (at least 3 characters) for this edit.",
        isError: true,
      });
      return;
    }

    setSavingContentId(spaceId);
    setContentSaveFeedback(null);
    setMessage("");

    const parseOpt = (s: string) => {
      const t = s.trim();
      if (t === "") return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };

    const parseMin = (s: string) => {
      const t = s.trim();
      if (t === "") return null;
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    };

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setContentSaveFeedback({
          spaceId,
          text: "Please sign in again.",
          isError: true,
        });
        return;
      }

      const body: Record<string, unknown> = {
        reason,
        title: draft.title.trim(),
        description: draft.description.trim() === "" ? null : draft.description.trim(),
        city: draft.city.trim() === "" ? null : draft.city.trim(),
        suburb: draft.suburb.trim() === "" ? null : draft.suburb.trim(),
        address_line_1:
          draft.address_line_1.trim() === "" ? null : draft.address_line_1.trim(),
        space_type: draft.space_type,
        booking_unit: draft.booking_unit,
        price_per_hour: parseOpt(draft.price_per_hour),
        price_per_day: parseOpt(draft.price_per_day),
        price_per_month: parseOpt(draft.price_per_month),
        min_booking_hours: parseMin(draft.min_booking_hours),
        min_booking_days: parseMin(draft.min_booking_days),
        min_booking_months: parseMin(draft.min_booking_months),
      };

      const res = await fetch(`/api/admin/spaces/${spaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const apiErr =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Could not save space content.";
        setContentSaveFeedback({ spaceId, text: apiErr, isError: true });
        return;
      }

      setContentSaveFeedback({
        spaceId,
        text: "Space content updated.",
        isError: false,
      });
      await loadListings();
    } catch (e: unknown) {
      console.error("saveListingContent:", e);
      setContentSaveFeedback({
        spaceId,
        text:
          e instanceof Error ? e.message : "Something went wrong while saving.",
        isError: true,
      });
    } finally {
      setSavingContentId(null);
    }
  }

  function formatDepositType(
    depositType: DepositType,
    depositMonths: number | null | undefined
  ) {
    if (depositType === "one_month") return "1 month deposit";
    if (depositType === "two_months") return "2 months deposit";
    if ((depositMonths ?? 0) === 1) return "1 month deposit";
    if ((depositMonths ?? 0) === 2) return "2 months deposit";
    return "No deposit";
  }

  const patchSpace = useCallback((spaceId: string, patch: Partial<MarketplaceSpaceRow>) => {
    setRecords((current) =>
      current.map((item) =>
        item.space.id === spaceId
          ? { ...item, space: { ...item.space, ...patch } }
          : item
      )
    );
  }, []);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      const matchesStatus =
        statusFilter === "all" ||
        (record.space.status || "pending") === statusFilter;

      if (!matchesStatus) return false;

      if (!normalizedSearch) return true;

      const searchableText = [
        record.space.title,
        record.space.address_line_1,
        record.space.suburb,
        record.space.city,
        record.space.space_type,
        record.space.booking_unit,
        record.space.property_name,
        record.ownerProfile?.first_name,
        record.ownerProfile?.last_name,
        record.ownerProfile?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [records, statusFilter, searchQuery]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-7xl rounded-md border border-gray-300 p-5 shadow-sm">
          Loading spaces...
        </div>
      </main>
    );
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-5">
          <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-red-700">
            You do not have admin access to this area.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-black">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold">Admin - Marketplace Spaces</h1>
        <p className="mb-6 text-gray-600">
          Spaces that are visible or managed for the public marketplace — platform fees, live
          status, and quick content edits. For verification and approval, use{" "}
          <Link href="/admin/spaces" className="font-medium underline">
            Space approvals
          </Link>
          . Submit reviews from{" "}
          <Link href="/admin/listing-reviews" className="font-medium underline">
            Listing reviews
          </Link>
          .
        </p>

        <AdminNav current="listings" />

        <div className="mb-4 flex flex-wrap gap-3">
          {["all", "pending", "active", "paused"].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md border px-4 py-2 text-sm ${
                statusFilter === filter ? "bg-black text-white" : "bg-white"
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        <div className="mb-6 rounded-md border border-gray-300 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-sm font-medium text-[#192a3a]">
            Search spaces
          </label>
          <div className="flex items-center gap-3 rounded-md border border-gray-300 px-3 py-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by space, address, owner, type, or booking unit"
              className="w-full border-0 bg-transparent text-sm text-[#192a3a] outline-none"
            />
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 rounded-md p-3 text-sm ${
              /invalid|error|denied|failed|could not|not found/i.test(message)
                ? "bg-red-100 text-red-800"
                : "bg-green-100 text-green-800"
            }`}
          >
            {message}
          </div>
        )}


        {filteredRecords.length === 0 ? (
          <p className="rounded-md border border-gray-300 p-5 text-sm text-gray-600 shadow-sm">
            No marketplace spaces found.
          </p>
        ) : (
          <MarketplaceSpacesTable
            records={filteredRecords}
            feeInputs={feeInputs}
            setFeeInputs={setFeeInputs}
            savingFeeId={savingFeeId}
            onSavePlatformFee={savePlatformFee}
            quickEditId={quickEditId}
            onToggleQuickEdit={toggleQuickEdit}
            contentDrafts={contentDrafts}
            setContentDrafts={setContentDrafts}
            savingContentId={savingContentId}
            contentSaveFeedback={contentSaveFeedback}
            onSaveListingContent={saveListingContent}
            draftFromSpace={draftFromSpace}
            formatDepositType={formatDepositType}
            updatingId={updatingId}
            onUpdateLiveStatus={updateListingStatus}
            onSpacePatched={patchSpace}
            onMessage={setMessage}
            onReload={loadListings}
          />
        )}
      </div>
    </main>
  );
}
