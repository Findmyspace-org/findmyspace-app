"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import {
  ClaimOnboardingShell,
  type ClaimStepProgress,
  type ClaimWizardStep,
} from "@/app/components/ClaimOnboardingShell";
import { ClaimStepStatusCard } from "@/app/components/ClaimStepStatusCard";
import { ClaimSubmittedConfirmation } from "@/app/components/ClaimSubmittedConfirmation";
import { ClaimIdentityUpload } from "@/app/components/ClaimIdentityUpload";
import { OwnershipProofUpload } from "@/app/components/OwnershipProofUpload";
import type { ListingCompletionResult } from "@/lib/listing-completion";
import type { ChecklistItemState } from "@/lib/listing-completion";
import {
  buildClaimReadiness,
  claimSubmitBlockers,
  contactClaimDisplay,
  identityClaimDisplay,
  isClaimReadyToSubmit,
  ownershipClaimDisplay,
  claimStepProgress,
  type ClaimReadiness,
} from "@/lib/claim-readiness";
import {
  isOwnerClaimOnboardingStatus,
  OWNER_CLAIMED_STATUS,
  PENDING_VERIFICATION_STATUS,
} from "@/lib/listing-lifecycle";
import { ownerApiFetch } from "@/lib/owner-api-client";
import { supabase } from "@/lib/supabase";

const VALID_STEPS: ClaimWizardStep[] = [
  "details",
  "ownership",
  "identity",
  "submit",
];

function ClaimPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const spaceId = typeof params.id === "string" ? params.id : "";

  const stepParam = searchParams.get("step");
  const currentStep: ClaimWizardStep =
    stepParam === "bank"
      ? "submit"
      : VALID_STEPS.includes(stepParam as ClaimWizardStep)
        ? (stepParam as ClaimWizardStep)
        : "details";

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSucceeded, setSubmitSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [completion, setCompletion] = useState<ListingCompletionResult | null>(
    null
  );
  const [ownerId, setOwnerId] = useState("");
  const [ownershipProof, setOwnershipProof] = useState<{
    id: string;
    file_url: string;
    file_path: string | null;
    status: string | null;
  } | null>(null);
  const [ownershipProofStatus, setOwnershipProofStatus] = useState<string | null>(
    null
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [idDocsReady, setIdDocsReady] = useState({
    hasIdFront: false,
    hasIdBack: false,
  });

  const returnToClaim = `/dashboard/listings/${spaceId}/claim`;

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setMessage("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("Please sign in.");
        setLoading(false);
        return;
      }
      setOwnerId(user.id);
      setEmail(user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      const p = profile as {
        first_name?: string | null;
        last_name?: string | null;
        phone?: string | null;
      } | null;
      setFirstName(p?.first_name || "");
      setLastName(p?.last_name || "");
      setPhone(p?.phone || "");

      const data = await ownerApiFetch(
        `/api/owner/listings/${spaceId}/completion-status`
      );
      const comp = data as ListingCompletionResult;
      setCompletion(comp);

      if (comp.status === "needs_changes") {
        router.replace(`/spaces/${spaceId}/edit`);
        return;
      }
      if (
        !isOwnerClaimOnboardingStatus(comp.status) &&
        comp.status !== "rejected"
      ) {
        if (comp.status === "active" || comp.status === "paused") {
          router.replace("/dashboard/listings");
          return;
        }
      }

      const { data: ownershipData } = await supabase
        .from("listing_ownership_documents")
        .select("id, file_url, file_path, status")
        .eq("space_id", spaceId)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setOwnershipProof(
        (ownershipData as typeof ownershipProof) || null
      );
      setOwnershipProofStatus(comp.ownership_proof_status);

      const { data: idDocRows } = await supabase
        .from("owner_verification_documents")
        .select("document_type")
        .eq("owner_id", user.id);
      const types =
        ((idDocRows as { document_type: string }[]) || []).map(
          (d) => d.document_type
        );
      setIdDocsReady({
        hasIdFront: types.includes("id_front"),
        hasIdBack: types.includes("id_back"),
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load claim.");
      setCompletion(null);
    }
    setLoading(false);
  }, [spaceId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const contactComplete = useMemo(
    () => Boolean(firstName.trim() && phone.trim()),
    [firstName, phone]
  );

  const identityItem = completion?.items.find((i) => i.id === "identity");
  const ownershipItem = completion?.items.find((i) => i.id === "ownership");

  const underReview = completion?.status === PENDING_VERIFICATION_STATUS;
  const showSubmittedConfirmation = underReview || submitSucceeded;
  const canEditSteps =
    completion?.status === OWNER_CLAIMED_STATUS || completion?.status === "rejected";

  const claimReadiness = useMemo((): ClaimReadiness => {
    return buildClaimReadiness({
      contactComplete,
      hasOwnershipProof: Boolean(ownershipProof),
      hasIdFront: idDocsReady.hasIdFront,
      hasIdBack: idDocsReady.hasIdBack,
      ownershipVerified:
        ownershipProofStatus === "verified" || ownershipItem?.state === "done",
      identityVerified:
        completion?.owner.owner_verification_status === "verified" ||
        identityItem?.state === "done",
      ownershipRejected:
        ownershipProofStatus === "rejected" || ownershipItem?.state === "rejected",
      identityRejected:
        completion?.owner.owner_verification_status === "rejected" ||
        identityItem?.state === "rejected",
    });
  }, [
    contactComplete,
    ownershipProof,
    idDocsReady,
    identityItem?.state,
    ownershipItem?.state,
    ownershipProofStatus,
    completion?.owner.owner_verification_status,
  ]);

  const readyToSubmit = isClaimReadyToSubmit(claimReadiness);
  const submitBlockers = claimSubmitBlockers(claimReadiness);

  useEffect(() => {
    if (readyToSubmit && message.includes("Complete all required steps")) {
      setMessage("");
    }
  }, [readyToSubmit, message]);
  const contactDisplay = contactClaimDisplay(claimReadiness.contactComplete);
  const ownershipDisplay = ownershipClaimDisplay(claimReadiness);
  const identityDisplay = identityClaimDisplay(claimReadiness);
  const stepStates = claimStepProgress(claimReadiness);

  const stepProgress = useMemo((): Partial<Record<ClaimWizardStep, ClaimStepProgress>> => {
    return {
      details: stepStates.details,
      ownership: stepStates.ownership,
      identity: stepStates.identity,
      submit: underReview
        ? "pending_review"
        : readyToSubmit
          ? "complete"
          : "incomplete",
    };
  }, [stepStates, underReview, readyToSubmit]);

  const refreshCompletion = useCallback(async () => {
    if (!spaceId) return;
    try {
      const data = await ownerApiFetch(
        `/api/owner/listings/${spaceId}/completion-status`
      );
      setCompletion(data as ListingCompletionResult);
    } catch {
      /* keep existing completion */
    }
  }, [spaceId]);

  function handleOwnershipUploaded(doc: {
    id: string;
    file_url: string;
    file_path: string | null;
    status: string | null;
  }) {
    setOwnershipProof(doc);
    setOwnershipProofStatus("pending");
    setCompletion((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ownership_proof_status: "pending",
        items: prev.items.map((item) =>
          item.id === "ownership"
            ? { ...item, state: "pending_review" as ChecklistItemState }
            : item
        ),
      };
    });
    void refreshCompletion();
  }

  async function saveContactDetails() {
    if (!ownerId) return;
    setSavingProfile(true);
    setMessage("");
    const { error } = await (supabase.from("profiles") as ReturnType<
      typeof supabase.from
    >)
      .update({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", ownerId);
    setSavingProfile(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Contact details saved.");
  }

  async function handleSubmit() {
    if (!spaceId || !readyToSubmit) return;
    setSubmitting(true);
    setMessage("");
    try {
      if (ownerId) {
        const { error: profileError } = await (supabase.from("profiles") as ReturnType<
          typeof supabase.from
        >)
          .update({
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            phone: phone.trim() || null,
          })
          .eq("id", ownerId);
        if (profileError) {
          throw new Error(profileError.message);
        }
      }

      const result = await ownerApiFetch(
        `/api/owner/listings/${spaceId}/submit-review`,
        { method: "POST" }
      );
      const updated = (result.completion as ListingCompletionResult) || null;
      if (updated) {
        setCompletion(updated);
      }
      setSubmitSucceeded(true);
      router.replace(returnToClaim);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submit failed.");
    }
    setSubmitting(false);
  }

  function goToStep(step: ClaimWizardStep) {
    router.push(`/dashboard/listings/${spaceId}/claim?step=${step}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-6">
        <p className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading your claim…
        </p>
      </main>
    );
  }

  if (!completion) {
    return (
      <main className="min-h-screen bg-[#f8fafb] p-6">
        <p className="text-red-600">{message || "Listing not found."}</p>
      </main>
    );
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-[#f8fafb] px-6 py-10">
        <ClaimOnboardingShell
          spaceId={spaceId}
          listingTitle={completion.listingTitle}
          currentStep={currentStep}
          stepProgress={stepProgress}
          submitted={showSubmittedConfirmation}
        >
          {showSubmittedConfirmation ? (
            <ClaimSubmittedConfirmation spaceId={spaceId} />
          ) : (
            <>
          {currentStep === "details" ? (
            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Claim details</h2>
              <p className="text-sm text-gray-600">
                Confirm your contact details so we know who is claiming this space.
              </p>

              <ClaimStepStatusCard
                title="Contact details"
                state={contactComplete ? "completed" : "required"}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    First name
                  </span>
                  <input
                    value={firstName}
                    disabled={!canEditSteps}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Last name
                  </span>
                  <input
                    value={lastName}
                    disabled={!canEditSteps}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Email
                  </span>
                  <input
                    value={email}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-gray-700">
                    Phone
                  </span>
                  <input
                    value={phone}
                    disabled={!canEditSteps}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
              </div>

              {canEditSteps ? (
                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={() => void saveContactDetails()}
                  className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingProfile ? "Saving…" : "Save contact details"}
                </button>
              ) : null}

              <div className="flex justify-between pt-2">
                <span />
                <button
                  type="button"
                  onClick={() => goToStep("ownership")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f2740]"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === "ownership" ? (
            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Ownership proof</h2>
              <ClaimStepStatusCard
                title="Proof of ownership or right to manage"
                state={ownershipDisplay.uiState}
                statusLabel={ownershipDisplay.statusLabel}
              />
              <OwnershipProofUpload
                spaceId={spaceId}
                ownerId={ownerId}
                ownershipProof={ownershipProof}
                ownershipProofStatus={ownershipProofStatus}
                onUploaded={handleOwnershipUploaded}
                disabled={!canEditSteps}
              />
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => goToStep("details")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goToStep("identity")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f2740]"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === "identity" ? (
            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Identity verification
              </h2>
              <p className="text-sm text-gray-600">
                Upload your ID document so we can verify who is claiming this space.
              </p>
              <ClaimStepStatusCard
                title="ID front and back"
                description={
                  identityDisplay.uiState === "pending_review"
                    ? "Your ID is with FindMySpace for review."
                    : identityDisplay.uiState === "completed"
                      ? "Identity verified."
                      : "Upload both sides of your ID below."
                }
                state={identityDisplay.uiState}
                statusLabel={identityDisplay.statusLabel}
              />
              <ClaimIdentityUpload
                ownerId={ownerId}
                disabled={!canEditSteps}
                onStatusChange={setIdDocsReady}
                onUploaded={() => void refreshCompletion()}
              />
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => goToStep("ownership")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goToStep("submit")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f2740]"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === "submit" ? (
              <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Submit for review
                </h2>
                <p className="text-sm text-gray-600">
                  Submit your claim for review. Once approved, you&apos;ll be able to
                  edit the listing, add pricing, and complete payout setup.
                </p>

                <div className="space-y-3">
                  <ClaimStepStatusCard
                    title="Contact details"
                    state={contactDisplay.uiState}
                    statusLabel={contactDisplay.statusLabel}
                  />
                  <ClaimStepStatusCard
                    title="Ownership proof"
                    state={ownershipDisplay.uiState}
                    statusLabel={ownershipDisplay.statusLabel}
                  />
                  <ClaimStepStatusCard
                    title="Identity documents"
                    state={identityDisplay.uiState}
                    statusLabel={identityDisplay.statusLabel}
                  />
                </div>

                {submitBlockers.length > 0 && canEditSteps ? (
                  <p className="text-sm text-gray-600">
                    Still needed: {submitBlockers.join(", ")}.
                  </p>
                ) : null}

                {completion.listing_admin_comment &&
                completion.status === "rejected" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="font-semibold text-gray-900">Admin note</p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-700">
                      {completion.listing_admin_comment}
                    </p>
                  </div>
                ) : null}

                {message ? (
                  <p className="text-sm text-red-600">{message}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => goToStep("identity")}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  {readyToSubmit && canEditSteps ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleSubmit()}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Submit claim for review
                        </>
                      )}
                    </button>
                  ) : null}
                </div>

                <p className="text-xs text-gray-500">
                  <Link
                    href={`/spaces/${spaceId}`}
                    className="font-medium text-[#0f2740] hover:underline"
                  >
                    Preview prepared listing
                  </Link>
                  {" "}
                  (read-only until approved)
                </p>
              </section>
          ) : null}
            </>
          )}
        </ClaimOnboardingShell>
      </main>
    </RequireAuth>
  );
}

export default function ListingClaimPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafb] p-6">
          <p className="text-gray-600">Loading…</p>
        </main>
      }
    >
      <ClaimPageContent />
    </Suspense>
  );
}
