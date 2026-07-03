"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import { OwnerSpacesTable } from "@/app/components/owner/OwnerSpacesTable";
import {
  useFocusHighlight,
} from "@/lib/use-focus-highlight";
import { ownerClaimCanSubmitForSpace } from "@/lib/claim-readiness";
import {
  getOwnerListingNextAction,
  getOwnerListingStatusBadgeClass,
  getOwnerListingStatusLabel,
  isBookableListingStatus,
  isOwnerCompletionFlowStatus,
} from "@/lib/listing-lifecycle";
import {
  ArrowRight,
  MapPin,
  Tag,
  CalendarDays,
  Wallet,
  Clock3,
  ShieldCheck,
  Eye,
  Pencil,
  BadgeCheck,
  PauseCircle,
  PlayCircle,
  Search,
  X,
} from "lucide-react";

type DepositType = "none" | "one_month" | "two_months" | null;

type Space = {
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
  deposit_type?: DepositType;
  deposit_months?: number | null;
  monthly_payment_day?: number | null;
  property_id?: string | null;
  property_name?: string | null;
};

type SpaceRow = {
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
  public_listing_mode: string | null;
  created_at: string | null;
  ownership_proof_status: string | null;
  deposit_type: DepositType;
  deposit_months: number | null;
  monthly_payment_day: number | null;
  property_id: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

type ProfileVerificationRow = {
  id: string;
  is_host: boolean | null;
  first_name: string | null;
  phone: string | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

type ClaimContext = {
  contactComplete: boolean;
  hasIdFront: boolean;
  hasIdBack: boolean;
};


function MyListingsPageContent({
  focusSpaceId,
  createdStatus,
}: {
  focusSpaceId: string | null;
  createdStatus: string | null;
}) {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isHost, setIsHost] = useState(false);
  const [claimContext, setClaimContext] = useState<ClaimContext>({
    contactComplete: false,
    hasIdFront: false,
    hasIdBack: false,
  });

  const [searchText, setSearchText] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [pauseUpdatingId, setPauseUpdatingId] = useState<string | null>(null);

  const { highlightedId } = useFocusHighlight({
    focusId: focusSpaceId,
    ready: !loading,
    prefix: "space",
  });

  useEffect(() => {
    loadMyListings();
  }, []);

  // Mark related listing-lifecycle notifications for this space as read.
  useEffect(() => {
    if (!focusSpaceId || loading) return;
    if (!spaces.some((s) => s.id === focusSpaceId)) return;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await fetch("/api/notifications/read-by-related", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            relatedEntityType: "space",
            relatedEntityId: focusSpaceId,
            types: [
              "listing_submitted",
              "listing_pending",
              "listing_needs_changes",
              "listing_rejected",
              "listing_activated",
              "ownership_proof_verified",
            ],
          }),
        });
      } catch {
        /* non-fatal */
      }
    })();
  }, [focusSpaceId, loading, spaces]);

  useEffect(() => {
    if (!focusSpaceId || loading) return;
    const match = spaces.find((space) => space.id === focusSpaceId);
    if (match) setSelectedSpace(match);
  }, [focusSpaceId, loading, spaces]);

  async function loadMyListings() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Please log in first.");
        setLoading(false);
        return;
      }

      setSessionEmail(user.email ?? null);

      const { data: rawProfileData, error: profileError } = await (supabase
        .from("profiles") as any)
        .select(
          "id, is_host, first_name, phone, owner_verification_status, bank_verification_status"
        )
        .eq("id", user.id)
        .single();

      const profileData = rawProfileData as ProfileVerificationRow | null;

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData?.is_host) {
        window.location.href = "/dashboard/become-host";
        return;
      }

      setIsHost(true);

      const { data: idDocRows } = await supabase
        .from("owner_verification_documents")
        .select("document_type")
        .eq("owner_id", user.id);
      const idTypes =
        ((idDocRows as { document_type: string }[]) || []).map(
          (row) => row.document_type
        );
      setClaimContext({
        contactComplete: Boolean(
          profileData.first_name?.trim() && profileData.phone?.trim()
        ),
        hasIdFront: idTypes.includes("id_front"),
        hasIdBack: idTypes.includes("id_back"),
      });

      const { data, error } = await supabase
        .from("spaces")
        .select(
          "id, owner_id, title, description, city, suburb, address_line_1, space_type, booking_unit, price_per_hour, price_per_day, price_per_month, status, public_listing_mode, created_at, ownership_proof_status, deposit_type, deposit_months, monthly_payment_day, property_id"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const baseSpaces = (data || []) as unknown as SpaceRow[];
      const spaceIds = baseSpaces.map((space) => space.id);
      const propertyIds = [
        ...new Set(
          baseSpaces
            .map((space) => space.property_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      const imageMap = new Map<string, string>();
      const propertyNameMap = new Map<string, string>();
      const profileMap = new Map<
        string,
        {
          owner_verification_status: string | null;
          bank_verification_status: string | null;
        }
      >();

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

        for (const image of (imagesData || []) as SpaceImageRow[]) {
          if (!imageMap.has(image.space_id)) {
            imageMap.set(image.space_id, image.image_url);
          }
        }
      }

      if (propertyIds.length > 0) {
        const { data: propertyRows } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propertyIds);

        for (const property of (propertyRows as { id: string; name: string }[]) || []) {
          propertyNameMap.set(property.id, property.name);
        }
      }

      if (profileData?.id) {
        profileMap.set(profileData.id, {
          owner_verification_status: profileData.owner_verification_status,
          bank_verification_status: profileData.bank_verification_status,
        });
      }

      const mergedSpaces: Space[] = baseSpaces.map((space) => ({
        ...space,
        cover_image_url: imageMap.get(space.id) || null,
        ownership_proof_status: space.ownership_proof_status || "pending",
        owner_verification_status:
          profileMap.get(space.owner_id)?.owner_verification_status || "pending",
        bank_verification_status:
          profileMap.get(space.owner_id)?.bank_verification_status || "pending",
        deposit_type: space.deposit_type || "none",
        deposit_months: space.deposit_months ?? 0,
        monthly_payment_day: space.monthly_payment_day ?? 1,
        property_id: space.property_id,
        property_name: space.property_id
          ? propertyNameMap.get(space.property_id) || null
          : null,
      }));

      const visibleSpaces = mergedSpaces.filter(
        (space) => (space.status || "pending") !== "deleted"
      );

      setSpaces(visibleSpaces);
      setLoading(false);
    } catch {
      setMessage("Something went wrong while loading your listings.");
      setLoading(false);
    }
  }

  function getPriceLabel(space: Space) {
    if (space.booking_unit === "hour") {
      return space.price_per_hour ? `R${space.price_per_hour} / hour` : "Not set";
    }

    if (space.booking_unit === "month") {
      return space.price_per_month
        ? `R${space.price_per_month} / month`
        : "Not set";
    }

    return space.price_per_day ? `R${space.price_per_day} / day` : "Not set";
  }

  function getStatusBadgeClass(status: string | null) {
    return getOwnerListingStatusBadgeClass(status);
  }

  function getStatusLabel(space: Space) {
    const canSubmit = ownerClaimCanSubmitForSpace({
      contactComplete: claimContext.contactComplete,
      hasIdFront: claimContext.hasIdFront,
      hasIdBack: claimContext.hasIdBack,
      ownershipProofStatus: space.ownership_proof_status,
    });
    return getOwnerListingStatusLabel(space.status, {
      canSubmit,
      publicListingMode: space.public_listing_mode,
    });
  }

  function getNextAction(space: Space) {
    const canSubmit = ownerClaimCanSubmitForSpace({
      contactComplete: claimContext.contactComplete,
      hasIdFront: claimContext.hasIdFront,
      hasIdBack: claimContext.hasIdBack,
      ownershipProofStatus: space.ownership_proof_status,
    });
    return getOwnerListingNextAction(space.id, space.status, { canSubmit });
  }

  function nextActionButtonClass(action: NonNullable<ReturnType<typeof getOwnerListingNextAction>>) {
    if (action.muted) {
      return "border border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100";
    }
    if (action.urgent) {
      return "bg-amber-600 text-white hover:bg-amber-700";
    }
    return "bg-[#192a3a] text-white hover:opacity-90";
  }

  function getVerificationBadgeClass(status: string | null | undefined) {
    if (status === "verified") return "bg-green-100 text-green-800";
    if (status === "rejected") return "bg-red-100 text-red-800";
    if (status === "missing") return "bg-yellow-100 text-yellow-800";
    return "bg-blue-100 text-blue-800";
  }

  function getMissingChecks(space: Space) {
    const missing: string[] = [];

    if ((space.owner_verification_status || "pending") !== "verified") {
      missing.push("owner verification");
    }

    if ((space.bank_verification_status || "pending") !== "verified") {
      missing.push("bank verification");
    }

    if ((space.ownership_proof_status || "pending") !== "verified") {
      missing.push("ownership proof");
    }

    return missing;
  }

  async function updateListingStatus(
    spaceId: string,
    nextStatus: "active" | "paused" | "deleted"
  ) {
    setMessage("");
    setPauseUpdatingId(spaceId);

    const targetSpace = spaces.find((space) => space.id === spaceId);

    if (!targetSpace) {
      setMessage("Listing not found.");
      setPauseUpdatingId(null);
      return;
    }

    if (nextStatus === "active") {
      if (isOwnerCompletionFlowStatus(targetSpace.status)) {
        setMessage(
          "Complete the listing setup and submit for admin review before it can go live."
        );
        setPauseUpdatingId(null);
        return;
      }

      const missingChecks = getMissingChecks(targetSpace);

      if (missingChecks.length > 0) {
        setMessage(
          `This listing cannot be activated yet. Missing: ${missingChecks.join(", ")}.`
        );
        setPauseUpdatingId(null);
        return;
      }
    }

    const { error } = await (supabase.from("spaces") as any)
      .update({ status: nextStatus })
      .eq("id", spaceId);

    if (error) {
      setMessage(error.message);
      setPauseUpdatingId(null);
      return;
    }

    setSpaces((current) =>
      nextStatus === "deleted"
        ? current.filter((space) => space.id !== spaceId)
        : current.map((space) =>
          space.id === spaceId ? { ...space, status: nextStatus } : space
        )
    );

    setSelectedSpace((current) =>
      current?.id === spaceId ? { ...current, status: nextStatus } : current
    );
    setPauseUpdatingId(null);
  }

  function canTogglePause(space: Space) {
    return space.status === "active" || space.status === "paused";
  }


  function goToBooking(bookingId: string) {
    window.location.href = `/dashboard/requests?booking=${bookingId}`;
  }

  const filteredSpaces = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return spaces.filter((space) => {
      const status = space.status || "pending";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "setup" && isOwnerCompletionFlowStatus(status)) ||
        status === statusFilter;

      if (!matchesStatus) return false;

      if (!normalizedSearch) return true;

      const searchable = [
        space.title,
        space.address_line_1,
        space.suburb,
        space.city,
        space.space_type,
        space.booking_unit,
        space.property_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [spaces, statusFilter, searchText]);

  const counts = useMemo(() => {
    return {
      all: spaces.length,
      active: spaces.filter((s) => s.status === "active").length,
      setup: spaces.filter((s) => isOwnerCompletionFlowStatus(s.status)).length,
      pending: spaces.filter((s) => !s.status || s.status === "pending").length,
      paused: spaces.filter((s) => s.status === "paused").length,
    };
  }, [spaces]);

  const selectedPanelNextAction = selectedSpace
    ? getNextAction(selectedSpace)
    : null;
  const selectedPanelIsLive = selectedSpace
    ? selectedSpace.status === "active" || selectedSpace.status === "paused"
    : false;

  return (
    <RequireAuth>
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="My spaces"
        pageSubtitle="Manage individual spaces people can book."
        navItems={HOST_NAV}
        activeHref="/dashboard/listings"
      >
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-wrap gap-2 xl:gap-3">
                <Link
                  href="/dashboard/calendar"
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50 sm:px-4"
                >
                  Open calendar
                </Link>
                <Link
                  href="/dashboard/new-space"
                  className="rounded-md bg-[#192a3a] px-3 py-2 text-sm font-medium text-white hover:opacity-90 sm:px-4"
                >
                  + Add space
                </Link>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-[240px] flex-1 xl:max-w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search by space name or area"
                  className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-[#192a3a]"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {[
                  { key: "all", label: "All", count: counts.all },
                  { key: "setup", label: "Setup", count: counts.setup },
                  { key: "active", label: "Active", count: counts.active },
                  { key: "pending", label: "Pending", count: counts.pending },
                  { key: "paused", label: "Paused", count: counts.paused },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setStatusFilter(item.key)}
                    className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${statusFilter === item.key
                        ? "bg-[#192a3a] text-white"
                        : "bg-white text-[#192a3a]"
                      }`}
                  >
                    <span>{item.label}</span>

                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusFilter === item.key
                          ? "bg-white text-[#192a3a]"
                          : "bg-gray-200 text-gray-700"
                        }`}
                    >
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {createdStatus === "pending" && (
            <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Your listing has been submitted and is waiting for admin approval.
            </div>
          )}

          {isHost && (
            <div className="mb-6">
              <OwnerVerificationAlerts />
            </div>
          )}

          {message && (
            <div className="mb-6 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <Box>Loading your spaces...</Box>
          ) : spaces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-sm text-gray-600">
                You don&apos;t have any spaces yet. Add your first space to start receiving
                booking requests.
              </p>
              <Link
                href="/dashboard/new-space"
                className="mt-6 inline-flex rounded-md bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                + Add space
              </Link>
            </div>
          ) : filteredSpaces.length === 0 ? (
            <Box>No spaces match your search or filters.</Box>
          ) : (
            <OwnerSpacesTable
              spaces={filteredSpaces}
              highlightedId={highlightedId}
              getStatusLabel={getStatusLabel}
              getStatusBadgeClass={getStatusBadgeClass}
              getVerificationBadgeClass={getVerificationBadgeClass}
              getPriceLabel={getPriceLabel}
              getNextAction={getNextAction}
              nextActionButtonClass={nextActionButtonClass}
              onViewDetails={setSelectedSpace}
              onTogglePause={(spaceId, nextStatus) =>
                void updateListingStatus(spaceId, nextStatus)
              }
              pauseUpdatingId={pauseUpdatingId}
              canTogglePause={canTogglePause}
            />
          )}
        {selectedSpace && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setSelectedSpace(null)}
            />

            <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Space details
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-[#192a3a]">
                    {selectedSpace.title || "Untitled listing"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSpace(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
                    <div className="grid gap-4 p-5 md:grid-cols-[220px_1fr]">
                      <div className="relative min-h-[180px] rounded-md bg-gray-100">
                        {selectedSpace.cover_image_url ? (
                          <Image
                            src={selectedSpace.cover_image_url}
                            alt={selectedSpace.title || "Listing image"}
                            fill
                            className="object-cover rounded-md"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-gray-500">
                            No image yet
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h3 className="text-xl font-semibold text-[#192a3a]">
                              {selectedSpace.title || "Untitled listing"}
                            </h3>
                            <div className="mt-1 flex items-start gap-2 text-sm text-gray-600">
                              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                              <p>
                                {[selectedSpace.address_line_1, selectedSpace.suburb, selectedSpace.city]
                                  .filter(Boolean)
                                  .join(", ") || "Address not set"}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                              selectedSpace.status
                            )}`}
                          >
                            {getStatusLabel(selectedSpace)}
                          </span>
                        </div>

                        {selectedPanelNextAction ? (
                          <div
                            className={`mb-4 rounded-md border p-4 text-sm ${
                              selectedSpace.status === "needs_changes"
                                ? "border-amber-200 bg-amber-50 text-amber-950"
                                : selectedSpace.status === "rejected"
                                  ? "border-red-200 bg-red-50 text-red-950"
                                  : selectedSpace.status === "pending_verification"
                                    ? "border-blue-200 bg-blue-50 text-blue-950"
                                    : "border-violet-200 bg-violet-50 text-violet-950"
                            }`}
                          >
                            <p className="font-medium">{selectedPanelNextAction.label}</p>
                            <p className="mt-1">
                              {selectedSpace.status === "pending_verification"
                                ? "Your listing has been submitted. FindMySpace will review your verification, ownership proof, and listing details before it goes live."
                                : selectedSpace.status === "needs_changes"
                                  ? "FindMySpace needs a few updates before your listing can go live."
                                  : selectedSpace.status === "rejected"
                                    ? "This listing was not approved. Review the admin note on the completion page."
                                    : "Finish the setup checklist and submit for admin review."}
                            </p>
                            <Link
                              href={selectedPanelNextAction.href}
                              className={`mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${nextActionButtonClass(selectedPanelNextAction)}`}
                            >
                              {selectedPanelNextAction.label}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        ) : null}

                        {!isOwnerCompletionFlowStatus(selectedSpace.status) &&
                        (selectedSpace.status || "pending") === "pending" ? (
                          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            This listing is under admin review and is not yet visible to the public.
                          </div>
                        ) : null}

                        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3.5">
                          <p className="mb-2 text-sm font-medium text-gray-700">
                            Verification checks
                          </p>

                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getVerificationBadgeClass(
                                selectedSpace.owner_verification_status
                              )}`}
                            >
                              Owner: {selectedSpace.owner_verification_status || "pending"}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getVerificationBadgeClass(
                                selectedSpace.bank_verification_status
                              )}`}
                            >
                              Bank: {selectedSpace.bank_verification_status || "pending"}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getVerificationBadgeClass(
                                selectedSpace.ownership_proof_status
                              )}`}
                            >
                              Ownership proof: {selectedSpace.ownership_proof_status || "pending"}
                            </span>
                          </div>

                          {getMissingChecks(selectedSpace).length > 0 && (
                            <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-2.5 text-sm text-yellow-900">
                              This listing cannot go live yet. Missing: {getMissingChecks(selectedSpace).join(", ")}.
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 text-sm text-gray-700">
                            <div className="flex items-start gap-2">
                              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                              <p>
                                <span className="font-medium text-[#192a3a]">Type:</span> {selectedSpace.space_type || "Not set"}
                              </p>
                            </div>

                            <div className="flex items-start gap-2">
                              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                              <p>
                                <span className="font-medium text-[#192a3a]">Booking:</span> {selectedSpace.booking_unit || "Not set"}
                              </p>
                            </div>

                            <div className="flex items-start gap-2">
                              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                              <p>
                                <span className="font-medium text-[#192a3a]">Price:</span> {getPriceLabel(selectedSpace)}
                              </p>
                            </div>

                            {selectedSpace.booking_unit === "month" && (
                              <>
                                <div className="flex items-start gap-2">
                                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <p>
                                    <span className="font-medium text-[#192a3a]">Deposit:</span> {formatDepositType(
                                      selectedSpace.deposit_type || "none",
                                      selectedSpace.deposit_months ?? 0
                                    )}
                                  </p>
                                </div>

                                <div className="flex items-start gap-2">
                                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <p>
                                    <span className="font-medium text-[#192a3a]">Deposit months:</span> {selectedSpace.deposit_months ?? 0}
                                  </p>
                                </div>

                                <div className="flex items-start gap-2">
                                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                  <p>
                                    <span className="font-medium text-[#192a3a]">Monthly payment day:</span> Day {selectedSpace.monthly_payment_day ?? 1}
                                  </p>
                                </div>
                              </>
                            )}

                            <div className="flex items-start gap-2">
                              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                              <p>
                                <span className="font-medium text-[#192a3a]">Created:</span> {selectedSpace.created_at
                                  ? new Date(selectedSpace.created_at).toLocaleString()
                                  : "Unknown"}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium text-[#192a3a]">Description</p>
                            <div className="min-h-[88px] rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                              {selectedSpace.description || "No description added."}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {isBookableListingStatus(selectedSpace.status) ? (
                            <Link
                              href={`/spaces/${selectedSpace.id}`}
                              className="inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-sm text-[#192a3a] hover:bg-gray-50"
                            >
                              <Eye className="h-4 w-4" />
                              <span>View</span>
                            </Link>
                          ) : null}

                          <Link
                            href={`/spaces/${selectedSpace.id}/edit`}
                            className="inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-sm text-[#192a3a] hover:bg-gray-50"
                          >
                            <Pencil className="h-4 w-4" />
                            <span>Edit</span>
                          </Link>

                          {selectedPanelNextAction ? (
                            <Link
                              href={selectedPanelNextAction.href}
                              className={`inline-flex items-center gap-2 rounded-md px-2.5 py-0.5 text-sm ${nextActionButtonClass(selectedPanelNextAction)}`}
                            >
                              <ArrowRight className="h-4 w-4" />
                              <span>{selectedPanelNextAction.label}</span>
                            </Link>
                          ) : null}

                          <Link
                            href="/dashboard/verification"
                            className="inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-sm text-[#192a3a] hover:bg-gray-50"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            <span>Verification center</span>
                          </Link>

                          {selectedPanelIsLive ? (
                            selectedSpace.status === "paused" ? (
                              <button
                                onClick={() => updateListingStatus(selectedSpace.id, "active")}
                                disabled={getMissingChecks(selectedSpace).length > 0}
                                className={`inline-flex items-center gap-2 rounded-md px-2.5 py-0.5 text-sm ${getMissingChecks(selectedSpace).length === 0
                                  ? "bg-[#192a3a] text-white hover:opacity-90"
                                  : "cursor-not-allowed bg-gray-200 text-gray-500"}`}
                              >
                                <PlayCircle className="h-4 w-4" />
                                <span>Activate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => updateListingStatus(selectedSpace.id, "paused")}
                                className="inline-flex items-center gap-2 rounded-md border px-2.5 py-0.5 text-sm text-[#192a3a] hover:bg-gray-50"
                              >
                                <PauseCircle className="h-4 w-4" />
                                <span>Pause</span>
                              </button>
                            )
                          ) : null}

                          {selectedPanelIsLive ? (
                            <p className="text-xs text-gray-500">
                              To remove a listing from the marketplace, contact support or
                              ask an admin to archive it.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </>
        )}
        </>
      </DashboardShell>
    </RequireAuth>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
      {children}
    </div>
  );
}

function formatDepositType(
  depositType: "none" | "one_month" | "two_months",
  depositMonths: number
) {
  if (depositType === "one_month") return "1 month deposit";
  if (depositType === "two_months") return "2 months deposit";
  if (depositMonths === 1) return "1 month deposit";
  if (depositMonths === 2) return "2 months deposit";
  return "No deposit";
}

function MyListingsSearchParamsClient() {
  const searchParams = useSearchParams();
  const focusSpaceId = searchParams.get("focus");
  const createdStatus = searchParams.get("created");
  return (
    <MyListingsPageContent
      focusSpaceId={focusSpaceId}
      createdStatus={createdStatus}
    />
  );
}

export default function MyListingsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10 text-sm text-gray-600">Loading…</div>
      }
    >
      <MyListingsSearchParamsClient />
    </Suspense>
  );
}
