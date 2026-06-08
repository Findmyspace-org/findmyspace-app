"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  History,
  LayoutDashboard,
  MessageSquare,
  PauseCircle,
  Save,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  adminListingReviewHref,
  isLiveListingStatus,
  needsReviewWorkflow,
} from "@/lib/admin-listing-routing";
import { getDisplayName, isValidUuid } from "@/lib/utils";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";

type AdminProfileRow = {
  role: string | null;
};

type DepositType = "none" | "one_month" | "two_months" | null;

type SpaceRow = {
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
  ownership_proof_status: string | null;
  platform_fee_percent: number | null;
  deposit_type: DepositType;
  deposit_months: number | null;
  monthly_payment_day: number | null;
  created_at?: string | null;
};

type SpaceContentDraft = {
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

type OwnerProfileRow = {
  id: string;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type ListingRecord = {
  space: SpaceRow;
  ownerProfile: OwnerProfileRow | null;
  canActivate: boolean;
};

export default function AdminListingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [records, setRecords] = useState<ListingRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null);
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedListings, setExpandedListings] = useState<Record<string, boolean>>({});
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

    if (adminProfile?.role !== "admin") {
      setRole("user");
      setLoading(false);
      return;
    }

    setRole("admin");

    const { data: rawSpaces, error: spacesError } = await (supabase
      .from("spaces") as any)
      .select(
        "id, owner_id, title, description, city, suburb, address_line_1, space_type, booking_unit, price_per_hour, price_per_day, price_per_month, min_booking_hours, min_booking_days, min_booking_months, status, ownership_proof_status, platform_fee_percent, deposit_type, deposit_months, monthly_payment_day, created_at"
      )
      .order("created_at", { ascending: false });

    if (spacesError) {
      setMessage(spacesError.message);
      setLoading(false);
      return;
    }

    const spaces = (rawSpaces || []) as SpaceRow[];
    const ownerIds = Array.from(
      new Set(
        spaces
          .map((space) => space.owner_id)
          .filter((id): id is string => isValidUuid(id))
      )
    );

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

    const merged: ListingRecord[] = spaces.map((space) => {
      const ownerProfile = isValidUuid(space.owner_id)
        ? ownerProfilesMap.get(space.owner_id) || null
        : null;

      const canActivate =
        Boolean(space.owner_id) &&
        ownerProfile?.owner_verification_status === "verified" &&
        ownerProfile?.bank_verification_status === "verified" &&
        space.ownership_proof_status === "verified";

      return {
        space,
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

  async function updateListingStatus(
    spaceId: string,
    nextStatus: "active" | "paused"
  ) {
    setUpdatingId(spaceId);
    setMessage("");

    const record = records.find((item) => item.space.id === spaceId);

    if (!record) {
      setMessage("Listing not found.");
      setUpdatingId(null);
      return;
    }

    if (!isLiveListingStatus(record.space.status) && nextStatus === "paused") {
      setMessage("Only live listings can be paused.");
      setUpdatingId(null);
      return;
    }

    if (
      nextStatus === "active" &&
      !isLiveListingStatus(record.space.status) &&
      needsReviewWorkflow(record.space.status)
    ) {
      setMessage(
        "Use the listing review queue to approve this listing before it goes live."
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

      setMessage(`Listing status updated to ${nextStatus}.`);
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

    setMessage(`Platform fee updated to ${parsedValue}% for this listing.`);
    setSavingFeeId(null);
  }

  function draftFromSpace(s: SpaceRow): SpaceContentDraft {
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

  function toggleListing(spaceId: string, space: SpaceRow) {
    setExpandedListings((current) => {
      const next = !current[spaceId];
      if (next) {
        setContentDrafts((d) =>
          d[spaceId] ? d : { ...d, [spaceId]: draftFromSpace(space) }
        );
      }
      return { ...current, [spaceId]: next };
    });
  }

  async function saveListingContent(spaceId: string, space: SpaceRow) {
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
            : "Could not save listing content.";
        setContentSaveFeedback({ spaceId, text: apiErr, isError: true });
        return;
      }

      setContentSaveFeedback({
        spaceId,
        text: "Listing content updated.",
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

  function getBadgeClass(status: string | null | undefined) {
    if (status === "verified" || status === "active") {
      return "bg-green-100 text-green-800";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-800";
    }

    if (status === "paused") {
      return "bg-gray-200 text-gray-800";
    }

    return "bg-blue-100 text-blue-800";
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
          Loading listings...
        </div>
      </main>
    );
  }

  if (role !== "admin") {
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
        <h1 className="mb-2 text-4xl font-bold">Admin - Listings</h1>
        <p className="mb-6 text-gray-600">
          Review listing readiness and manage platform fees. Approve listings from{" "}
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
            Search listing
          </label>
          <div className="flex items-center gap-3 rounded-md border border-gray-300 px-3 py-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by listing, address, owner, email, type, or booking unit"
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
          <div className="rounded-md border border-gray-300 p-5 text-sm text-gray-600 shadow-sm">
            No listings found.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((record) => (
              <div
                key={record.space.id}
                className="overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleListing(record.space.id, record.space)}
                  className="flex w-full items-start justify-between gap-4 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-semibold">
                          {record.space.title || "Untitled listing"}
                        </h2>
                        <p className="mt-1 text-sm text-gray-600">
                          {[
                            record.space.address_line_1,
                            record.space.suburb,
                            record.space.city,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Address not set"}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Owner:{" "}
                          {isValidUuid(record.space.owner_id)
                            ? getDisplayName(record.ownerProfile)
                            : "No owner (admin-created)"}
                          {record.ownerProfile?.email
                            ? ` | ${record.ownerProfile.email}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Type: {record.space.space_type || "Not set"} | Booking: {record.space.booking_unit || "Not set"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                            record.space.status
                          )}`}
                        >
                          {record.space.status || "pending"}
                        </span>

                        {expandedListings[record.space.id] ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                          record.ownerProfile?.owner_verification_status
                        )}`}
                      >
                        Owner: {record.ownerProfile?.owner_verification_status || "pending"}
                      </span>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                          record.ownerProfile?.bank_verification_status
                        )}`}
                      >
                        Bank: {record.ownerProfile?.bank_verification_status || "pending"}
                      </span>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                          record.space.ownership_proof_status
                        )}`}
                      >
                        Ownership proof: {record.space.ownership_proof_status || "pending"}
                      </span>
                    </div>
                  </div>
                </button>

                {expandedListings[record.space.id] && (
                  <div className="border-t border-gray-200 px-4 pb-4 pt-4">
                    <div className="space-y-4">
                      <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                        <h3 className="mb-3 text-sm font-semibold text-[#192a3a]">Listing details</h3>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p>
                            <span className="font-medium">Listing ID:</span> {record.space.id}
                          </p>
                          <p>
                            <span className="font-medium">Space type:</span> {record.space.space_type || "Not set"}
                          </p>
                          <p>
                            <span className="font-medium">Booking unit:</span> {record.space.booking_unit || "Not set"}
                          </p>
                          <p>
                            <span className="font-medium">Created:</span> {record.space.created_at ? new Date(record.space.created_at).toLocaleString() : "Unknown"}
                          </p>
                          {record.space.booking_unit === "month" && (
                            <>
                              <p>
                                <span className="font-medium">Deposit type:</span> {formatDepositType(
                                  record.space.deposit_type,
                                  record.space.deposit_months
                                )}
                              </p>
                              <p>
                                <span className="font-medium">Deposit months:</span> {record.space.deposit_months ?? 0}
                              </p>
                              <p>
                                <span className="font-medium">Monthly payment day:</span> Day {record.space.monthly_payment_day ?? 1}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rounded-sm border border-blue-200 bg-blue-50/50 p-4">
                        <h3 className="mb-2 text-sm font-semibold text-[#192a3a]">
                          Admin content edit
                        </h3>
                        <p className="mb-3 text-xs text-gray-600">
                          Safe listing fields only (no status, fees, deposits, or ownership). Requires a short reason. Saves via admin API.
                        </p>
                        {(() => {
                          const d =
                            contentDrafts[record.space.id] ??
                            draftFromSpace(record.space);
                          return (
                            <div className="space-y-3 text-sm">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">
                                  Reason for change
                                </label>
                                <input
                                  type="text"
                                  value={d.reason}
                                  onChange={(e) =>
                                    setContentDrafts((prev) => ({
                                      ...prev,
                                      [record.space.id]: {
                                        ...(prev[record.space.id] ??
                                          draftFromSpace(record.space)),
                                        reason: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="e.g. Fix typo in title"
                                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">
                                  Title
                                </label>
                                <input
                                  type="text"
                                  value={d.title}
                                  onChange={(e) =>
                                    setContentDrafts((prev) => ({
                                      ...prev,
                                      [record.space.id]: {
                                        ...(prev[record.space.id] ??
                                          draftFromSpace(record.space)),
                                        title: e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600">
                                  Description
                                </label>
                                <textarea
                                  value={d.description}
                                  onChange={(e) =>
                                    setContentDrafts((prev) => ({
                                      ...prev,
                                      [record.space.id]: {
                                        ...(prev[record.space.id] ??
                                          draftFromSpace(record.space)),
                                        description: e.target.value,
                                      },
                                    }))
                                  }
                                  rows={4}
                                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                                />
                              </div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Address
                                  </label>
                                  <input
                                    type="text"
                                    value={d.address_line_1}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          address_line_1: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Suburb
                                  </label>
                                  <input
                                    type="text"
                                    value={d.suburb}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          suburb: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    City
                                  </label>
                                  <input
                                    type="text"
                                    value={d.city}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          city: e.target.value,
                                        },
                                      }))
                                    }
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
                                    value={d.space_type}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          space_type: e.target.value,
                                        },
                                      }))
                                    }
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
                                    value={d.booking_unit}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          booking_unit: e.target.value,
                                        },
                                      }))
                                    }
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
                                    value={d.price_per_hour}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          price_per_hour: e.target.value,
                                        },
                                      }))
                                    }
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
                                    value={d.price_per_day}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          price_per_day: e.target.value,
                                        },
                                      }))
                                    }
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
                                    value={d.price_per_month}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          price_per_month: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Min hours
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={d.min_booking_hours}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          min_booking_hours: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Min days
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={d.min_booking_days}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          min_booking_days: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Min months
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={d.min_booking_months}
                                    onChange={(e) =>
                                      setContentDrafts((prev) => ({
                                        ...prev,
                                        [record.space.id]: {
                                          ...(prev[record.space.id] ??
                                            draftFromSpace(record.space)),
                                          min_booking_months: e.target.value,
                                        },
                                      }))
                                    }
                                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  saveListingContent(record.space.id, record.space)
                                }
                                disabled={savingContentId === record.space.id}
                                className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
                              >
                                <Save className="h-4 w-4" />
                                {savingContentId === record.space.id
                                  ? "Saving…"
                                  : "Save content"}
                              </button>
                              {contentSaveFeedback?.spaceId === record.space.id && (
                                <div
                                  role="status"
                                  className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                                    contentSaveFeedback.isError
                                      ? "border-red-200 bg-red-50 text-red-800"
                                      : "border-green-200 bg-green-50 text-green-800"
                                  }`}
                                >
                                  {contentSaveFeedback.text}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                        <h3 className="mb-3 text-sm font-semibold text-[#192a3a]">Platform fee</h3>
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={feeInputs[record.space.id] || ""}
                            onChange={(e) =>
                              setFeeInputs((current) => ({
                                ...current,
                                [record.space.id]: e.target.value,
                              }))
                            }
                            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none"
                          />
                          <span className="text-sm text-gray-600">%</span>
                          <button
                            type="button"
                            onClick={() => savePlatformFee(record.space.id)}
                            disabled={savingFeeId === record.space.id}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
                          >
                            <Save className="h-4 w-4" />
                            {savingFeeId === record.space.id ? "Saving..." : "Save fee"}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          Current saved fee: {Number(record.space.platform_fee_percent ?? 15)}%
                        </p>
                      </div>

                      <div
                        className={`rounded-sm border p-4 text-sm ${
                          record.canActivate
                            ? "border-green-300 bg-green-50 text-green-900"
                            : "border-yellow-300 bg-yellow-50 text-yellow-900"
                        }`}
                      >
                        <div className="inline-flex items-center gap-2 font-medium">
                          <ShieldCheck className="h-4 w-4" />
                          {record.canActivate
                            ? "This listing is ready to be activated."
                            : "This listing is not ready yet. Owner verification, bank verification, and ownership proof must all be verified first."}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {needsReviewWorkflow(record.space.status) ? (
                          <Link
                            href={adminListingReviewHref(record.space.id)}
                            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm text-white"
                          >
                            <ClipboardList className="h-4 w-4" />
                            Review listing
                          </Link>
                        ) : null}

                        {isLiveListingStatus(record.space.status) ? (
                          <>
                            <Link
                              href={`/spaces/${record.space.id}`}
                              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm"
                            >
                              <Eye className="h-4 w-4" />
                              View listing
                            </Link>

                            {record.space.status === "active" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateListingStatus(record.space.id, "paused")
                                }
                                disabled={updatingId === record.space.id}
                                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-800 disabled:opacity-50"
                              >
                                <PauseCircle className="h-4 w-4" />
                                {updatingId === record.space.id
                                  ? "Updating..."
                                  : "Pause"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateListingStatus(record.space.id, "active")
                                }
                                disabled={updatingId === record.space.id}
                                className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {updatingId === record.space.id
                                  ? "Updating..."
                                  : "Resume"}
                              </button>
                            )}
                          </>
                        ) : record.space.status === "unclaimed" ? (
                          <Link
                            href={`/admin/unclaimed-listings/${record.space.id}/edit`}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm"
                          >
                            Manage unclaimed
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}