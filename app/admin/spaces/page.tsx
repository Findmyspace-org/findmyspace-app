"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ClipboardList,
  Eye,
  FileText,
  History,
  LayoutDashboard,
  PauseCircle,
  Save,
  Search,
  ShieldCheck,
  MessageSquare,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import DecisionSuggestion from "@/app/components/DecisionSuggestion";

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

type OwnerMessageHistoryItem = {
  id: string;
  content: string;
  createdAt: string;
  source: "admin_note" | "admin_message";
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
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofModalUrl, setProofModalUrl] = useState<string | null>(null);
  const [proofModalTitle, setProofModalTitle] = useState("Ownership proof");
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageModalSpaceId, setMessageModalSpaceId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageHistory, setMessageHistory] = useState<Record<string, OwnerMessageHistoryItem[]>>(
    {}
  );
  const [modalMounted, setModalMounted] = useState(false);

  useEffect(() => {
    loadAdminSpaces();
  }, []);

  useEffect(() => {
    setModalMounted(true);
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeProofModal();
        closeMessageModal();
      }
    }

    if (proofModalOpen || messageModalOpen) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [proofModalOpen, messageModalOpen]);

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

  function openProofModal(url: string, listingTitle: string) {
    setProofModalTitle(listingTitle ? `Ownership proof - ${listingTitle}` : "Ownership proof");
    setProofModalUrl(url);
    setProofModalOpen(true);
  }

  function closeProofModal() {
    setProofModalOpen(false);
    setProofModalUrl(null);
  }

  function openMessageModal(space: Space) {
    setMessageModalSpaceId(space.id);
    setMessageDraft("");
    setMessageModalOpen(true);
    setMessageHistory((current) => {
      if (current[space.id]) return current;
      const seeded: OwnerMessageHistoryItem[] = [];
      const adminNote = (space.listing_admin_comment || "").trim();
      if (adminNote) {
        seeded.push({
          id: `seed-${space.id}`,
          content: adminNote,
          createdAt: space.created_at || new Date().toISOString(),
          source: "admin_note",
        });
      }
      return { ...current, [space.id]: seeded };
    });
  }

  function closeMessageModal() {
    setMessageModalOpen(false);
    setMessageModalSpaceId(null);
    setMessageDraft("");
  }

  async function sendOwnerMessage(space: Space) {
    const trimmed = messageDraft.trim();
    if (!trimmed) {
      setMessage("Please enter a message before sending.");
      return;
    }

    setSendingMessage(true);
    setMessage("");

    const { error } = await (supabase.from("spaces") as any)
      .update({ listing_admin_comment: trimmed })
      .eq("id", space.id);

    if (error) {
      setSendingMessage(false);
      setMessage(error.message);
      return;
    }

    await fireListingEvent(space.id, "listing_pending", trimmed);

    setSpaces((current) =>
      current.map((item) =>
        item.id === space.id ? { ...item, listing_admin_comment: trimmed } : item
      )
    );

    const now = new Date().toISOString();
    setMessageHistory((current) => ({
      ...current,
      [space.id]: [
        ...(current[space.id] || []),
        {
          id: `msg-${space.id}-${Date.now()}`,
          content: trimmed,
          createdAt: now,
          source: "admin_message",
        },
      ],
    }));

    setListingComments((current) => ({
      ...current,
      [space.id]: trimmed,
    }));

    setMessageDraft("");
    setSendingMessage(false);
    setMessage("Message sent to owner and saved as admin note.");
  }

  function getProofFileType(url: string | null): "image" | "pdf" | "unknown" {
    if (!url) return "unknown";
    const clean = url.split("?")[0].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(clean)) return "image";
    if (/\.pdf$/.test(clean)) return "pdf";
    return "unknown";
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

  const buttonBase =
    "inline-flex items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50";
  const buttonNeutral =
    `${buttonBase} border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-300`;
  const buttonPrimary =
    `${buttonBase} border-[#192a3a] bg-[#192a3a] px-3 py-1.5 text-white shadow-sm hover:bg-[#22384d] hover:shadow active:bg-[#162534] focus-visible:ring-[#192a3a]`;
  const buttonPositive =
    `${buttonBase} border-green-300 bg-green-50 px-2.5 py-1.5 text-green-700 hover:border-green-400 hover:bg-green-100 active:bg-green-200 focus-visible:ring-green-400`;
  const buttonDestructive =
    `${buttonBase} border-red-300 bg-red-50 px-2.5 py-1.5 text-red-700 hover:border-red-400 hover:bg-red-100 active:bg-red-200 focus-visible:ring-red-400`;
  const tooltipSurface =
    "pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-md border border-gray-200 bg-[#111827] px-2 py-1.5 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100";

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
            href="/admin/activity"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Activity
          </Link>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Users
          </Link>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Bookings
          </Link>
          <Link
            href="/admin/spaces"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/listings"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            Listings
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Verification
          </Link>
          <Link
            href="/admin/messages"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </Link>
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Finance
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
                    <div className="border-t border-gray-200 bg-[#fcfcfd] px-4 pb-4 pt-3">
                      {(space.status || "pending") === "pending" && (
                        <div className="mb-3">
                          <DecisionSuggestion
                            variant="info"
                            size="sm"
                            multiline
                            text="This listing is awaiting admin approval and is not yet visible to the public."
                            className="max-w-full"
                          />
                        </div>
                      )}

                      {!canActivate && (
                        <div className="mb-3">
                          <DecisionSuggestion
                            variant="warning"
                            size="sm"
                            multiline
                            text={`This listing cannot be activated yet. Missing: ${missingChecks.join(", ")}.`}
                            tooltip="Complete owner verification, bank verification, and ownership proof before activation."
                            className="max-w-full"
                          />
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="grid gap-2.5 lg:grid-cols-2">
                          <div className="rounded-sm border border-gray-200 bg-white p-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                              Owner
                            </p>
                            <div className="mt-1.5 space-y-0.5 text-sm text-[#192a3a]">
                              <p className="font-medium">{getOwnerDisplayName(space)}</p>
                              <p className="text-xs text-gray-600">{space.owner_email || "Email not set"}</p>
                              <p className="text-xs text-gray-600">{space.owner_phone || "Phone not set"}</p>
                            </div>
                            <p className="mt-1.5 text-[11px] text-gray-400">ID: {space.owner_id}</p>
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => openMessageModal(space)}
                                className={buttonNeutral}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Message owner
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="rounded-sm border border-gray-200 bg-white p-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-700">Ownership proof</p>
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getOwnershipBadgeClass(
                                      space.ownership_proof_status
                                    )}`}
                                  >
                                    {space.ownership_proof_status || "pending"}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {space.ownership_proof_url ? (
                                    <span className="group relative">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openProofModal(
                                            space.ownership_proof_url as string,
                                            space.title || "Listing"
                                          )
                                        }
                                        className={`${buttonNeutral} h-8 w-8 p-0`}
                                        aria-label="View proof"
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                      </button>
                                      <span className={tooltipSurface}>
                                        Open the uploaded ownership document for review.
                                      </span>
                                    </span>
                                  ) : (
                                    <DecisionSuggestion
                                      variant="warning"
                                      text="No proof uploaded"
                                      size="sm"
                                    />
                                  )}
                                  <span className="group relative">
                                    <button
                                      type="button"
                                      onClick={() => updateOwnershipProofStatus(space.id, "verified")}
                                      className={`${buttonPositive} h-8 w-8 p-0`}
                                      aria-label="Mark verified"
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    </button>
                                    <span className={tooltipSurface}>
                                      Use when the proof is valid and ownership is confirmed.
                                    </span>
                                  </span>
                                  <span className="group relative">
                                    <button
                                      type="button"
                                      onClick={() => updateOwnershipProofStatus(space.id, "pending")}
                                      className={`${buttonNeutral} h-8 w-8 p-0`}
                                      aria-label="Mark pending"
                                    >
                                      <CircleDashed className="h-3.5 w-3.5" />
                                    </button>
                                    <span className={tooltipSurface}>
                                      Use when more review is needed or clarification is required.
                                    </span>
                                  </span>
                                  <span className="group relative">
                                    <button
                                      type="button"
                                      onClick={() => updateOwnershipProofStatus(space.id, "rejected")}
                                      className={`${buttonDestructive} h-8 w-8 p-0`}
                                      aria-label="Mark rejected"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                    <span className={tooltipSurface}>
                                      Use when the proof is invalid, insufficient, or does not match the listing.
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-sm border border-gray-200 bg-white p-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">
                                  Platform fee
                                </span>
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
                                  className="w-24 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none"
                                />
                                <span className="text-sm text-gray-600">%</span>
                                <span className="text-xs text-gray-500">
                                  Current: {Number(space.platform_fee_percent ?? 15)}%
                                </span>
                                <div className="ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => savePlatformFee(space.id)}
                                    disabled={savingFeeId === space.id}
                                    className={buttonNeutral}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                    {savingFeeId === space.id ? "Saving..." : "Save"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-sm border border-gray-200 bg-white p-2">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <Link
                                  href={`/spaces/${space.id}`}
                                  className={buttonNeutral}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View listing
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => updateSpaceStatus(space.id, "active")}
                                  disabled={!canActivate}
                                  className={
                                    canActivate
                                      ? buttonPrimary
                                      : `${buttonBase} border-gray-200 bg-gray-200 px-3 py-1.5 text-gray-500`
                                  }
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Approve / Activate
                                </button>
                              </div>
                            </div>
                          </div>
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
      {modalMounted &&
        proofModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
              onClick={closeProofModal}
            />

            <div className="relative z-[10000] flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#192a3a]">
                    {proofModalTitle}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Review ownership proof without leaving approvals
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeProofModal}
                  className={`${buttonNeutral} h-8 w-8 shrink-0 p-0`}
                  aria-label="Close ownership proof modal"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 bg-[#f8fafb] p-3">
                {(() => {
                  const proofType = getProofFileType(proofModalUrl);

                  if (!proofModalUrl) {
                    return (
                      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
                        Ownership proof URL is missing.
                      </div>
                    );
                  }

                  if (proofType === "image") {
                    return (
                      <div className="relative h-full overflow-auto rounded-md border border-gray-200 bg-white">
                        <div className="relative mx-auto h-full min-h-[420px] max-w-4xl">
                          <Image
                            src={proofModalUrl}
                            alt="Ownership proof"
                            fill
                            className="object-contain"
                            unoptimized
                          />
                        </div>
                      </div>
                    );
                  }

                  if (proofType === "pdf") {
                    return (
                      <iframe
                        src={proofModalUrl}
                        title="Ownership proof document"
                        className="h-full w-full rounded-md border border-gray-200 bg-white"
                      />
                    );
                  }

                  return (
                    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-gray-300 bg-white p-6 text-center">
                      <p className="text-sm text-gray-700">
                        Preview is unavailable for this file type.
                      </p>
                      <a
                        href={proofModalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonNeutral}
                      >
                        Open document in new tab
                      </a>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}
      {modalMounted &&
        messageModalOpen &&
        messageModalSpaceId &&
        (() => {
          const targetSpace = spaces.find((space) => space.id === messageModalSpaceId);
          if (!targetSpace) return null;
          const history = messageHistory[targetSpace.id] || [];
          return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6">
              <div
                className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
                onClick={closeMessageModal}
              />
              <div className="relative z-[10000] flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[#192a3a]">
                      Message owner
                    </h3>
                    <p className="text-xs text-gray-500">
                      Send an update without leaving listing review
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeMessageModal}
                    className={`${buttonNeutral} h-8 w-8 shrink-0 p-0`}
                    aria-label="Close message owner modal"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-2 border-b border-gray-200 bg-[#f8fafb] px-4 py-3 text-xs text-gray-700 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Owner</p>
                    <p className="mt-0.5 font-medium text-[#192a3a]">{getOwnerDisplayName(targetSpace)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Email</p>
                    <p className="mt-0.5">{targetSpace.owner_email || "Email not set"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Phone</p>
                    <p className="mt-0.5">{targetSpace.owner_phone || "Phone not set"}</p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                    Message history
                  </p>
                  {history.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                      No messages yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-md border border-gray-200 bg-white px-3 py-2"
                        >
                          <p className="text-sm text-[#192a3a]">{entry.content}</p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {entry.source === "admin_message" ? "Admin message" : "Saved admin note"}{" "}
                            • {new Date(entry.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 bg-white px-4 py-3">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                    New message
                  </label>
                  <textarea
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    placeholder="Write a clear message to the owner..."
                    className="min-h-[88px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#192a3a]/30"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeMessageModal}
                      className={buttonNeutral}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => sendOwnerMessage(targetSpace)}
                      disabled={sendingMessage}
                      className={buttonPrimary}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {sendingMessage ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}
    </main>
  );
}