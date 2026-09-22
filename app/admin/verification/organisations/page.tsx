"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";
import type {
  AdminOrganisationBankDto,
  OrganisationCommercialBundle,
} from "@/lib/organisation-commercial-dto";
import {
  compactPayoutReadinessLabel,
  countOrganisationAwaitingReview,
  formatVerificationTimestamp,
  organisationAwaitingAdminReview,
  organisationTypeLabel,
  organisationVerificationMethodLabel,
  shouldShowPrimaryVerifyActions,
  type OrganisationReviewQueueItem,
} from "@/lib/organisation-verification-console";
import { OrganisationProofPreviewModal } from "@/app/components/admin/OrganisationProofPreviewModal";
import { OrganisationPayoutAdminPanel } from "@/app/components/admin/OrganisationPayoutAdminPanel";

type DetailBundle = OrganisationCommercialBundle & {
  admin_bank: AdminOrganisationBankDto | null;
};

type BusyAction = "verify-org" | "reject-org" | "verify-bank" | "reject-bank" | null;

function statusBadgeClass(status: string | null | undefined) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-blue-100 text-blue-800";
}

function AdminOrganisationVerificationContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("organisation");
  const { loading: roleLoading, isAdmin } = useAdminRole();
  const [items, setItems] = useState<OrganisationReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<DetailBundle | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [notes, setNotes] = useState("");
  const [bankNotes, setBankNotes] = useState("");
  const [method, setMethod] = useState<"document_review" | "admin_assisted">(
    "admin_assisted"
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [changingOrg, setChangingOrg] = useState(false);
  const [changingBank, setChangingBank] = useState(false);
  const [orgDetailsOpen, setOrgDetailsOpen] = useState(false);
  const [orgIdentityOpen, setOrgIdentityOpen] = useState(false);
  const [bankDetailsOpen, setBankDetailsOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const orgInFlight = useRef(false);
  const bankInFlight = useRef(false);

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
    setChangingOrg(false);
    setChangingBank(false);
    setOrgDetailsOpen(false);
    setBankDetailsOpen(false);
    setNotes("");
    setBankNotes("");
    void loadDetail(selectedId);
  }, [isAdmin, selectedId]);

  async function loadQueue(options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true);
    try {
      const result = (await adminApiFetch("/api/admin/organisations/commercial-queue")) as {
        items: OrganisationReviewQueueItem[];
      };
      const nextItems = result.items || [];
      setItems(nextItems);
      if (!selectedId && nextItems[0]) {
        setSelectedId(nextItems[0].organisation_id);
      }
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Could not load queue.");
    }
    if (!options?.silent) setLoading(false);
  }

  async function loadDetail(organisationId: string) {
    try {
      const result = (await adminApiFetch(
        `/api/admin/organisations/${organisationId}/commercial`
      )) as DetailBundle;
      setDetail(result);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Could not load organisation.");
    }
  }

  async function decideVerification(decision: "verify" | "reject") {
    if (!selectedId || orgInFlight.current) return;
    orgInFlight.current = true;
    setBusy(decision === "verify" ? "verify-org" : "reject-org");
    setMessage("");
    try {
      const result = (await adminApiFetch(
        `/api/admin/organisations/${selectedId}/verification`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            method: decision === "verify" ? method : null,
            notes,
            reason: notes,
          }),
        }
      )) as { commercial: DetailBundle["commercial"] };
      setDetail((current) =>
        current ? { ...current, commercial: result.commercial } : current
      );
      setChangingOrg(false);
      setNotes("");
      setMessageTone("success");
      setMessage(
        decision === "verify"
          ? "Organisation verified."
          : "Organisation verification rejected."
      );
      await Promise.all([loadQueue({ silent: true }), loadDetail(selectedId)]);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Decision failed.");
    } finally {
      orgInFlight.current = false;
      setBusy(null);
    }
  }

  async function decideBank(decision: "verify" | "reject") {
    if (!selectedId || bankInFlight.current) return;
    bankInFlight.current = true;
    setBusy(decision === "verify" ? "verify-bank" : "reject-bank");
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/organisations/${selectedId}/bank/verification`, {
        method: "POST",
        body: JSON.stringify({ decision, notes: bankNotes, reason: bankNotes }),
      });
      setChangingBank(false);
      setBankNotes("");
      setMessageTone("success");
      setMessage(decision === "verify" ? "Bank account verified." : "Bank verification rejected.");
      await Promise.all([loadQueue({ silent: true }), loadDetail(selectedId)]);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Bank decision failed.");
    } finally {
      bankInFlight.current = false;
      setBusy(null);
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.organisation_name.toLowerCase().includes(q));
  }, [items, search]);

  const awaitingCount = countOrganisationAwaitingReview(items);
  const payout = detail?.payout_readiness;
  const orgStatus = detail?.commercial?.verification_status || "pending";
  const bankStatus = detail?.admin_bank?.status || detail?.bank?.status || null;
  const showOrgActions = shouldShowPrimaryVerifyActions(orgStatus, changingOrg);
  const showBankActions = shouldShowPrimaryVerifyActions(bankStatus, changingBank);

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
            Verification
          </Link>
          {" · "}
          <span className="font-semibold">Organisations</span>
        </p>
        <h1 className="text-3xl font-bold">Organisation verification</h1>
        <p className="mt-2 text-sm text-gray-600">
          Review organisation authority separately from payout bank details. Payout ready means
          commercial checks are complete, not that a payout has been made.
        </p>
        {awaitingCount > 0 ? (
          <p className="mt-2 text-sm font-medium text-amber-800">
            {awaitingCount} awaiting review
          </p>
        ) : null}
        {message ? (
          <p
            className={`mt-4 rounded-lg p-3 text-sm ${
              messageTone === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
            }`}
            role="status"
          >
            {message}
          </p>
        ) : null}
        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-gray-200 p-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organisations…"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a]"
            />
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              {filteredItems.map((item) => {
                const selected = selectedId === item.organisation_id;
                const needsReview = organisationAwaitingAdminReview(item);
                return (
                  <button
                    key={item.organisation_id}
                    type="button"
                    onClick={() => setSelectedId(item.organisation_id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? "border-[#192a3a] bg-[#192a3a]/5"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-medium">{item.organisation_name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      {item.verification_status === "verified" &&
                      item.bank_status === "verified" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : needsReview ? (
                        <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      {item.verification_status} · bank {item.bank_status}
                    </span>
                  </button>
                );
              })}
              {filteredItems.length === 0 ? (
                <p className="text-sm text-gray-500">No organisations.</p>
              ) : null}
            </div>
          </aside>
          <section className="space-y-4">
            {!detail ? (
              <p className="text-sm text-gray-500">Select an organisation.</p>
            ) : (
              <>
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{detail.organisation.name}</h2>
                      <p className="text-sm text-gray-600">
                        Organisation status: {detail.organisation.status}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        payout?.ready
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {compactPayoutReadinessLabel(payout?.code)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <SummaryLine
                      ok={orgStatus === "verified"}
                      label={
                        orgStatus === "verified"
                          ? "Organisation verified"
                          : compactPayoutReadinessLabel(
                              orgStatus === "rejected"
                                ? "organisation_unverified"
                                : "organisation_unverified"
                            )
                      }
                    />
                    <SummaryLine
                      ok={bankStatus === "verified"}
                      label={
                        bankStatus === "verified"
                          ? "Bank account verified"
                          : compactPayoutReadinessLabel(
                              !bankStatus
                                ? "bank_not_submitted"
                                : bankStatus === "rejected"
                                  ? "bank_rejected"
                                  : "bank_pending"
                            )
                      }
                    />
                    <SummaryLine
                      ok={Boolean(payout?.ready)}
                      label={compactPayoutReadinessLabel(payout?.code)}
                    />
                  </div>
                  {payout && !payout.ready ? (
                    <p className="mt-2 text-xs text-gray-500">{payout.explanation}</p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      Commercial verification requirements are satisfied. FindMySpace does not
                      transfer funds automatically yet.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Organisation identity</h3>
                    <button
                      type="button"
                      className="text-sm font-medium text-[#192a3a] underline-offset-4 hover:underline"
                      onClick={() => setOrgIdentityOpen((open) => !open)}
                    >
                      {orgIdentityOpen ? "Hide details" : "View details"}
                    </button>
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm text-gray-700">
                    <div>Legal name: {detail.commercial?.legal_name || "Not set"}</div>
                    <div>Trading name: {detail.commercial?.trading_name || "Not set"}</div>
                    <div>
                      Type: {organisationTypeLabel(detail.commercial?.organisation_type)}
                    </div>
                    <div>
                      Registration: {detail.commercial?.registration_number || "Not set"}
                    </div>
                  </dl>
                  {orgIdentityOpen ? (
                    <dl className="mt-3 grid gap-1 border-t border-gray-100 pt-3 text-sm text-gray-600">
                      <div>VAT: {detail.commercial?.vat_number || "Not set"}</div>
                      <div>
                        Address:{" "}
                        {[
                          detail.commercial?.address_line1,
                          detail.commercial?.suburb,
                          detail.commercial?.city,
                          detail.commercial?.province,
                          detail.commercial?.postal_code,
                          detail.commercial?.country,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Not set"}
                      </div>
                      <div>
                        Contact: {detail.commercial?.primary_contact_name || "Not set"}
                        {detail.commercial?.primary_contact_email
                          ? ` · ${detail.commercial.primary_contact_email}`
                          : ""}
                      </div>
                      <div>
                        Representative:{" "}
                        {detail.commercial?.authorised_representative_name || "Not set"}
                        {detail.commercial?.authorised_representative_title
                          ? ` · ${detail.commercial.authorised_representative_title}`
                          : ""}
                      </div>
                    </dl>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        {orgStatus === "verified" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : null}
                        Organisation verification
                      </h3>
                      <p className="text-sm text-gray-600">
                        <span
                          className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(orgStatus)}`}
                        >
                          {orgStatus}
                        </span>
                        Separate from bank verification.
                      </p>
                    </div>
                  </div>
                  {orgStatus === "verified" && !changingOrg ? (
                    <div className="text-sm text-gray-700">
                      {organisationVerificationMethodLabel(
                        detail.commercial?.verification_method
                      ) ? (
                        <p>
                          {organisationVerificationMethodLabel(
                            detail.commercial?.verification_method
                          )}
                        </p>
                      ) : null}
                      {detail.commercial?.verified_by_label ? (
                        <p>Verified by: {detail.commercial.verified_by_label}</p>
                      ) : null}
                      {formatVerificationTimestamp(detail.commercial?.verified_at) ? (
                        <p>
                          Verified: {formatVerificationTimestamp(detail.commercial?.verified_at)}
                        </p>
                      ) : null}
                      {detail.commercial?.verification_notes ? (
                        <p>Reason: {detail.commercial.verification_notes}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                          onClick={() => setOrgDetailsOpen((open) => !open)}
                        >
                          {orgDetailsOpen ? "Hide details" : "View details"}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                          onClick={() => {
                            setChangingOrg(true);
                            setNotes(detail.commercial?.verification_notes || "");
                            if (
                              detail.commercial?.verification_method === "document_review" ||
                              detail.commercial?.verification_method === "admin_assisted"
                            ) {
                              setMethod(detail.commercial.verification_method);
                            }
                          }}
                        >
                          Change decision
                        </button>
                      </div>
                      {orgDetailsOpen ? (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-gray-600">
                          <p>
                            Submitted:{" "}
                            {formatVerificationTimestamp(detail.commercial?.submitted_at) ||
                              "Not recorded"}
                          </p>
                          {detail.documents.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {detail.documents.map((doc) => (
                                <li key={doc.id}>{doc.document_kind}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2">No supporting documents on file.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {orgStatus === "rejected" ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          Rejected
                          {detail.commercial?.rejected_by_label
                            ? ` by ${detail.commercial.rejected_by_label}`
                            : ""}
                          {formatVerificationTimestamp(detail.commercial?.rejected_at)
                            ? ` · ${formatVerificationTimestamp(detail.commercial?.rejected_at)}`
                            : ""}
                          {detail.commercial?.rejection_reason
                            ? `. Reason: ${detail.commercial.rejection_reason}`
                            : ""}
                        </p>
                      ) : null}
                      {showOrgActions ? (
                        <>
                          <select
                            value={method}
                            onChange={(event) =>
                              setMethod(
                                event.target.value as "document_review" | "admin_assisted"
                              )
                            }
                            className="rounded-lg border px-3 py-2 text-sm"
                            disabled={busy !== null}
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
                            disabled={busy !== null}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void decideVerification("verify")}
                              disabled={busy !== null}
                              className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 disabled:opacity-60"
                            >
                              {busy === "verify-org" ? "Verifying…" : "Verify organisation"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void decideVerification("reject")}
                              disabled={busy !== null}
                              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                            >
                              {busy === "reject-org" ? "Rejecting…" : "Reject organisation"}
                            </button>
                            {changingOrg ? (
                              <button
                                type="button"
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                                onClick={() => setChangingOrg(false)}
                                disabled={busy !== null}
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold">
                    {bankStatus === "verified" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : null}
                    Bank account
                  </h3>
                  {!detail.admin_bank ? (
                    <p className="text-sm text-gray-500">Bank details required.</p>
                  ) : bankStatus === "verified" && !changingBank ? (
                    <div className="text-sm text-gray-700">
                      <p>
                        <span
                          className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(bankStatus)}`}
                        >
                          Verified
                        </span>
                        {detail.admin_bank.bank_name}
                      </p>
                      <p>{detail.admin_bank.account_holder_name}</p>
                      <p>{detail.admin_bank.account_number_display}</p>
                      {detail.admin_bank.reviewed_by_label ? (
                        <p>Verified by: {detail.admin_bank.reviewed_by_label}</p>
                      ) : null}
                      {formatVerificationTimestamp(detail.admin_bank.reviewed_at) ? (
                        <p>
                          Verified: {formatVerificationTimestamp(detail.admin_bank.reviewed_at)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {detail.admin_bank.proof_signed_url ? (
                          <button
                            type="button"
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                            onClick={() => setProofOpen(true)}
                          >
                            View proof
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                          onClick={() => setBankDetailsOpen((open) => !open)}
                        >
                          {bankDetailsOpen ? "Hide details" : "View details"}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                          onClick={() => {
                            setChangingBank(true);
                            setBankNotes(detail.admin_bank?.review_notes || "");
                          }}
                        >
                          Change decision
                        </button>
                      </div>
                      {bankDetailsOpen ? (
                        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-gray-600">
                          <p>Type: {detail.admin_bank.account_type}</p>
                          <p>Branch: {detail.admin_bank.branch_code}</p>
                          <p>Account number: {detail.admin_bank.account_number}</p>
                          <p>
                            Submitted:{" "}
                            {formatVerificationTimestamp(detail.admin_bank.submitted_at) ||
                              "Not recorded"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {bankStatus === "rejected" ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          Rejected
                          {detail.admin_bank.reviewed_by_label
                            ? ` by ${detail.admin_bank.reviewed_by_label}`
                            : ""}
                          {detail.admin_bank.rejection_reason
                            ? `. Reason: ${detail.admin_bank.rejection_reason}`
                            : ""}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600">
                          Status: {bankStatus || "pending"}
                        </p>
                      )}
                      <p className="text-sm">
                        {detail.admin_bank.bank_name} · {detail.admin_bank.account_holder_name}
                      </p>
                      <p className="text-sm">
                        Account number: {detail.admin_bank.account_number}
                      </p>
                      <p className="text-sm">
                        Branch {detail.admin_bank.branch_code} · {detail.admin_bank.account_type}
                      </p>
                      {detail.admin_bank.proof_signed_url ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-[#192a3a] underline"
                          onClick={() => setProofOpen(true)}
                        >
                          View proof
                        </button>
                      ) : (
                        <p className="text-sm text-red-700">No proof of bank on file.</p>
                      )}
                      {showBankActions ? (
                        <>
                          <textarea
                            value={bankNotes}
                            onChange={(event) => setBankNotes(event.target.value)}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            placeholder="Notes / rejection reason"
                            rows={3}
                            disabled={busy !== null}
                          />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void decideBank("verify")}
                            disabled={busy !== null}
                            className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 disabled:opacity-60"
                          >
                            {busy === "verify-bank" ? "Verifying…" : "Verify bank"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void decideBank("reject")}
                            disabled={busy !== null}
                            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                          >
                            {busy === "reject-bank" ? "Rejecting…" : "Reject bank"}
                          </button>
                          {changingBank ? (
                            <button
                              type="button"
                              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                              onClick={() => setChangingBank(false)}
                              disabled={busy !== null}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
                <OrganisationPayoutAdminPanel organisationId={detail.organisation.id} />
              </>
            )}
          </section>
        </div>
      </div>
      <OrganisationProofPreviewModal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        title="Proof of bank"
        previewUrl={detail?.admin_bank?.proof_signed_url || null}
        fileName={detail?.admin_bank?.proof_of_bank_path || null}
      />
    </main>
  );
}

function SummaryLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Clock3 className="h-4 w-4 shrink-0 text-amber-600" />
      )}
      <span className={ok ? "font-medium text-emerald-800" : "text-[#192a3a]"}>{label}</span>
    </p>
  );
}

export default function AdminOrganisationVerificationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-600">Loading…</div>}>
      <AdminOrganisationVerificationContent />
    </Suspense>
  );
}
