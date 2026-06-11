"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
} from "lucide-react";
import {
  adminQueueSummaryLabel,
  deriveAdminVerificationQueueFlags,
} from "@/lib/workflow-state";

export type AdminVerificationRecord = {
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
  bankDetails?: {
    account_holder_name: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_type: string | null;
    branch_code: string | null;
  } | null;
  listingTitles: string[];
};

export type QueueFilter =
  | "all"
  | "identity_pending"
  | "bank_pending"
  | "completed";

function displayName(record: AdminVerificationRecord) {
  const name = `${record.first_name || ""} ${record.last_name || ""}`.trim();
  return name || record.email || "Name not set";
}

type AdminVerificationRecordWithPaths = AdminVerificationRecord & {
  idFrontPath?: string | null;
  idBackPath?: string | null;
  bankProofPath?: string | null;
};

function recordFlags(record: AdminVerificationRecordWithPaths) {
  return deriveAdminVerificationQueueFlags({
    ownerVerificationStatus: record.owner_verification_status,
    bankVerificationStatus: record.bank_verification_status,
    hasIdFront: Boolean(record.idFrontUrl || record.idFrontPath),
    hasIdBack: Boolean(record.idBackUrl || record.idBackPath),
    hasBankProof: Boolean(record.bankProofUrl || record.bankProofPath),
  });
}

function statusBadgeClass(status: string | null | undefined) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-blue-100 text-blue-800";
}

function actionButtonClass(
  variant: "verified" | "pending" | "rejected",
  disabled?: boolean
) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors";
  if (variant === "verified") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-800 ${disabled ? "opacity-50" : "hover:bg-emerald-100"}`;
  }
  if (variant === "rejected") {
    return `${base} border-red-300 bg-red-50 text-red-800 ${disabled ? "opacity-50" : "hover:bg-red-100"}`;
  }
  return `${base} border-gray-300 bg-white text-gray-800 ${disabled ? "opacity-50" : "hover:bg-gray-50"}`;
}

function DocThumb({
  label,
  url,
  onView,
}: {
  label: string;
  url: string | null | undefined;
  onView: (title: string, url: string) => void;
}) {
  if (!url) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500">
        Missing
      </div>
    );
  }
  const lower = url.toLowerCase();
  const isImage =
    /\.(jpe?g|png|gif|webp)/i.test(lower) || lower.includes("format=");
  return (
    <button
      type="button"
      onClick={() => onView(label, url)}
      className="group relative h-24 w-full overflow-hidden rounded-lg border border-gray-200 bg-white hover:ring-2 hover:ring-[#192a3a]/20"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-gray-600">
          <FileText className="h-8 w-8" />
          <span className="text-xs">PDF / document</span>
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
        View
      </span>
    </button>
  );
}

export function AdminVerificationWorkspace({
  records,
  queueFilter,
  onQueueFilterChange,
  selectedOwnerId,
  onSelectOwner,
  searchQuery,
  onSearchChange,
  ownerComment,
  bankComment,
  onOwnerCommentChange,
  onBankCommentChange,
  onVerifyIdentity,
  onVerifyBank,
  onPreviewDocument,
  summaryCounts,
}: {
  records: AdminVerificationRecordWithPaths[];
  queueFilter: QueueFilter;
  onQueueFilterChange: (filter: QueueFilter) => void;
  selectedOwnerId: string | null;
  onSelectOwner: (ownerId: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  ownerComment: Record<string, string>;
  bankComment: Record<string, string>;
  onOwnerCommentChange: (ownerId: string, value: string) => void;
  onBankCommentChange: (ownerId: string, value: string) => void;
  onVerifyIdentity: (
    ownerId: string,
    status: "verified" | "pending" | "rejected"
  ) => void;
  onVerifyBank: (
    ownerId: string,
    status: "verified" | "pending" | "rejected"
  ) => void;
  onPreviewDocument: (title: string, url: string) => void;
  summaryCounts: {
    identityPending: number;
    bankPending: number;
    completed: number;
  };
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filtered = records.filter((record) => {
    const flags = recordFlags(record);
    const matchesQueue =
      queueFilter === "all" ||
      (queueFilter === "identity_pending" &&
        (flags.identityPending || flags.identityRejected)) ||
      (queueFilter === "bank_pending" &&
        (flags.bankPending || flags.bankRejected)) ||
      (queueFilter === "completed" && flags.fullyVerified);

    if (!matchesQueue) return false;
    if (!normalizedSearch) return true;

    const hostName = displayName(record).toLowerCase();
    const phone = (record.phone || "").toLowerCase();
    const listingTitles = record.listingTitles.join(" ").toLowerCase();
    return (
      hostName.includes(normalizedSearch) ||
      phone.includes(normalizedSearch) ||
      record.owner_id.toLowerCase().includes(normalizedSearch) ||
      listingTitles.includes(normalizedSearch)
    );
  });

  const selected =
    filtered.find((r) => r.owner_id === selectedOwnerId) || filtered[0] || null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["identity_pending", "Pending identity", summaryCounts.identityPending],
            ["bank_pending", "Pending bank", summaryCounts.bankPending],
            ["completed", "Fully verified", summaryCounts.completed],
            ["all", "All hosts", records.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => onQueueFilterChange(key)}
            className={`rounded-lg border px-4 py-3 text-left transition ${
              queueFilter === key
                ? "border-[#192a3a] bg-[#192a3a] text-white"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </button>
        ))}
      </div>

      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search host, phone, listing…"
        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#192a3a]"
      />

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          No verification records match this filter.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
          <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
            {filtered.map((record) => {
              const flags = recordFlags(record);
              const active = selected?.owner_id === record.owner_id;
              return (
                <button
                  key={record.owner_id}
                  type="button"
                  onClick={() => onSelectOwner(record.owner_id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-[#192a3a] bg-[#192a3a]/5"
                      : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  <p className="font-medium text-[#192a3a]">
                    {displayName(record)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
                    {flags.fullyVerified ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : flags.attentionRequired ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Clock3 className="h-3.5 w-3.5 text-blue-600" />
                    )}
                    {adminQueueSummaryLabel(flags)}
                  </p>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-[#192a3a]">
                    {displayName(selected)}
                  </h2>
                  <p className="text-sm text-gray-600">{selected.email}</p>
                  <p className="text-xs text-gray-500">{selected.phone}</p>
                  {selected.listingTitles.length > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Listings: {selected.listingTitles.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(selected.owner_verification_status)}`}
                  >
                    Identity: {selected.owner_verification_status || "pending"}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(selected.bank_verification_status)}`}
                  >
                    Bank: {selected.bank_verification_status || "pending"}
                  </span>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-[#192a3a]">Identity</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">ID front</p>
                    <DocThumb
                      label="ID front"
                      url={selected.idFrontUrl}
                      onView={onPreviewDocument}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-gray-500">ID back</p>
                    <DocThumb
                      label="ID back"
                      url={selected.idBackUrl}
                      onView={onPreviewDocument}
                    />
                  </div>
                </div>
                <textarea
                  value={ownerComment[selected.owner_id] || ""}
                  onChange={(e) =>
                    onOwnerCommentChange(selected.owner_id, e.target.value)
                  }
                  placeholder="Comment for host (optional)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={selected.owner_verification_status === "verified"}
                    className={actionButtonClass(
                      "verified",
                      selected.owner_verification_status === "verified"
                    )}
                    onClick={() => onVerifyIdentity(selected.owner_id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={selected.owner_verification_status === "rejected"}
                    className={actionButtonClass(
                      "rejected",
                      selected.owner_verification_status === "rejected"
                    )}
                    onClick={() => onVerifyIdentity(selected.owner_id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </section>

              <section className="space-y-3 border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-[#192a3a]">
                  Bank details
                </h3>
                <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                  <p>
                    <span className="text-gray-500">Holder:</span>{" "}
                    {selected.bankDetails?.account_holder_name || "—"}
                  </p>
                  <p>
                    <span className="text-gray-500">Bank:</span>{" "}
                    {selected.bankDetails?.bank_name || "—"}
                  </p>
                  <p>
                    <span className="text-gray-500">Account:</span>{" "}
                    {selected.bankDetails?.account_number || "—"}
                  </p>
                  <p>
                    <span className="text-gray-500">Branch:</span>{" "}
                    {selected.bankDetails?.branch_code || "—"}
                  </p>
                </div>
                <div className="max-w-xs">
                  <p className="mb-1 text-xs text-gray-500">Bank proof</p>
                  <DocThumb
                    label="Bank proof"
                    url={selected.bankProofUrl}
                    onView={onPreviewDocument}
                  />
                </div>
                <textarea
                  value={bankComment[selected.owner_id] || ""}
                  onChange={(e) =>
                    onBankCommentChange(selected.owner_id, e.target.value)
                  }
                  placeholder="Bank verification comment (optional)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={selected.bank_verification_status === "verified"}
                    className={actionButtonClass(
                      "verified",
                      selected.bank_verification_status === "verified"
                    )}
                    onClick={() => onVerifyBank(selected.owner_id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={selected.bank_verification_status === "rejected"}
                    className={actionButtonClass(
                      "rejected",
                      selected.bank_verification_status === "rejected"
                    )}
                    onClick={() => onVerifyBank(selected.owner_id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </section>

              <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                Per-listing ownership proof is reviewed in Listing reviews, not
                here.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
