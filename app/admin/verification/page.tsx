"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Landmark,
  LayoutDashboard,
  List,
  Mail,
  Phone,
  Users,
  UserSquare2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

type AdminProfileRow = {
  role: string | null;
};

type OwnerVerificationDocument = {
  id: string;
  owner_id: string;
  document_type: string;
  file_url: string | null;
  file_path: string | null;
  status: string | null;
  uploaded_at: string | null;
};

type OwnerBankDetails = {
  id: string;
  owner_id: string;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_type: string | null;
  branch_code: string | null;
  proof_of_bank_url: string | null;
  proof_of_bank_path: string | null;
  status: string | null;
  uploaded_at: string | null;
};

type OwnerVerificationRecord = {
  owner_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  bankProofUrl?: string | null;
  idFrontPath?: string | null;
  idBackPath?: string | null;
  bankProofPath?: string | null;
  bankDetails?: OwnerBankDetails | null;
  listingTitles: string[];
};

export default function AdminVerificationPage() {
  const [role, setRole] = useState<string | null>(null);
  const [records, setRecords] = useState<OwnerVerificationRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<
    Record<string, "identity" | "bank" | null>
  >({});
  const [previewDocument, setPreviewDocument] = useState<{
    title: string;
    url: string;
    isImage: boolean;
  } | null>(null);
  const [ownerComment, setOwnerComment] = useState<Record<string, string>>({});
  const [bankComment, setBankComment] = useState<Record<string, string>>({});

  useEffect(() => {
    loadVerificationRecords();
  }, []);

  async function loadVerificationRecords() {
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

    const { data: rawProfileRows, error: profileError } = await (supabase
      .from("profiles") as any)
      .select(
        "id, role, first_name, last_name, phone, email, owner_verification_status, bank_verification_status"
      )
      .eq("is_host", true);

    if (profileError) {
      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    const hostProfiles = (rawProfileRows || []) as ProfileRow[];
    const ownerIds = hostProfiles.map((profile) => profile.id);

    const documentMap = new Map<string, OwnerVerificationDocument[]>();
    const bankMap = new Map<string, OwnerBankDetails>();
    const listingTitleMap = new Map<string, string[]>();

    if (ownerIds.length > 0) {
      const { data: docsData, error: docsError } = await (supabase
        .from("owner_verification_documents") as any)
        .select("id, owner_id, document_type, file_url, file_path, status, uploaded_at")
        .in("owner_id", ownerIds)
        .order("id", { ascending: false });

      if (docsError) {
        setMessage(docsError.message);
        setLoading(false);
        return;
      }

      for (const doc of (docsData || []) as OwnerVerificationDocument[]) {
        const current = documentMap.get(doc.owner_id) || [];
        current.push(doc);
        documentMap.set(doc.owner_id, current);
      }

      const { data: bankRows, error: bankError } = await (supabase
        .from("owner_bank_details") as any)
        .select(
          "id, owner_id, account_holder_name, bank_name, account_number, account_type, branch_code, proof_of_bank_url, proof_of_bank_path, status, uploaded_at"
        )
        .in("owner_id", ownerIds);

      if (bankError) {
        setMessage(bankError.message);
        setLoading(false);
        return;
      }

      for (const bank of (bankRows || []) as OwnerBankDetails[]) {
        if (!bankMap.has(bank.owner_id)) {
          bankMap.set(bank.owner_id, bank);
        }
      }

      const { data: spaceRows, error: spaceError } = await (supabase
        .from("spaces") as any)
        .select("id, owner_id, title")
        .in("owner_id", ownerIds)
        .order("created_at", { ascending: false });

      if (spaceError) {
        setMessage(spaceError.message);
        setLoading(false);
        return;
      }

      for (const space of (spaceRows || []) as {
        id: string;
        owner_id: string;
        title: string | null;
      }[]) {
        const current = listingTitleMap.get(space.owner_id) || [];
        if (space.title) {
          current.push(space.title);
        }
        listingTitleMap.set(space.owner_id, current);
      }
    }

    const merged: OwnerVerificationRecord[] = hostProfiles.map((profile) => {
      const docs = documentMap.get(profile.id) || [];
      const idFront = docs.find((doc) => doc.document_type === "id_front");
      const idBack = docs.find((doc) => doc.document_type === "id_back");
      const bankDetails = bankMap.get(profile.id) || null;

      return {
        owner_id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        email: profile.email,
        owner_verification_status: profile.owner_verification_status || "pending",
        bank_verification_status: profile.bank_verification_status || "pending",
        idFrontUrl: null,
        idBackUrl: null,
        bankProofUrl: null,
        idFrontPath: idFront?.file_path || null,
        idBackPath: idBack?.file_path || null,
        bankProofPath: bankDetails?.proof_of_bank_path || null,
        bankDetails,
        listingTitles: listingTitleMap.get(profile.id) || [],
      };
    });

    const recordsWithFreshUrls: OwnerVerificationRecord[] = await Promise.all(
      merged.map(async (record) => {
        let idFrontUrl: string | null = null;
        let idBackUrl: string | null = null;
        let bankProofUrl: string | null = null;

        if (record.idFrontPath) {
          const { data, error } = await supabase.storage
            .from("owner-verification")
            .createSignedUrl(record.idFrontPath, 60 * 60);

          if (error) {
            console.error("ID front signed URL error:", error.message, record.idFrontPath);
          }

          idFrontUrl = data?.signedUrl || null;
        }

        if (record.idBackPath) {
          const { data, error } = await supabase.storage
            .from("owner-verification")
            .createSignedUrl(record.idBackPath, 60 * 60);

          if (error) {
            console.error("ID back signed URL error:", error.message, record.idBackPath);
          }

          idBackUrl = data?.signedUrl || null;
        }

        if (record.bankProofPath) {
          const { data, error } = await supabase.storage
            .from("bank-proofs")
            .createSignedUrl(record.bankProofPath, 60 * 60);

          if (error) {
            console.error("Bank proof signed URL error:", error.message, record.bankProofPath);
          }

          bankProofUrl = data?.signedUrl || null;
        }

        return {
          ...record,
          idFrontUrl,
          idBackUrl,
          bankProofUrl,
        };
      })
    );

    setRecords(recordsWithFreshUrls);
    setLoading(false);
  }

  async function updateOwnerVerificationStatus(
    ownerId: string,
    nextStatus: "verified" | "pending" | "rejected"
  ) {
    setMessage("");

    const comment = ownerComment[ownerId] || null;

    const { error } = await (supabase.from("profiles") as any)
      .update({
        owner_verification_status: nextStatus,
        owner_verification_comment: comment,
      })
      .eq("id", ownerId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await checkAndActivateListings(ownerId);

    setMessage(`Owner verification updated to ${nextStatus}.`);
    await loadVerificationRecords();
  }

  async function updateBankVerificationStatus(
    ownerId: string,
    nextStatus: "verified" | "pending" | "rejected"
  ) {
    setMessage("");

    const comment = bankComment[ownerId] || null;

    const { error: profileError } = await (supabase.from("profiles") as any)
      .update({
        bank_verification_status: nextStatus,
        bank_verification_comment: comment,
      })
      .eq("id", ownerId);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    const { error: bankError } = await (supabase.from("owner_bank_details") as any)
      .update({ status: nextStatus })
      .eq("owner_id", ownerId);

    if (bankError) {
      setMessage(bankError.message);
      return;
    }

    await checkAndActivateListings(ownerId);

    setMessage(`Bank verification updated to ${nextStatus}.`);
    await loadVerificationRecords();
  }

  async function checkAndActivateListings(ownerId: string) {
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("owner_verification_status, bank_verification_status")
      .eq("id", ownerId)
      .single();

    if (!profile) return;

    if (
      profile.owner_verification_status !== "verified" ||
      profile.bank_verification_status !== "verified"
    ) {
      return;
    }

    const { data: spaces } = await (supabase.from("spaces") as any)
      .select("id, ownership_proof_status, status")
      .eq("owner_id", ownerId);

    if (!spaces) return;

    const eligible = spaces.filter(
      (space: { id: string; ownership_proof_status: string | null; status: string | null }) =>
        (space.status || "pending") === "pending" &&
        (space.ownership_proof_status || "pending") === "verified"
    );

    if (eligible.length === 0) return;

    const ids = eligible.map((space: { id: string }) => space.id);

    await (supabase.from("spaces") as any)
      .update({ status: "active" })
      .in("id", ids);
  }

  function getBadgeClass(status: string | null | undefined) {
    if (status === "verified") return "bg-green-100 text-green-800";
    if (status === "rejected") return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  }

  function displayName(record: OwnerVerificationRecord) {
    const name = `${record.first_name || ""} ${record.last_name || ""}`.trim();
    if (name) return name;
    if (record.email) return record.email;
    return "Name not set";
  }

  function toggleSection(ownerId: string, section: "identity" | "bank") {
    setExpandedSections((current) => ({
      ...current,
      [ownerId]: current[ownerId] === section ? null : section,
    }));
  }

  function openDocumentPreview(title: string, url: string) {
    const lowerUrl = url.toLowerCase();
    const isImage =
      lowerUrl.includes(".jpg") ||
      lowerUrl.includes(".jpeg") ||
      lowerUrl.includes(".png") ||
      lowerUrl.includes(".webp") ||
      lowerUrl.includes(".gif") ||
      lowerUrl.includes("format=jpg") ||
      lowerUrl.includes("format=jpeg") ||
      lowerUrl.includes("format=png") ||
      lowerUrl.includes("format=webp") ||
      lowerUrl.includes("format=gif");

    setPreviewDocument({ title, url, isImage });
  }

  function actionButtonClass(variant: "verified" | "pending" | "rejected", disabled?: boolean) {
    const base =
      "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors";

    if (variant === "verified") {
      return `${base} border-green-300 bg-green-50 text-green-700 ${disabled ? "cursor-not-allowed opacity-55" : "hover:bg-green-100"
        }`;
    }

    if (variant === "rejected") {
      return `${base} border-red-300 bg-red-50 text-red-700 ${disabled ? "cursor-not-allowed opacity-55" : "hover:bg-red-100"
        }`;
    }

    return `${base} border-gray-300 bg-white text-[#192a3a] ${disabled ? "cursor-not-allowed opacity-55" : "hover:bg-gray-50"
      }`;
  }

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      const matchesStatus =
        statusFilter === "all" ||
        (record.owner_verification_status || "pending") === statusFilter ||
        (record.bank_verification_status || "pending") === statusFilter;

      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      const hostName = `${record.first_name || ""} ${record.last_name || ""}`
        .trim()
        .toLowerCase();
      const phone = (record.phone || "").toLowerCase();
      const ownerId = record.owner_id.toLowerCase();
      const listingTitles = record.listingTitles.join(" ").toLowerCase();

      return (
        hostName.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        ownerId.includes(normalizedSearch) ||
        listingTitles.includes(normalizedSearch)
      );
    });
  }, [records, statusFilter, searchQuery]);

  const summaryCounts = useMemo(() => {
    const pendingOwner = records.filter(
      (record) => (record.owner_verification_status || "pending") === "pending"
    ).length;

    const pendingBank = records.filter(
      (record) => (record.bank_verification_status || "pending") === "pending"
    ).length;

    const fullyVerified = records.filter(
      (record) =>
        (record.owner_verification_status || "pending") === "verified" &&
        (record.bank_verification_status || "pending") === "verified"
    ).length;

    return {
      pendingOwner,
      pendingBank,
      fullyVerified,
    };
  }, [records]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl rounded-xl border border-gray-300 p-6 shadow-sm">
          Loading verification records...
        </div>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-300 bg-red-50 p-6">
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
        <h1 className="mb-1 text-4xl font-bold text-[#192a3a]">Admin - Verification</h1>
        <p className="mb-5 text-gray-600">
          Review owner identity and bank verification details.
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
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4" />
            Spaces
          </Link>
          <Link
            href="/admin/verification"
            className="inline-flex items-center gap-2 rounded-md border border-[#192a3a] bg-[#192a3a] px-4 py-2 text-sm text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            Verification
          </Link>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-blue-800">
              Pending owner verification
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-[#192a3a]">
                {summaryCounts.pendingOwner}
              </p>
              <p className="text-xs text-blue-900">
                Waiting for identity approval
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
              Pending bank verification
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-[#192a3a]">
                {summaryCounts.pendingBank}
              </p>
              <p className="text-xs text-amber-900">
                Waiting for bank review
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-green-800">
              Fully verified hosts
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-2xl font-bold text-[#192a3a]">
                {summaryCounts.fullyVerified}
              </p>
              <p className="text-xs text-green-900">
                Ready for listing activation
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <label
            htmlFor="verification-search"
            className="mb-1.5 block text-sm font-medium text-[#192a3a]"
          >
            Search host or listing
          </label>
          <input
            id="verification-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by host name, phone, owner ID, or listing title"
            className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#192a3a]"
          />
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {["all", "pending", "verified", "rejected"].map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md border px-4 py-1.5 text-sm transition-colors ${statusFilter === filter
                ? "border-[#192a3a] bg-[#192a3a] text-white"
                : "border-gray-300 bg-white text-[#192a3a]"
                }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-6 rounded-lg bg-green-100 p-4 text-sm text-green-800">
            {message}
          </div>
        )}

        {filteredRecords.length === 0 ? (
          <div className="rounded-lg border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
            No verification records found for the current filters or search.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((record) => {
              const expandedSection = expandedSections[record.owner_id] || null;
              return (
                <div
                  key={record.owner_id}
                  className="rounded-md border border-gray-300 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <h2 className="text-2xl font-semibold text-[#192a3a]">{displayName(record)}</h2>
                      <p className="mt-1 text-sm text-gray-500">Owner verification</p>

                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-700">
                        <div className="min-w-[320px] flex-[2.2] rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                          <div className="flex items-center gap-2 text-gray-500">
                            <List className="h-4 w-4" />
                            <p className="text-[11px] uppercase tracking-wide">Listings</p>
                          </div>
                          <p className="mt-1 text-[#192a3a]">
                            {record.listingTitles.length > 0
                              ? record.listingTitles.join(", ")
                              : "No listings yet"}
                          </p>
                        </div>

                        <div className="min-w-[180px] flex-[0.9] rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                          <div className="flex items-center gap-2 text-gray-500">
                            <Phone className="h-4 w-4" />
                            <p className="text-[11px] uppercase tracking-wide">Phone</p>
                          </div>
                          <p className="mt-1 whitespace-nowrap text-[#192a3a]">
                            {record.phone || "Phone not set"}
                          </p>
                        </div>

                        <div className="min-w-[220px] flex-[1.15] rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                          <div className="flex items-center gap-2 text-gray-500">
                            <Mail className="h-4 w-4" />
                            <p className="text-[11px] uppercase tracking-wide">Email</p>
                          </div>
                          {record.email ? (
                            <a
                              href={`mailto:${record.email}`}
                              className="mt-1 block truncate text-[#192a3a] underline-offset-2 hover:underline"
                              title={record.email}
                            >
                              {record.email}
                            </a>
                          ) : (
                            <p className="mt-1 text-[#192a3a]">Not set</p>
                          )}
                        </div>

                        <div className="min-w-[260px] flex-[1.35] rounded-sm border border-gray-200 bg-gray-50 px-4 py-2.5">
                          <div className="flex items-center gap-2 text-gray-500">
                            <UserSquare2 className="h-4 w-4" />
                            <p className="text-[11px] uppercase tracking-wide">Owner ID</p>
                          </div>
                          <p className="mt-1 truncate text-[#192a3a] lg:text-sm" title={record.owner_id}>
                            {record.owner_id}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getBadgeClass(
                          record.owner_verification_status
                        )}`}
                      >
                        Owner: {record.owner_verification_status || "pending"}
                      </span>

                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getBadgeClass(
                          record.bank_verification_status
                        )}`}
                      >
                        Bank: {record.bank_verification_status || "pending"}
                      </span>
                    </div>
                  </div>

                  <div className="mb-3 border-t border-gray-200" />

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div
                      className={`rounded-sm border ${record.owner_verification_status === "verified"
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 bg-gray-50"
                        }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(record.owner_id, "identity")}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-[#192a3a]" />
                          <div>
                            <h3 className="text-xl font-semibold text-[#192a3a]">Identity documents</h3>
                            <p className="text-sm text-gray-500">Review ID front and back documents</p>
                          </div>
                        </div>
                        {expandedSection === "identity" ? (
                          <ChevronUp className="h-5 w-5 text-[#192a3a]" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-[#192a3a]" />
                        )}
                      </button>

                      {expandedSection === "identity" && (
                        <div className="border-t border-black/5 px-4 pb-4 pt-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">ID front</p>
                              <div className="mt-3">
                                {record.idFrontUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openDocumentPreview("ID document front", record.idFrontUrl as string)
                                    }
                                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                                  >
                                    <FileText className="h-4 w-4" />
                                    View document
                                  </button>
                                ) : (
                                  <span className="text-sm text-red-700">Missing</span>
                                )}
                              </div>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">ID back</p>
                              <div className="mt-3">
                                {record.idBackUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openDocumentPreview("ID document back", record.idBackUrl as string)
                                    }
                                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                                  >
                                    <FileText className="h-4 w-4" />
                                    View document
                                  </button>
                                ) : (
                                  <span className="text-sm text-red-700">Missing</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <textarea
                            value={ownerComment[record.owner_id] || ""}
                            onChange={(e) =>
                              setOwnerComment((prev) => ({
                                ...prev,
                                [record.owner_id]: e.target.value,
                              }))
                            }
                            placeholder="Add comment (reason for rejection or clarification)"
                            className="mt-3 w-full rounded-md border border-gray-300 p-2 text-sm"
                          />
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateOwnerVerificationStatus(record.owner_id, "verified")
                              }
                              disabled={record.owner_verification_status === "verified"}
                              className={actionButtonClass(
                                "verified",
                                record.owner_verification_status === "verified"
                              )}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Verified
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateOwnerVerificationStatus(record.owner_id, "pending")
                              }
                              disabled={record.owner_verification_status === "pending"}
                              className={actionButtonClass(
                                "pending",
                                record.owner_verification_status === "pending"
                              )}
                            >
                              <Clock3 className="h-4 w-4" />
                              Pending
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateOwnerVerificationStatus(record.owner_id, "rejected")
                              }
                              disabled={record.owner_verification_status === "rejected"}
                              className={actionButtonClass(
                                "rejected",
                                record.owner_verification_status === "rejected"
                              )}
                            >
                              <XCircle className="h-4 w-4" />
                              Rejected
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div
                      className={`rounded-sm border ${record.bank_verification_status === "verified"
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 bg-gray-50"
                        }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(record.owner_id, "bank")}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <Landmark className="h-5 w-5 text-[#192a3a]" />
                          <div>
                            <h3 className="text-xl font-semibold text-[#192a3a]">Bank details</h3>
                            <p className="text-sm text-gray-500">Review payout and proof of bank account</p>
                          </div>
                        </div>
                        {expandedSection === "bank" ? (
                          <ChevronUp className="h-5 w-5 text-[#192a3a]" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-[#192a3a]" />
                        )}
                      </button>

                      {expandedSection === "bank" && (
                        <div className="border-t border-black/5 px-4 pb-4 pt-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Account holder</p>
                              <p className="mt-1 text-[#192a3a]">
                                {record.bankDetails?.account_holder_name || "Not set"}
                              </p>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Bank name</p>
                              <p className="mt-1 text-[#192a3a]">
                                {record.bankDetails?.bank_name || "Not set"}
                              </p>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Account number</p>
                              <p className="mt-1 text-[#192a3a]">
                                {record.bankDetails?.account_number || "Not set"}
                              </p>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Account type</p>
                              <p className="mt-1 text-[#192a3a]">
                                {record.bankDetails?.account_type || "Not set"}
                              </p>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Branch code</p>
                              <p className="mt-1 text-[#192a3a]">
                                {record.bankDetails?.branch_code || "Not set"}
                              </p>
                            </div>

                            <div className="rounded-sm border border-white/70 bg-white/60 p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-500">Bank proof</p>
                              <div className="mt-3">
                                {record.bankProofUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openDocumentPreview("Bank proof", record.bankProofUrl as string)
                                    }
                                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                                  >
                                    <FileText className="h-4 w-4" />
                                    View proof
                                  </button>
                                ) : (
                                  <span className="text-sm text-red-700">Missing</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <textarea
                            value={bankComment[record.owner_id] || ""}
                            onChange={(e) =>
                              setBankComment((prev) => ({
                                ...prev,
                                [record.owner_id]: e.target.value,
                              }))
                            }
                            placeholder="Add bank verification comment"
                            className="mt-3 w-full rounded-md border border-gray-300 p-2 text-sm"
                          />
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateBankVerificationStatus(record.owner_id, "verified")
                              }
                              disabled={record.bank_verification_status === "verified"}
                              className={actionButtonClass(
                                "verified",
                                record.bank_verification_status === "verified"
                              )}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Verified
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateBankVerificationStatus(record.owner_id, "pending")
                              }
                              disabled={record.bank_verification_status === "pending"}
                              className={actionButtonClass(
                                "pending",
                                record.bank_verification_status === "pending"
                              )}
                            >
                              <Clock3 className="h-4 w-4" />
                              Pending
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateBankVerificationStatus(record.owner_id, "rejected")
                              }
                              disabled={record.bank_verification_status === "rejected"}
                              className={actionButtonClass(
                                "rejected",
                                record.bank_verification_status === "rejected"
                              )}
                            >
                              <XCircle className="h-4 w-4" />
                              Rejected
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {(record.owner_verification_status !== "verified" ||
                    record.bank_verification_status !== "verified") && (
                      <div className="mt-4 rounded-sm border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        Listings for this owner can only be activated once owner verification,
                        bank verification, and listing ownership proof are all marked as verified.
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
        {previewDocument && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
            <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-[#192a3a]">
                  {previewDocument.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewDocument(null)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-[#192a3a] hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <div className="flex flex-1 items-center justify-center bg-gray-100 p-4">
                {previewDocument.isImage ? (
                  <img
                    src={previewDocument.url}
                    alt={previewDocument.title}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={previewDocument.url}
                    title={previewDocument.title}
                    className="h-full w-full rounded-sm bg-white"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3">
                <a
                  href={previewDocument.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-[#192a3a] hover:bg-gray-50"
                >
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}