#!/usr/bin/env node
/**
 * Organisation verification console UX helpers — application-only.
 * Run: npm run test:organisation-verification-console
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveOrganisationPayoutReadiness } from "../lib/access/organisation-payout-readiness";
import {
  actorDisplayLabel,
  compactPayoutReadinessLabel,
  countOrganisationAwaitingReview,
  organisationAwaitingAdminReview,
  organisationVerificationMethodLabel,
  proofPreviewKind,
  shouldShowPrimaryVerifyActions,
} from "../lib/organisation-verification-console";

{
  assert.equal(organisationVerificationMethodLabel("admin_assisted"), "Admin-assisted");
  assert.equal(organisationVerificationMethodLabel("document_review"), "Document review");
  assert.equal(organisationVerificationMethodLabel(null), null);
  assert.equal(
    actorDisplayLabel({ full_name: "Schalk Admin" }),
    "Schalk Admin"
  );
  assert.equal(
    actorDisplayLabel({ first_name: "A", last_name: "B", email: "x@y.z" }),
    "A B"
  );
}

{
  assert.equal(compactPayoutReadinessLabel("ready"), "Payout ready");
  assert.equal(
    compactPayoutReadinessLabel("organisation_unverified"),
    "Organisation verification required"
  );
  assert.equal(compactPayoutReadinessLabel("bank_not_submitted"), "Bank details required");
  assert.equal(
    compactPayoutReadinessLabel("bank_pending"),
    "Bank verification pending"
  );
  assert.equal(
    compactPayoutReadinessLabel("bank_rejected"),
    "Bank verification rejected"
  );
  assert.equal(
    compactPayoutReadinessLabel("organisation_archived"),
    "Organisation inactive"
  );
}

{
  const orgPendingBankPending = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "pending",
    currentBankStatus: "pending",
  });
  assert.equal(orgPendingBankPending.ready, false);
  assert.equal(
    compactPayoutReadinessLabel(orgPendingBankPending.code),
    "Organisation verification required"
  );

  const orgVerifiedBankPending = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "verified",
    currentBankStatus: "pending",
  });
  assert.equal(orgVerifiedBankPending.ready, false);
  assert.equal(
    compactPayoutReadinessLabel(orgVerifiedBankPending.code),
    "Bank verification pending"
  );

  const payoutReady = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "verified",
    currentBankStatus: "verified",
  });
  assert.equal(payoutReady.ready, true);
  assert.equal(compactPayoutReadinessLabel(payoutReady.code), "Payout ready");

  const orgRejectedBankVerified = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "rejected",
    currentBankStatus: "verified",
  });
  assert.equal(orgRejectedBankVerified.ready, false);
  assert.equal(orgRejectedBankVerified.code, "organisation_unverified");

  const archived = resolveOrganisationPayoutReadiness({
    organisationStatus: "archived",
    verificationStatus: "verified",
    currentBankStatus: "verified",
  });
  assert.equal(archived.ready, false);
  assert.equal(compactPayoutReadinessLabel(archived.code), "Organisation inactive");

  const noBank = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "verified",
    currentBankStatus: null,
  });
  assert.equal(compactPayoutReadinessLabel(noBank.code), "Bank details required");

  const bankRejected = resolveOrganisationPayoutReadiness({
    organisationStatus: "active",
    verificationStatus: "verified",
    currentBankStatus: "rejected",
  });
  assert.equal(
    compactPayoutReadinessLabel(bankRejected.code),
    "Bank verification rejected"
  );
}

{
  assert.equal(shouldShowPrimaryVerifyActions("verified", false), false);
  assert.equal(shouldShowPrimaryVerifyActions("verified", true), true);
  assert.equal(shouldShowPrimaryVerifyActions("pending", false), true);
  assert.equal(shouldShowPrimaryVerifyActions("rejected", false), true);
  assert.equal(
    countOrganisationAwaitingReview([
      { verification_status: "verified", bank_status: "verified" },
      { verification_status: "pending", bank_status: "not_submitted" },
      { verification_status: "verified", bank_status: "pending" },
    ]),
    2
  );
  assert.equal(
    organisationAwaitingAdminReview({
      verification_status: "verified",
      bank_status: "verified",
    }),
    false
  );
}

{
  assert.equal(proofPreviewKind("file.pdf", "application/pdf"), "pdf");
  assert.equal(proofPreviewKind("file.jpg", "image/jpeg"), "image");
  assert.equal(proofPreviewKind("proof.png"), "image");
}

{
  const page = readFileSync("app/admin/verification/organisations/page.tsx", "utf8");
  assert.match(page, /verification_notes/);
  assert.match(page, /verified_by_label/);
  assert.match(page, /Change decision/);
  assert.match(page, /Verifying…/);
  assert.match(page, /Rejecting…/);
  assert.match(page, /orgInFlight/);
  assert.match(page, /bankInFlight/);
  assert.match(page, /OrganisationProofPreviewModal/);
  assert.match(page, /shouldShowPrimaryVerifyActions/);
  assert.match(page, /compactPayoutReadinessLabel/);
  assert.match(page, /account_number_display/);
  assert.doesNotMatch(page, /target="_blank"[\s\S]{0,80}View proof of bank/);
  assert.match(page, /useAdminRole/);
  assert.match(page, /isAdmin/);

  const modal = readFileSync(
    "app/components/admin/OrganisationProofPreviewModal.tsx",
    "utf8"
  );
  assert.match(modal, /Escape/);
  assert.match(modal, /aria-modal/);
  assert.match(modal, /Open full size/);
  assert.match(modal, /onClose/);

  const landing = readFileSync("app/admin/verification/page.tsx", "utf8");
  assert.match(landing, /Identity and personal bank verification/);
  assert.match(landing, /Organisation authority and payout bank verification/);
  assert.match(landing, /\/admin\/verification\/organisations/);
  assert.match(landing, /countOrganisationAwaitingReview/);

  const server = readFileSync("lib/organisation-commercial-server.ts", "utf8");
  assert.match(server, /verified_by, rejected_at, rejected_by/);
  assert.match(server, /account_number, reviewed_by/);
  assert.match(server, /if \(existing\.verification_status === "verified"\)/);
  assert.match(server, /if \(row\.status === "verified"\)/);
  assert.match(server, /\.in\("verification_status", \["pending", "rejected"\]\)/);
  assert.match(server, /\.in\("status", \["pending", "rejected"\]\)/);
  assert.match(server, /toCommercialDto/);
  const maskedSelect = server.split("const BANK_ADMIN_SELECT")[0];
  assert.doesNotMatch(maskedSelect, /reviewed_by/);

  const dto = readFileSync("lib/organisation-commercial-dto.ts", "utf8");
  assert.match(dto, /verified_by_label/);
  assert.match(dto, /reviewed_by_label/);

  const oaBank = readFileSync("app/api/organisations/[organisationId]/bank/route.ts", "utf8");
  assert.match(oaBank, /loadMaskedOrganisationBank/);
  assert.doesNotMatch(oaBank, /loadAdminOrganisationBank/);
}

console.log("organisation verification console tests passed");
