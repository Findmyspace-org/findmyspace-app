"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Eye,
  FileText,
  LayoutDashboard,
  PauseCircle,
  Save,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Space = {
  id: string;
  owner_id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  status: string | null;
  created_at: string | null;
  cover_image_url?: string | null;
  ownership_proof_status?: string | null;
  ownership_proof_url?: string | null;
  owner_verification_status?: string | null;
  bank_verification_status?: string | null;
  platform_fee_percent?: number | null;
  listing_admin_comment?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  owner_full_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
};

type SpaceImageRow = {
  space_id: string;
  image_url: string;
  sort_order: number | null;
};

type OwnershipDocumentRow = {
  space_id: string;
  file_url: string;
  status: string | null;
};

type ProfileVerificationRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

export default function AdminSpacesPage() {
  const [role, setRole] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null);
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});
  const [listingComments, setListingComments] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedListings, setExpandedListings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadAdminSpaces();
  }, []);

  async function loadAdminSpaces() {
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

    const { data: rawProfileData, error: profileError } = await (supabase
      .from("profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single();

    const profileData = rawProfileData as { role: string | null } | null;

    if (profileError) {
      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    if (profileData?.role !== "admin") {
      setRole("user");
      setLoading(false);
      return;
    }

    setRole("admin");

    const { data, error } = await supabase
      .from("spaces")
      .select(
        "id, owner_id, title, city, suburb, address_line_1, space_type, booking_unit, status, created_at, ownership_proof_status, platform_fee_percent, listing_admin_comment"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const baseSpaces = (data || []) as Space[];
    const spaceIds = baseSpaces.map((space) => space.id);
    const ownerIds = Array.from(new Set(baseSpaces.map((space) => space.owner_id)));

    const imageMap = new Map<string, string>();
    const ownershipMap = new Map<
      string,
      { file_url: string; status: string | null }
    >();
    const profileMap = new Map<
      string,
      {
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
        email: string | null;
        phone: string | null;
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

      const { data: ownershipDocs, error: ownershipError } = await supabase
        .from("listing_ownership_documents")
        .select("space_id, file_url, status")
        .in("space_id", spaceIds)
        .order("uploaded_at", { ascending: false });

      if (ownershipError) {
        setMessage(ownershipError.message);
        setLoading(false);
        return;
      }

      for (const doc of (ownershipDocs || []) as OwnershipDocumentRow[]) {
        if (!ownershipMap.has(doc.space_id)) {
          ownershipMap.set(doc.space_id, {
            file_url: doc.file_url,
            status: doc.status,
          });
        }
      }
    }

    if (ownerIds.length > 0) {
      const { data: profileRows, error: verificationError } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, full_name, email, phone, owner_verification_status, bank_verification_status"
        )
        .in("id", ownerIds);

      if (verificationError) {
        setMessage(verificationError.message);
        setLoading(false);
        return;
      }

      for (const row of (profileRows || []) as ProfileVerificationRow[]) {
        profileMap.set(row.id, {
          first_name: row.first_name,
          last_name: row.last_name,
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
          owner_verification_status: row.owner_verification_status,
          bank_verification_status: row.bank_verification_status,
        });
      }
    }

    const mergedSpaces = baseSpaces.map((space) => ({
      ...space,
      cover_image_url: imageMap.get(space.id) || null,
      ownership_proof_url: ownershipMap.get(space.id)?.file_url || null,
      ownership_proof_status:
        ownershipMap.get(space.id)?.status ||
        space.ownership_proof_status ||
        "pending",
      owner_first_name: profileMap.get(space.owner_id)?.first_name || null,
      owner_last_name: profileMap.get(space.owner_id)?.last_name || null,
      owner_full_name: profileMap.get(space.owner_id)?.full_name || null,
      owner_email: profileMap.get(space.owner_id)?.email || null,
      owner_phone: profileMap.get(space.owner_id)?.phone || null,
      owner_verification_status:
        profileMap.get(space.owner_id)?.owner_verification_status || "pending",
      bank_verification_status:
        profileMap.get(space.owner_id)?.bank_verification_status || "pending",
      platform_fee_percent: space.platform_fee_percent ?? 15,
    }));

    const initialFeeInputs: Record<string, string> = {};
    const initialListingComments: Record<string, string> = {};

    mergedSpaces.forEach((space) => {
      initialFeeInputs[space.id] = String(space.platform_fee_percent ?? 15);
      initialListingComments[space.id] = space.listing_admin_comment || "";
    });

    setFeeInputs(initialFeeInputs);
    setListingComments(initialListingComments);
    setSpaces(mergedSpaces);
    setLoading(false);
  }

  // Helper to fire listing event notifications to /api/notifications/listing-event
  async function fireListingEvent(
    spaceId: string,
    eventType:
      | "listing_submitted"
      | "listing_pending"
      | "listing_rejected"
      | "listing_activated"
      | "ownership_proof_verified",
    adminComment?: string | null
  ) {
    try {
      const response = await fetch("/api/notifications/listing-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spaceId,
          eventType,
          adminComment: adminComment || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fire listing event:", eventType, errorText);
      }
    } catch (error) {
      console.error("Failed to fire listing event:", eventType, error);
    }
  }

  async function updateSpaceStatus(
    spaceId: string,
    nextStatus: "active" | "paused" | "rejected" | "pending"
  ) {
    const targetSpace = spaces.find((space) => space.id === spaceId);

    if (!targetSpace) {
      setMessage("Listing not found.");
      return;
    }

    if (nextStatus === "active") {
      const missingChecks = getMissingChecks(targetSpace);

      if (missingChecks.length > 0) {
        setMessage(
          `This listing cannot be activated yet. Missing: ${missingChecks.join(", ")}.`
        );
        return;
      }
    }

    const adminComment = (listingComments[spaceId] || "").trim() || null;

    const { error } = await (supabase.from("spaces") as any)
      .update({ status: nextStatus, listing_admin_comment: adminComment })
      .eq("id", spaceId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSpaces((current) =>
      current.map((space) =>
        space.id === spaceId
          ? { ...space, status: nextStatus, listing_admin_comment: adminComment }
          : space
      )
    );

    if (nextStatus === "pending") {
      await fireListingEvent(spaceId, "listing_pending", adminComment);
    }

    if (nextStatus === "rejected") {
      await fireListingEvent(spaceId, "listing_rejected", adminComment);
    }

    if (nextStatus === "active") {
      await fireListingEvent(spaceId, "listing_activated", adminComment);
    }

    setMessage(
      nextStatus === "rejected"
        ? "Listing rejected with comment saved."
        : nextStatus === "pending"
          ? "Listing kept pending with comment saved."
          : nextStatus === "paused"
            ? "Listing paused."
            : "Listing activated."
    );
  }

  async function updateOwnershipProofStatus(
    spaceId: string,
    nextStatus: "verified" | "pending" | "rejected"
  ) {
    setMessage("");

    const targetSpace = spaces.find((space) => space.id === spaceId);

    if (!targetSpace) {
      setMessage("Listing not found.");
      return;
    }

    const adminComment = (listingComments[spaceId] || "").trim() || null;

    const { error: spaceError } = await (supabase.from("spaces") as any)
      .update({
        ownership_proof_status: nextStatus,
        listing_admin_comment: adminComment,
      })
      .eq("id", spaceId);

    if (spaceError) {
      setMessage(spaceError.message);
      return;
    }

    const { error: docError } = await (supabase
      .from("listing_ownership_documents") as any)
      .update({ status: nextStatus })
      .eq("space_id", spaceId);

    if (docError) {
      setMessage(docError.message);
      return;
    }

    const ownerVerified = (targetSpace.owner_verification_status || "pending") === "verified";
    const bankVerified = (targetSpace.bank_verification_status || "pending") === "verified";
    const shouldAutoActivate =
      nextStatus === "verified" &&
      ownerVerified &&
      bankVerified &&
      (targetSpace.status || "pending") === "pending";

    if (shouldAutoActivate) {
      const { error: activateError } = await (supabase.from("spaces") as any)
        .update({
          ownership_proof_status: nextStatus,
          status: "active",
          listing_admin_comment: adminComment,
        })
        .eq("id", spaceId);

      if (activateError) {
        setMessage(activateError.message);
        return;
      }

      setSpaces((current) =>
        current.map((space) =>
          space.id === spaceId
            ? {
              ...space,
              ownership_proof_status: nextStatus,
              status: "active",
              listing_admin_comment: adminComment,
            }
            : space
        )
      );

      await fireListingEvent(spaceId, "listing_activated", adminComment);

      setMessage(
        "Ownership proof marked as verified. Listing activated automatically."
      );
      return;
    }

    setSpaces((current) =>
      current.map((space) =>
        space.id === spaceId
          ? {
            ...space,
            ownership_proof_status: nextStatus,
            listing_admin_comment: adminComment,
          }
          : space
      )
    );

    if (nextStatus === "verified") {
      await fireListingEvent(spaceId, "ownership_proof_verified", adminComment);
    }

    setMessage(
      nextStatus === "verified"
        ? "Ownership proof marked as verified. Listing is still pending until all checks are approved."
        : nextStatus === "rejected"
          ? "Ownership proof marked as rejected."
          : "Ownership proof marked as pending."
    );
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

    const { error } = await (supabase.from("spaces") as any)
      .update({ platform_fee_percent: parsedValue })
      .eq("id", spaceId);

    if (error) {
      setMessage(error.message);
      setSavingFeeId(null);
      return;
    }

    setSpaces((current) =>
      current.map((space) =>
        space.id === spaceId
          ? { ...space, platform_fee_percent: parsedValue }
          : space
      )
    );

    setFeeInputs((current) => ({
      ...current,
      [spaceId]: String(parsedValue),
    }));

    setMessage(`Platform fee updated to ${parsedValue}% for this listing.`);
    setSavingFeeId(null);
  }

  function toggleListing(spaceId: string) {
    setExpandedListings((current) => ({
      ...current,
      [spaceId]: !current[spaceId],
    }));
  }

  function getStatusBadgeClass(status: string | null) {
    if (status === "active") return "bg-green-100 text-green-800";
    if (status === "paused") return "bg-yellow-100 text-yellow-800";
    if (status === "rejected") return "bg-red-100 text-red-800";
    if (status === "pending") return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-700";
  }

  function getOwnershipBadgeClass(status: string | null | undefined) {
    if (status === "verified") return "bg-green-100 text-green-800";
    if (status === "rejected") return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  }

  function getVerificationBadgeClass(status: string | null | undefined) {
    if (status === "verified") return "bg-green-100 text-green-800";
    if (status === "rejected") return "bg-red-100 text-red-800";
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

  function getOwnerDisplayName(space: Space) {
    const joined = `${space.owner_first_name || ""} ${space.owner_last_name || ""}`.trim();
    return joined || space.owner_full_name || space.owner_email || "Owner not set";
  }

  const filteredSpaces = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return spaces.filter((space) => {
      const matchesStatus =
        statusFilter === "all" || (space.status || "pending") === statusFilter;

      if (!matchesStatus) return false;

      if (!normalizedSearch) return true;

      const searchableText = [
        space.title,
        space.address_line_1,
        space.suburb,
        space.city,
        space.space_type,
        space.booking_unit,
        space.owner_first_name,
        space.owner_last_name,
        space.owner_full_name,
        space.owner_email,
        space.owner_phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [spaces, statusFilter, searchQuery]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl rounded-md border border-gray-300 p-6 shadow-sm">
          Loading spaces...
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-md border border-red-300 bg-red-50 p-6">
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
        <h1 className="mb-2 text-4xl font-bold">Admin - Spaces</h1>
        <p className="mb-8 text-gray-600">
          Review, approve, pause, reject listings, and set platform fee.
        </p>

        <div className="mb-5 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin#users-section"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Verification
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          {["all", "pending", "active", "paused", "rejected"].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md border px-4 py-2 text-sm ${statusFilter === filter ? "bg-black text-white" : "bg-white"
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
              placeholder="Search by listing, address, city, suburb, type, booking unit, owner name, email, or phone"
              className="w-full border-0 bg-transparent text-sm text-[#192a3a] outline-none"
            />
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
            {message}
          </div>
        )}

        {filteredSpaces.length === 0 ? (
          <div className="rounded-md border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
            No spaces found.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSpaces.map((space) => {
              const missingChecks = getMissingChecks(space);
              const canActivate = missingChecks.length === 0;
              // compact expandable layout
              return (
                <div
                  key={space.id}
                  className="overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleListing(space.id)}
                    className="flex w-full items-start gap-4 p-4 text-left"
                  >
                    <div className="relative h-28 w-36 shrink-0 overflow-hidden rounded-sm bg-gray-100">
                      {space.cover_image_url ? (
                        <Image
                          src={space.cover_image_url}
                          alt={space.title || "Listing image"}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-500">
                          No image yet
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-semibold">{space.title}</h2>
                          <p className="mt-1 text-sm text-gray-600">
                            {[space.address_line_1, space.suburb, space.city]
                              .filter(Boolean)
                              .join(", ") || "Address not set"}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            Owner: {getOwnerDisplayName(space)}
                            {space.owner_email ? ` | ${space.owner_email}` : ""}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            Type: {space.space_type || "Not set"} | Booking: {space.booking_unit || "Not set"}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            Created: {space.created_at ? new Date(space.created_at).toLocaleString() : "Unknown"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                              space.status
                            )}`}
                          >
                            {space.status || "pending"}
                          </span>

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getVerificationBadgeClass(
                              space.owner_verification_status
                            )}`}
                          >
                            Owner: {space.owner_verification_status || "pending"}
                          </span>

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getVerificationBadgeClass(
                              space.bank_verification_status
                            )}`}
                          >
                            Bank: {space.bank_verification_status || "pending"}
                          </span>

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getOwnershipBadgeClass(
                              space.ownership_proof_status
                            )}`}
                          >
                            Ownership proof: {space.ownership_proof_status || "pending"}
                          </span>

                          {expandedListings[space.id] ? (
                            <ChevronUp className="ml-1 h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="ml-1 h-5 w-5 text-gray-500" />
                          )}
                        </div>
                      </div>

                    </div>
                  </button>

                  {expandedListings[space.id] && (
                    <div className="border-t border-gray-200 px-4 pb-4 pt-4">
                      {(space.status || "pending") === "pending" && (
                        <div className="mb-4 rounded-sm border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                          This listing is awaiting admin approval and is not yet visible to the public.
                        </div>
                      )}

                      {!canActivate && (
                        <div className="mb-4 rounded-sm border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                          This listing cannot be activated yet. Missing: {missingChecks.join(", ")}.
                        </div>
                      )}

                      {space.listing_admin_comment && (
                        <div className="mb-4 rounded-sm border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                          <span className="font-medium">Admin comment:</span> {space.listing_admin_comment}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                          <p className="mb-3 text-sm font-medium text-gray-700">Owner details</p>
                          <div className="space-y-2 text-sm text-gray-700">
                            <p>
                              <span className="font-medium">Name:</span> {getOwnerDisplayName(space)}
                            </p>
                            <p>
                              <span className="font-medium">Email:</span> {space.owner_email || "Email not set"}
                            </p>
                            <p>
                              <span className="font-medium">Phone:</span> {space.owner_phone || "Phone not set"}
                            </p>
                            <p>
                              <span className="font-medium">Owner ID:</span> {space.owner_id}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                          <p className="mb-3 text-sm font-medium text-gray-700">Platform fee</p>

                          <div className="flex flex-wrap items-center gap-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={feeInputs[space.id] || ""}
                              onChange={(e) =>
                                setFeeInputs((current) => ({
                                  ...current,
                                  [space.id]: e.target.value,
                                }))
                              }
                              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none"
                            />

                            <span className="text-sm text-gray-600">%</span>

                            <button
                              type="button"
                              onClick={() => savePlatformFee(space.id)}
                              disabled={savingFeeId === space.id}
                              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {savingFeeId === space.id ? "Saving..." : "Save fee"}
                            </button>
                          </div>

                          <p className="mt-2 text-xs text-gray-500">
                            Current saved fee: {Number(space.platform_fee_percent ?? 15)}%
                          </p>
                        </div>

                        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-700">Ownership proof</p>
                              <div className="mt-2">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getOwnershipBadgeClass(
                                    space.ownership_proof_status
                                  )}`}
                                >
                                  {space.ownership_proof_status || "pending"}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              {space.ownership_proof_url ? (
                                <a
                                  href={space.ownership_proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                                >
                                  <FileText className="h-4 w-4" />
                                  View ownership proof
                                </a>
                              ) : (
                                <span className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                                  No ownership proof uploaded
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => updateOwnershipProofStatus(space.id, "verified")}
                                className="inline-flex items-center gap-2 rounded-md border border-green-300 px-4 py-2 text-sm text-green-700"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                Mark verified
                              </button>

                              <button
                                type="button"
                                onClick={() => updateOwnershipProofStatus(space.id, "pending")}
                                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                              >
                                <CircleDashed className="h-4 w-4" />
                                Mark pending
                              </button>

                              <button
                                type="button"
                                onClick={() => updateOwnershipProofStatus(space.id, "rejected")}
                                className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700"
                              >
                                <XCircle className="h-4 w-4" />
                                Mark rejected
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                          <p className="mb-3 text-sm font-medium text-gray-700">Listing comment</p>
                          <textarea
                            value={listingComments[space.id] || ""}
                            onChange={(e) =>
                              setListingComments((current) => ({
                                ...current,
                                [space.id]: e.target.value,
                              }))
                            }
                            placeholder="Add clarification needed, pending reason, or rejection reason"
                            className="min-h-[96px] w-full rounded-md border border-gray-300 p-3 text-sm outline-none"
                          />
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Link
                            href={`/spaces/${space.id}`}
                            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                          >
                            <Eye className="h-4 w-4" />
                            View listing
                          </Link>

                          <button
                            type="button"
                            onClick={() => updateSpaceStatus(space.id, "active")}
                            disabled={!canActivate}
                            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm ${canActivate
                                ? "bg-black text-white"
                                : "cursor-not-allowed bg-gray-200 text-gray-500"
                              }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve / Activate
                          </button>

                          <button
                            type="button"
                            onClick={() => updateSpaceStatus(space.id, "paused")}
                            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                          >
                            <PauseCircle className="h-4 w-4" />
                            Pause
                          </button>

                          <button
                            type="button"
                            onClick={() => updateSpaceStatus(space.id, "pending")}
                            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
                          >
                            <CircleDashed className="h-4 w-4" />
                            Pending / Need clarification
                          </button>

                          <button
                            type="button"
                            onClick={() => updateSpaceStatus(space.id, "rejected")}
                            className="inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject with reason
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}