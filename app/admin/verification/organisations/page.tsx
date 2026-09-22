"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";
import type {
  AdminOrganisationBankDto,
  OrganisationCommercialBundle,
} from "@/lib/organisation-commercial-dto";

type QueueItem = {
  organisation_id: string;
  organisation_name: string;
  organisation_status: string | null;
  verification_status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  bank_status: string;
  bank_submitted_at: string | null;
  bank_last4: string | null;
};

function AdminOrganisationVerificationContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("organisation");
  const { loading: roleLoading, isAdmin } = useAdminRole();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [detail, setDetail] = useState<
    (OrganisationCommercialBundle & { admin_bank: AdminOrganisationBankDto | null }) | null
  >(null);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<"document_review" | "admin_assisted">(
    "admin_assisted"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadQueue();
  }, [roleLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedId) return;
    void loadDetail(selectedId);
  }, [isAdmin, selectedId]);

  async function loadQueue() {
    setLoading(true);
    try {
      const result = (await adminApiFetch("/api/admin/organisations/commercial-queue")) as {
        items: QueueItem[];
      };
      setItems(result.items || []);
      if (!selectedId && result.items?.[0]) {
        setSelectedId(result.items[0].organisation_id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load queue.");
    }
    setLoading(false);
  }

  async function loadDetail(organisationId: string) {
    try {
      const result = (await adminApiFetch(
        `/api/admin/organisations/${organisationId}/commercial`
      )) as OrganisationCommercialBundle & { admin_bank: AdminOrganisationBankDto | null };
      setDetail(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load organisation.");
    }
  }

  async function decideVerification(decision: "verify" | "reject") {
    if (!selectedId) return;
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/organisations/${selectedId}/verification`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          method: decision === "verify" ? method : null,
          notes,
          reason: notes,
        }),
      });
      setMessage(decision === "verify" ? "Organisation verified." : "Organisation rejected.");
      await Promise.all([loadQueue(), loadDetail(selectedId)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed.");
    }
  }

  async function decideBank(decision: "verify" | "reject") {
    if (!selectedId) return;
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/organisations/${selectedId}/bank/verification`, {
        method: "POST",
        body: JSON.stringify({ decision, notes, reason: notes }),
      });
      setMessage(decision === "verify" ? "Bank verified." : "Bank rejected.");
      await Promise.all([loadQueue(), loadDetail(selectedId)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bank decision failed.");
    }
  }

  if (roleLoading || loading) {
    return <main className="p-8 text-sm text-gray-600">Loading organisation verification...</main>;
  }

  if (!isAdmin) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Access denied</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-[#192a3a]">
      <div className="mx-auto max-w-7xl">
        <p className="mb-3 text-sm">
          <Link className="underline" href="/admin/verification">
            Personal hosts
          </Link>
          {" · "}
          <span className="font-semibold">Organisations</span>
        </p>
        <h1 className="text-3xl font-bold">Organisation verification</h1>
        <p className="mt-2 text-sm text-gray-600">
          Entity verification may be document review or admin-assisted. Bank verification always
          requires proof of bank. Do not verify without evidence.
        </p>
        {message ? <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm">{message}</p> : null}
        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-gray-200 p-3">
            {items.map((item) => (
              <button
                key={item.organisation_id}
                type="button"
                onClick={() => setSelectedId(item.organisation_id)}
                className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedId === item.organisation_id ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">{item.organisation_name}</span>
                <span className="block text-xs text-gray-500">
                  {item.verification_status} · bank {item.bank_status}
                </span>
              </button>
            ))}
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">No organisations.</p>
            ) : null}
          </aside>
          <section className="space-y-4">
            {!detail ? (
              <p className="text-sm text-gray-500">Select an organisation.</p>
            ) : (
              <>
                <div className="rounded-xl border border-gray-200 p-4">
                  <h2 className="text-lg font-semibold">{detail.organisation.name}</h2>
                  <p className="text-sm text-gray-600">
                    Status {detail.organisation.status} · verification{" "}
                    {detail.commercial?.verification_status}
                  </p>
                  <p className="mt-2 text-sm">
                    Legal name: {detail.commercial?.legal_name}
                  </p>
                  <p className="text-sm">
                    Type: {detail.commercial?.organisation_type || "not set"}
                  </p>
                  <p className="text-sm">
                    Registration: {detail.commercial?.registration_number || "not set"}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold">Documents</h3>
                  <ul className="mt-2 text-sm">
                    {detail.documents.map((doc) => (
                      <li key={doc.id}>
                        {doc.document_kind}
                        {doc.signed_url ? (
                          <>
                            {" "}
                            <a className="underline" href={doc.signed_url} target="_blank" rel="noreferrer">
                              View
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                    {detail.documents.length === 0 ? <li>No documents.</li> : null}
                  </ul>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <h3 className="font-semibold">Organisation decision</h3>
                  <select
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value as "document_review" | "admin_assisted")
                    }
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="admin_assisted">Admin-assisted</option>
                    <option value="document_review">Document review</option>
                  </select>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Notes / reason"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void decideVerification("verify")}
                      className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
                    >
                      Verify organisation
                    </button>
                    <button
                      type="button"
                      onClick={() => void decideVerification("reject")}
                      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                    >
                      Reject organisation
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <h3 className="font-semibold">Bank review</h3>
                  {detail.admin_bank ? (
                    <>
                      <p className="text-sm">
                        {detail.admin_bank.bank_name} · {detail.admin_bank.account_holder_name}
                      </p>
                      <p className="text-sm">
                        Account number: {detail.admin_bank.account_number}
                      </p>
                      <p className="text-sm">
                        Branch {detail.admin_bank.branch_code} · {detail.admin_bank.account_type} ·{" "}
                        {detail.admin_bank.status}
                      </p>
                      {detail.admin_bank.proof_signed_url ? (
                        <a
                          className="text-sm underline"
                          href={detail.admin_bank.proof_signed_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View proof of bank
                        </a>
                      ) : (
                        <p className="text-sm text-red-700">No proof of bank on file.</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void decideBank("verify")}
                          className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700"
                        >
                          Verify bank
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideBank("reject")}
                          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
                        >
                          Reject bank
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No bank details submitted.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function AdminOrganisationVerificationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-600">Loading…</div>}>
      <AdminOrganisationVerificationContent />
    </Suspense>
  );
}
