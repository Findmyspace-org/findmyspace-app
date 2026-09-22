"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import OrganisationWorkspaceContext from "@/app/components/OrganisationWorkspaceContext";
import { useHostingWorkspace } from "@/lib/use-hosting-workspace";
import { fetchManageableOrganisations } from "@/lib/access/organisation-access-client";
import {
  ORGANISATION_QUERY_PARAM,
  organisationWorkspaceHref,
  resolveOrganisationWorkspaceSelection,
  type ManageableOrganisation,
} from "@/lib/access/organisation-workspace";
import {
  fetchOrganisationCommercial,
  patchOrganisationCommercial,
  submitOrganisationBankRequest,
  submitOrganisationVerificationRequest,
  uploadOrganisationDocumentRequest,
} from "@/lib/organisation-commercial-client";
import {
  BANK_ACCOUNT_TYPES,
  DOCUMENT_KINDS,
  ORGANISATION_TYPES,
  type OrganisationCommercialBundle,
} from "@/lib/organisation-commercial-dto";

function OrganisationCommercialPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hosting = useHostingWorkspace();
  const requestedId = searchParams.get(ORGANISATION_QUERY_PARAM);
  const [organisations, setOrganisations] = useState<ManageableOrganisation[]>([]);
  const [bundle, setBundle] = useState<OrganisationCommercialBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [organisationType, setOrganisationType] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [documentKind, setDocumentKind] = useState("registration");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("cheque");
  const [branchCode, setBranchCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const selection = resolveOrganisationWorkspaceSelection({
    organisations,
    requestedId,
  });
  const organisationId =
    selection.kind === "ready" || selection.kind === "archived"
      ? selection.organisation.id
      : null;

  const load = useCallback(async (id: string) => {
    const next = await fetchOrganisationCommercial(id);
    setBundle(next);
    setLegalName(next.commercial?.legal_name || next.organisation.name);
    setTradingName(next.commercial?.trading_name || "");
    setOrganisationType(next.commercial?.organisation_type || "");
    setRegistrationNumber(next.commercial?.registration_number || "");
  }, []);

  useEffect(() => {
    if (hosting.loading) return;
    if (!hosting.summary.showOrganisationCommercial) {
      window.location.replace(hosting.listingsHref);
    }
  }, [hosting.loading, hosting.listingsHref, hosting.summary.showOrganisationCommercial]);

  useEffect(() => {
    let mounted = true;
    fetchManageableOrganisations()
      .then((result) => {
        if (mounted) setOrganisations(result.organisations || []);
      })
      .catch((error) => {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : "Could not load organisations.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!organisationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load(organisationId)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not load organisation.");
      })
      .finally(() => setLoading(false));
  }, [load, organisationId]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!organisationId) return;
    setSaving(true);
    setMessage("");
    try {
      await patchOrganisationCommercial(organisationId, {
        legal_name: legalName,
        trading_name: tradingName,
        organisation_type: organisationType || null,
        registration_number: registrationNumber,
      });
      await load(organisationId);
      setMessage("Organisation details saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVerification() {
    if (!organisationId) return;
    setSaving(true);
    setMessage("");
    try {
      await submitOrganisationVerificationRequest(organisationId);
      await load(organisationId);
      setMessage("Verification submitted for review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit verification.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!organisationId || !documentFile) return;
    setSaving(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", documentFile);
      form.append("document_kind", documentKind);
      await uploadOrganisationDocumentRequest(organisationId, form);
      setDocumentFile(null);
      await load(organisationId);
      setMessage("Document uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload document.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitBank(event: FormEvent) {
    event.preventDefault();
    if (!organisationId || !proofFile) {
      setMessage("Proof of bank is required before banking can be submitted for verification.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("account_holder_name", accountHolder);
      form.append("bank_name", bankName);
      form.append("account_type", accountType);
      form.append("branch_code", branchCode);
      form.append("account_number", accountNumber);
      form.append("proof", proofFile);
      await submitOrganisationBankRequest(organisationId, form);
      setAccountNumber("");
      setProofFile(null);
      await load(organisationId);
      setMessage("Bank details submitted for verification.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit bank details.");
    } finally {
      setSaving(false);
    }
  }

  const contextOrganisation =
    selection.kind === "ready" || selection.kind === "archived"
      ? selection.organisation
      : null;

  return (
    <DashboardShell
      workspaceLabel="Hosting"
      pageTitle="Organisation"
      pageContext={
        contextOrganisation ? (
          <OrganisationWorkspaceContext
            name={contextOrganisation.name}
            selectedId={contextOrganisation.id}
            organisations={organisations}
            archived={selection.kind === "archived"}
            onSelect={(id) =>
              router.push(organisationWorkspaceHref("/dashboard/organisation", id))
            }
          />
        ) : null
      }
      pageSubtitle="Organisation verification, supporting evidence, and bank details for payout readiness."
      navItems={hosting.navItems}
      activeHref="/dashboard/organisation"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {message ? (
          <p className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#334155]">
            {message}
          </p>
        ) : null}
        {loading || hosting.loading ? (
          <p className="text-sm text-[#64748b]">Loading organisation...</p>
        ) : !bundle ? (
          <p className="text-sm text-[#64748b]">Select an organisation to manage commercial details.</p>
        ) : (
          <>
            <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
              <h2 className="text-lg font-semibold">Verification status</h2>
              <p className="mt-2 text-sm text-[#475569]">
                Organisation: {bundle.commercial?.verification_status || "pending"}
              </p>
              {bundle.commercial?.rejection_reason ? (
                <p className="mt-2 text-sm text-red-700">{bundle.commercial.rejection_reason}</p>
              ) : null}
              <p className="mt-2 text-sm text-[#475569]">
                {bundle.payout_readiness.label}. {bundle.payout_readiness.explanation}
              </p>
            </section>

            <form onSubmit={handleSave} className="rounded-2xl border border-[#e5e7eb] bg-white p-5 space-y-3">
              <h2 className="text-lg font-semibold">Organisation details</h2>
              <input
                required
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                placeholder="Legal name"
              />
              <input
                value={tradingName}
                onChange={(event) => setTradingName(event.target.value)}
                className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                placeholder="Trading name"
              />
              <select
                value={organisationType}
                onChange={(event) => setOrganisationType(event.target.value)}
                className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
              >
                <option value="">Type</option>
                {ORGANISATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace("_", " ")}
                  </option>
                ))}
              </select>
              <input
                value={registrationNumber}
                onChange={(event) => setRegistrationNumber(event.target.value)}
                className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                placeholder="Registration number"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save details
              </button>
              {bundle.commercial?.verification_status !== "verified" ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSubmitVerification()}
                  className="ml-2 rounded-xl bg-[#c1121f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Submit for verification
                </button>
              ) : null}
            </form>

            <form onSubmit={handleUploadDocument} className="rounded-2xl border border-[#e5e7eb] bg-white p-5 space-y-3">
              <h2 className="text-lg font-semibold">Supporting documents</h2>
              <ul className="text-sm text-[#475569]">
                {bundle.documents.map((doc) => (
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
                {bundle.documents.length === 0 ? <li>No documents uploaded yet.</li> : null}
              </ul>
              <select
                value={documentKind}
                onChange={(event) => setDocumentKind(event.target.value)}
                className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
              >
                {DOCUMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.replace("_", " ")}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
              />
              <button
                type="submit"
                disabled={saving || !documentFile}
                className="rounded-xl border border-[#d4dbe2] px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Upload document
              </button>
            </form>

            <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 space-y-3">
              <h2 className="text-lg font-semibold">Banking</h2>
              {bundle.bank ? (
                <p className="text-sm text-[#475569]">
                  {bundle.bank.bank_name} · {bundle.bank.account_holder_name} ·{" "}
                  {bundle.bank.account_number_display} · {bundle.bank.status}
                  {bundle.bank.proof_of_bank_submitted ? " · proof submitted" : ""}
                </p>
              ) : (
                <p className="text-sm text-[#475569]">No bank details submitted.</p>
              )}
              {bundle.bank?.rejection_reason ? (
                <p className="text-sm text-red-700">{bundle.bank.rejection_reason}</p>
              ) : null}
              <form onSubmit={handleSubmitBank} className="space-y-3">
                <input
                  required
                  value={accountHolder}
                  onChange={(event) => setAccountHolder(event.target.value)}
                  className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                  placeholder="Account holder name"
                />
                <input
                  required
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                  placeholder="Bank name"
                />
                <select
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value)}
                  className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                >
                  {BANK_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={branchCode}
                  onChange={(event) => setBranchCode(event.target.value)}
                  className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                  placeholder="Branch code"
                />
                <input
                  required
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  className="w-full rounded-lg border border-[#d4dbe2] px-3 py-2 text-sm"
                  placeholder="Account number"
                  autoComplete="off"
                />
                <input
                  required
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Submit bank details
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default function OrganisationCommercialPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="p-6 text-sm text-[#64748b]">Loading...</div>}>
        <OrganisationCommercialPageContent />
      </Suspense>
    </RequireAuth>
  );
}
