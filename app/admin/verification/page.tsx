"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FOCUS_HIGHLIGHT_CLASS,
  useFocusHighlight,
} from "@/lib/use-focus-highlight";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  List,
  Mail,
  MessageSquare,
  Phone,
  Users,
  UserSquare2,
  Wallet,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  AdminVerificationWorkspace,
  type QueueFilter,
} from "@/app/components/admin/AdminVerificationWorkspace";
import { deriveAdminVerificationQueueFlags } from "@/lib/workflow-state";
import { markNotificationsReadByRelatedClient } from "@/lib/mark-notifications-read-client";

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

function AdminVerificationPageContent({
  focusProfileId,
}: {
  focusProfileId: string | null;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [records, setRecords] = useState<OwnerVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("identity_pending");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{
    title: string;
    url: string;
    isImage: boolean;
  } | null>(null);
  const [ownerComment, setOwnerComment] = useState<Record<string, string>>({});
  const [bankComment, setBankComment] = useState<Record<string, string>>({});

  const { highlightedId } = useFocusHighlight({
    focusId: focusProfileId,
    ready: !loading,
    prefix: "verification-profile",
  });

  useEffect(() => {
    loadVerificationRecords();
  }, []);

  // When a profile is focused via `?profile=…`, broaden filter (so they're
  // visible regardless of pending/verified/rejected) and auto-expand identity.
  useEffect(() => {
    if (!focusProfileId || loading) return;
    const found = records.find((r) => r.owner_id === focusProfileId);
    if (!found) return;
    setQueueFilter("all");
    setSelectedOwnerId(focusProfileId);
  }, [focusProfileId, loading, records]);

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

    if (!hasAdminUiAccess(adminProfile?.role)) {
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

    setMessage(`Owner verification updated to ${nextStatus}.`);
    if (nextStatus === "verified" || nextStatus === "rejected") {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        await fetch("/api/admin/notifications/mark-related-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            relatedEntityType: "profile",
            relatedEntityId: ownerId,
            types: ["identity_submitted"],
          }),
        });
      }

      // Notify + email the host of the decision.
      try {
        await fetch("/api/notifications/verification-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: ownerId,
            eventType:
              nextStatus === "verified" ? "identity_verified" : "identity_rejected",
            adminComment: comment,
          }),
        });
      } catch (notifyErr) {
        console.error("Failed to notify host of identity decision:", notifyErr);
      }
    }
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

    setMessage(`Bank verification updated to ${nextStatus}.`);
    if (nextStatus === "verified" || nextStatus === "rejected") {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        await fetch("/api/admin/notifications/mark-related-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            relatedEntityType: "profile",
            relatedEntityId: ownerId,
            types: ["bank_submitted"],
          }),
        });
      }

      // Notify + email the host of the decision.
      try {
        await fetch("/api/notifications/verification-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: ownerId,
            eventType:
              nextStatus === "verified" ? "bank_verified" : "bank_rejected",
            adminComment: comment,
          }),
        });
      } catch (notifyErr) {
        console.error("Failed to notify host of bank decision:", notifyErr);
      }
    }
    await loadVerificationRecords();
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

  const summaryCounts = useMemo(() => {
    let identityPending = 0;
    let bankPending = 0;
    let completed = 0;
    for (const record of records) {
      const flags = deriveAdminVerificationQueueFlags({
        ownerVerificationStatus: record.owner_verification_status,
        bankVerificationStatus: record.bank_verification_status,
        hasIdFront: Boolean(record.idFrontPath || record.idFrontUrl),
        hasIdBack: Boolean(record.idBackPath || record.idBackUrl),
        hasBankProof: Boolean(record.bankProofPath || record.bankProofUrl),
      });
      if (flags.identityPending || flags.identityRejected) identityPending += 1;
      if (flags.bankPending || flags.bankRejected) bankPending += 1;
      if (flags.fullyVerified) completed += 1;
    }
    return { identityPending, bankPending, completed };
  }, [records]);

  useEffect(() => {
    if (selectedOwnerId) return;
    if (records.length > 0) {
      setSelectedOwnerId(records[0].owner_id);
    }
  }, [records, selectedOwnerId]);

  useEffect(() => {
    if (!selectedOwnerId) return;
    void markNotificationsReadByRelatedClient({
      relatedEntityType: "profile",
      relatedEntityId: selectedOwnerId,
      types: ["identity_submitted", "bank_submitted"],
    });
  }, [selectedOwnerId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-6xl rounded-xl border border-gray-300 p-6 shadow-sm">
          Loading verification records...
        </div>
      </main>
    );
  }

  if (!hasAdminUiAccess(role)) {
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

        {message ? (
          <div className="mb-4 rounded-lg bg-green-100 p-4 text-sm text-green-800">
            {message}
          </div>
        ) : null}

        <AdminVerificationWorkspace
          records={records}
          queueFilter={queueFilter}
          onQueueFilterChange={setQueueFilter}
          selectedOwnerId={selectedOwnerId}
          onSelectOwner={setSelectedOwnerId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          ownerComment={ownerComment}
          bankComment={bankComment}
          onOwnerCommentChange={(ownerId, value) =>
            setOwnerComment((prev) => ({ ...prev, [ownerId]: value }))
          }
          onBankCommentChange={(ownerId, value) =>
            setBankComment((prev) => ({ ...prev, [ownerId]: value }))
          }
          onVerifyIdentity={(ownerId, status) =>
            void updateOwnerVerificationStatus(ownerId, status)
          }
          onVerifyBank={(ownerId, status) =>
            void updateBankVerificationStatus(ownerId, status)
          }
          onPreviewDocument={openDocumentPreview}
          summaryCounts={summaryCounts}
        />

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

function AdminVerificationSearchParamsClient() {
  const searchParams = useSearchParams();
  const focusProfileId = searchParams.get("profile");
  return <AdminVerificationPageContent focusProfileId={focusProfileId} />;
}

export default function AdminVerificationPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10 text-sm text-gray-600">Loading…</div>
      }
    >
      <AdminVerificationSearchParamsClient />
    </Suspense>
  );
}