import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrganisationCommercialError } from "@/lib/organisation-commercial-error";
import { adminAudit } from "@/lib/admin-audit";
import {
  ORGANISATION_COMMERCIAL_AUDIT,
  organisationCommercialActorKind,
  organisationCommercialAuditEvent,
} from "@/lib/organisation-commercial-audit";
import { notifyOrganisationCommercialEvent } from "@/lib/organisation-commercial-notify";
import { resolveOrganisationListingPropertyChoice } from "@/lib/organisation-property";
import { createOrganisationProperty } from "@/lib/organisation-property-server";
import { resolveOrganisationPayoutReadiness } from "@/lib/access/organisation-payout-readiness";
import { actorDisplayLabel } from "@/lib/organisation-verification-console";
import {
  BANK_ACCOUNT_TYPES,
  DOCUMENT_KINDS,
  ORGANISATION_TYPES,
  toMaskedBankDto,
  type AdminOrganisationBankDto,
  type MaskedOrganisationBankDto,
  type OrganisationBankAccountType,
  type OrganisationCommercialBundle,
  type OrganisationCommercialProfileDto,
  type OrganisationDocumentKind,
  type OrganisationType,
  type OrganisationVerificationDocumentDto,
} from "@/lib/organisation-commercial-dto";
import {
  ORGANISATION_BANK_PROOFS_BUCKET,
  ORGANISATION_VERIFICATION_BUCKET,
  organisationBankProofPath,
  organisationEntityDocumentPath,
  signOrganisationCommercialFile,
  uploadOrganisationCommercialFile,
  validateOrganisationCommercialUpload,
} from "@/lib/organisation-commercial-storage";

const COMMERCIAL_SELECT =
  "organisation_id, legal_name, trading_name, organisation_type, registration_number, vat_number, address_line1, suburb, city, province, postal_code, country, primary_contact_name, primary_contact_email, primary_contact_phone, authorised_representative_name, authorised_representative_title, verification_status, verification_method, verification_notes, rejection_reason, submitted_at, verified_at, verified_by, rejected_at, rejected_by";

const BANK_MASKED_SELECT =
  "id, organisation_id, version_number, is_current, account_holder_name, bank_name, account_type, branch_code, account_number_last4, proof_of_bank_path, status, review_notes, rejection_reason, submitted_at, reviewed_at";

const BANK_ADMIN_SELECT = `${BANK_MASKED_SELECT}, account_number, reviewed_by`;

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type CommercialRow = Omit<
  OrganisationCommercialProfileDto,
  "verified_by_label" | "rejected_by_label"
> & {
  verified_by?: string | null;
  rejected_by?: string | null;
};

async function loadProfileLabels(
  admin: SupabaseClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id)))
  );
  const labels = new Map<string, string>();
  if (unique.length === 0) return labels;
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, first_name, last_name, email")
    .in("id", unique);
  for (const row of (data || []) as Array<{
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>) {
    labels.set(row.id, actorDisplayLabel(row));
  }
  return labels;
}

async function toCommercialDto(
  admin: SupabaseClient,
  row: CommercialRow | null
): Promise<OrganisationCommercialProfileDto | null> {
  if (!row) return null;
  const labels = await loadProfileLabels(admin, [row.verified_by, row.rejected_by]);
  return {
    ...row,
    verified_by: row.verified_by ?? null,
    verified_by_label: row.verified_by ? labels.get(row.verified_by) ?? null : null,
    rejected_by: row.rejected_by ?? null,
    rejected_by_label: row.rejected_by ? labels.get(row.rejected_by) ?? null : null,
  };
}

function mapRpcError(message: string): OrganisationCommercialError {
  if (message.includes("organisation_bank_proof_required")) {
    return new OrganisationCommercialError(
      400,
      "Proof of bank is required before banking can be submitted for verification.",
      "proof_required"
    );
  }
  if (message.includes("organisation_bank_fields_required")) {
    return new OrganisationCommercialError(
      400,
      "Account holder, bank, type, branch code, and account number are required.",
      "fields_required"
    );
  }
  if (message.includes("organisation_commercial_forbidden")) {
    return new OrganisationCommercialError(403, "Forbidden.", "forbidden");
  }
  if (message.includes("organisation_archived")) {
    return new OrganisationCommercialError(
      400,
      "Archived organisations cannot submit banking.",
      "archived"
    );
  }
  return new OrganisationCommercialError(400, message, "bank_submit_failed");
}

export async function loadOrganisationCommercialBundle(
  admin: SupabaseClient,
  organisationId: string
): Promise<OrganisationCommercialBundle> {
  const { data: organisation, error: orgError } = await admin
    .from("organisations")
    .select("id, name, slug, status, archived_at")
    .eq("id", organisationId)
    .maybeSingle();
  if (orgError || !organisation) {
    throw new OrganisationCommercialError(404, "Organisation not found.", "not_found");
  }

  const org = organisation as {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    archived_at: string | null;
  };

  const [{ data: commercial }, { data: documentRows }, { data: bank }] = await Promise.all([
    admin
      .from("organisation_commercial_profiles")
      .select(COMMERCIAL_SELECT)
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    admin
      .from("organisation_verification_documents")
      .select(
        "id, organisation_id, document_kind, label, file_path, content_type, byte_size, uploaded_at"
      )
      .eq("organisation_id", organisationId)
      .is("replaced_at", null)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("organisation_bank_accounts")
      .select(BANK_MASKED_SELECT)
      .eq("organisation_id", organisationId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const documents: OrganisationVerificationDocumentDto[] = [];
  for (const row of (documentRows || []) as Array<{
    id: string;
    organisation_id: string;
    document_kind: OrganisationDocumentKind;
    label: string | null;
    file_path: string;
    content_type: string | null;
    byte_size: number | null;
    uploaded_at: string;
  }>) {
    documents.push({
      id: row.id,
      organisation_id: row.organisation_id,
      document_kind: row.document_kind,
      label: row.label,
      content_type: row.content_type,
      byte_size: row.byte_size,
      uploaded_at: row.uploaded_at,
      signed_url: await signOrganisationCommercialFile(
        admin,
        ORGANISATION_VERIFICATION_BUCKET,
        row.file_path
      ),
    });
  }

  const bankRow = bank as
    | (MaskedOrganisationBankDto & { proof_of_bank_path?: string | null })
    | null;
  const maskedBank = bankRow ? toMaskedBankDto(bankRow) : null;
  const commercialDto = await toCommercialDto(
    admin,
    (commercial as CommercialRow | null) ?? null
  );

  return {
    organisation: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
    },
    commercial: commercialDto,
    documents,
    bank: maskedBank,
    payout_readiness: resolveOrganisationPayoutReadiness({
      organisationStatus: org.status,
      organisationArchivedAt: org.archived_at,
      verificationStatus: commercialDto?.verification_status ?? null,
      currentBankStatus: maskedBank?.status ?? null,
    }),
  };
}

export async function updateOrganisationCommercialProfile(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
    body: Record<string, unknown>;
  }
): Promise<OrganisationCommercialProfileDto> {
  const patch: Record<string, unknown> = {};
  const textFields = [
    "legal_name",
    "trading_name",
    "registration_number",
    "vat_number",
    "address_line1",
    "suburb",
    "city",
    "province",
    "postal_code",
    "country",
    "primary_contact_name",
    "primary_contact_email",
    "primary_contact_phone",
    "authorised_representative_name",
    "authorised_representative_title",
  ] as const;

  for (const key of textFields) {
    if (key in input.body) {
      patch[key] = key === "legal_name"
        ? trimOrNull(input.body[key]) || undefined
        : trimOrNull(input.body[key]);
    }
  }
  if ("organisation_type" in input.body) {
    const type = trimOrNull(input.body.organisation_type);
    if (type && !ORGANISATION_TYPES.includes(type as OrganisationType)) {
      throw new OrganisationCommercialError(400, "Invalid organisation type.", "invalid_type");
    }
    patch.organisation_type = type;
  }

  if (patch.legal_name !== undefined && !patch.legal_name) {
    throw new OrganisationCommercialError(400, "Legal name is required.", "legal_name_required");
  }

  const { data, error } = await admin
    .from("organisation_commercial_profiles")
    .update(patch)
    .eq("organisation_id", input.organisationId)
    .select(COMMERCIAL_SELECT)
    .single();

  if (error || !data) {
    throw new OrganisationCommercialError(
      400,
      error?.message || "Could not update commercial profile.",
      "update_failed"
    );
  }

  await adminAudit(
    organisationCommercialAuditEvent({
      action: ORGANISATION_COMMERCIAL_AUDIT.commercialUpdated,
      actorUserId: input.actorUserId,
      actorKind: organisationCommercialActorKind(input.isGlobalAdmin),
      organisationId: input.organisationId,
      next: { fields: Object.keys(patch) },
    })
  );

  return (await toCommercialDto(admin, data as CommercialRow)) as OrganisationCommercialProfileDto;
}

export async function submitOrganisationVerification(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    organisationName: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
  }
): Promise<OrganisationCommercialProfileDto> {
  const { data: current, error: loadError } = await admin
    .from("organisation_commercial_profiles")
    .select(COMMERCIAL_SELECT)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (loadError || !current) {
    throw new OrganisationCommercialError(404, "Commercial profile not found.", "not_found");
  }

  const row = current as OrganisationCommercialProfileDto;
  if (row.verification_status === "verified") {
    throw new OrganisationCommercialError(
      409,
      "This organisation is already verified.",
      "already_verified"
    );
  }

  const wasSubmitted = Boolean(row.submitted_at) || row.verification_status === "rejected";
  const { data, error } = await admin
    .from("organisation_commercial_profiles")
    .update({
      verification_status: "pending",
      submitted_at: new Date().toISOString(),
      submitted_by: input.actorUserId,
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
    })
    .eq("organisation_id", input.organisationId)
    .select(COMMERCIAL_SELECT)
    .single();

  if (error || !data) {
    throw new OrganisationCommercialError(
      400,
      error?.message || "Could not submit verification.",
      "submit_failed"
    );
  }

  const action = wasSubmitted
    ? ORGANISATION_COMMERCIAL_AUDIT.verificationResubmitted
    : ORGANISATION_COMMERCIAL_AUDIT.verificationSubmitted;

  await adminAudit(
    organisationCommercialAuditEvent({
      action,
      actorUserId: input.actorUserId,
      actorKind: organisationCommercialActorKind(input.isGlobalAdmin),
      organisationId: input.organisationId,
      previous: { verification_status: row.verification_status },
      next: { verification_status: "pending" },
    })
  );

  await notifyOrganisationCommercialEvent({
    admin,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    kind: wasSubmitted ? "verification_resubmitted" : "verification_submitted",
    actorUserId: input.actorUserId,
  });

  return (await toCommercialDto(admin, data as CommercialRow)) as OrganisationCommercialProfileDto;
}

export async function decideOrganisationVerification(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    organisationName: string;
    actorUserId: string;
    decision: "verify" | "reject";
    method?: string | null;
    notes?: string | null;
    reason?: string | null;
  }
): Promise<OrganisationCommercialProfileDto> {
  const notes = trimOrNull(input.notes);
  const reason = trimOrNull(input.reason);

  const { data: existingRow, error: existingError } = await admin
    .from("organisation_commercial_profiles")
    .select(COMMERCIAL_SELECT)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (existingError || !existingRow) {
    throw new OrganisationCommercialError(404, "Organisation not found.", "not_found");
  }
  const existing = existingRow as CommercialRow;

  if (input.decision === "verify") {
    const method = trimOrNull(input.method);
    if (method !== "document_review" && method !== "admin_assisted") {
      throw new OrganisationCommercialError(
        400,
        "Choose document review or admin-assisted verification.",
        "method_required"
      );
    }
    if (method === "admin_assisted" && !notes && !reason) {
      throw new OrganisationCommercialError(
        400,
        "Admin-assisted verification requires notes or a reason.",
        "notes_required"
      );
    }
    if (method === "document_review") {
      const { count } = await admin
        .from("organisation_verification_documents")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", input.organisationId)
        .is("replaced_at", null);
      if (!count) {
        throw new OrganisationCommercialError(
          400,
          "Document review requires supporting documents.",
          "documents_required"
        );
      }
    }

    if (existing.verification_status === "verified") {
      return (await toCommercialDto(admin, existing)) as OrganisationCommercialProfileDto;
    }

    const { data, error } = await admin
      .from("organisation_commercial_profiles")
      .update({
        verification_status: "verified",
        verification_method: method,
        verification_notes: notes || reason,
        verified_at: new Date().toISOString(),
        verified_by: input.actorUserId,
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null,
      })
      .eq("organisation_id", input.organisationId)
      .in("verification_status", ["pending", "rejected"])
      .select(COMMERCIAL_SELECT)
      .maybeSingle();

    if (error) {
      throw new OrganisationCommercialError(
        400,
        error.message || "Could not verify organisation.",
        "verify_failed"
      );
    }
    if (!data) {
      const { data: latest } = await admin
        .from("organisation_commercial_profiles")
        .select(COMMERCIAL_SELECT)
        .eq("organisation_id", input.organisationId)
        .maybeSingle();
      if ((latest as CommercialRow | null)?.verification_status === "verified") {
        return (await toCommercialDto(admin, latest as CommercialRow)) as OrganisationCommercialProfileDto;
      }
      throw new OrganisationCommercialError(
        400,
        "Could not verify organisation.",
        "verify_failed"
      );
    }

    await adminAudit(
      organisationCommercialAuditEvent({
        action: ORGANISATION_COMMERCIAL_AUDIT.verificationVerified,
        actorUserId: input.actorUserId,
        actorKind: "global_admin",
        organisationId: input.organisationId,
        method,
        reason: notes || reason,
        next: { verification_status: "verified", verification_method: method },
      })
    );

    await notifyOrganisationCommercialEvent({
      admin,
      organisationId: input.organisationId,
      organisationName: input.organisationName,
      kind: "verification_verified",
      actorUserId: input.actorUserId,
    });

    return (await toCommercialDto(admin, data as CommercialRow)) as OrganisationCommercialProfileDto;
  }

  if (!reason) {
    throw new OrganisationCommercialError(
      400,
      "A rejection reason is required.",
      "reason_required"
    );
  }

  if (existing.verification_status === "rejected") {
    return (await toCommercialDto(admin, existing)) as OrganisationCommercialProfileDto;
  }

  const { data, error } = await admin
    .from("organisation_commercial_profiles")
    .update({
      verification_status: "rejected",
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
      rejected_by: input.actorUserId,
      verified_at: null,
      verified_by: null,
      verification_method: null,
    })
    .eq("organisation_id", input.organisationId)
    .in("verification_status", ["pending", "verified"])
    .select(COMMERCIAL_SELECT)
    .maybeSingle();

  if (error) {
    throw new OrganisationCommercialError(
      400,
      error.message || "Could not reject organisation verification.",
      "reject_failed"
    );
  }
  if (!data) {
    const { data: latest } = await admin
      .from("organisation_commercial_profiles")
      .select(COMMERCIAL_SELECT)
      .eq("organisation_id", input.organisationId)
      .maybeSingle();
    if ((latest as CommercialRow | null)?.verification_status === "rejected") {
      return (await toCommercialDto(admin, latest as CommercialRow)) as OrganisationCommercialProfileDto;
    }
    throw new OrganisationCommercialError(
      400,
      "Could not reject organisation verification.",
      "reject_failed"
    );
  }

  await adminAudit(
    organisationCommercialAuditEvent({
      action: ORGANISATION_COMMERCIAL_AUDIT.verificationRejected,
      actorUserId: input.actorUserId,
      actorKind: "global_admin",
      organisationId: input.organisationId,
      reason,
      next: { verification_status: "rejected" },
    })
  );

  await notifyOrganisationCommercialEvent({
    admin,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    kind: "verification_rejected",
    actorUserId: input.actorUserId,
    reason,
  });

  return (await toCommercialDto(admin, data as CommercialRow)) as OrganisationCommercialProfileDto;
}

export async function addOrganisationVerificationDocument(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
    kind: string;
    label?: string | null;
    file: { name: string; type: string; size: number; buffer: Buffer };
  }
): Promise<OrganisationVerificationDocumentDto> {
  if (!DOCUMENT_KINDS.includes(input.kind as OrganisationDocumentKind)) {
    throw new OrganisationCommercialError(400, "Invalid document kind.", "invalid_kind");
  }
  const valid = validateOrganisationCommercialUpload(input.file);
  if (!valid.ok) {
    throw new OrganisationCommercialError(400, valid.error, "invalid_file");
  }

  const id = randomUUID();
  const filePath = organisationEntityDocumentPath(
    input.organisationId,
    id,
    input.file.name
  );
  await uploadOrganisationCommercialFile(
    admin,
    ORGANISATION_VERIFICATION_BUCKET,
    filePath,
    input.file.buffer,
    input.file.type
  );

  const { data, error } = await admin
    .from("organisation_verification_documents")
    .insert({
      id,
      organisation_id: input.organisationId,
      uploaded_by: input.actorUserId,
      document_kind: input.kind,
      label: trimOrNull(input.label),
      file_path: filePath,
      content_type: input.file.type,
      byte_size: input.file.size,
    })
    .select("id, organisation_id, document_kind, label, content_type, byte_size, uploaded_at, file_path")
    .single();

  if (error || !data) {
    throw new OrganisationCommercialError(
      400,
      error?.message || "Could not save document.",
      "document_failed"
    );
  }

  const row = data as OrganisationVerificationDocumentDto & { file_path: string };
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    document_kind: row.document_kind,
    label: row.label,
    content_type: row.content_type,
    byte_size: row.byte_size,
    uploaded_at: row.uploaded_at,
    signed_url: await signOrganisationCommercialFile(
      admin,
      ORGANISATION_VERIFICATION_BUCKET,
      row.file_path
    ),
  };
}

export async function loadMaskedOrganisationBank(
  admin: SupabaseClient,
  organisationId: string
): Promise<MaskedOrganisationBankDto | null> {
  const { data } = await admin
    .from("organisation_bank_accounts")
    .select(BANK_MASKED_SELECT)
    .eq("organisation_id", organisationId)
    .eq("is_current", true)
    .maybeSingle();
  if (!data) return null;
  return toMaskedBankDto(
    data as MaskedOrganisationBankDto & { proof_of_bank_path?: string | null }
  );
}

export async function loadAdminOrganisationBank(
  admin: SupabaseClient,
  organisationId: string
): Promise<AdminOrganisationBankDto | null> {
  const { data } = await admin
    .from("organisation_bank_accounts")
    .select(BANK_ADMIN_SELECT)
    .eq("organisation_id", organisationId)
    .eq("is_current", true)
    .maybeSingle();
  if (!data) return null;
  const row = data as AdminOrganisationBankDto & {
    proof_of_bank_path: string;
    reviewed_by?: string | null;
  };
  const masked = toMaskedBankDto(row);
  const labels = await loadProfileLabels(admin, [row.reviewed_by]);
  return {
    ...masked,
    account_number: row.account_number,
    proof_of_bank_path: row.proof_of_bank_path,
    proof_signed_url: await signOrganisationCommercialFile(
      admin,
      ORGANISATION_BANK_PROOFS_BUCKET,
      row.proof_of_bank_path
    ),
    reviewed_by: row.reviewed_by ?? null,
    reviewed_by_label: row.reviewed_by
      ? labels.get(row.reviewed_by) ?? null
      : null,
  };
}

export async function submitOrganisationBankAccount(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    organisationName: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
    accountHolderName: string;
    bankName: string;
    accountType: string;
    branchCode: string;
    accountNumber: string;
    proofFile: { name: string; type: string; size: number; buffer: Buffer };
  }
): Promise<MaskedOrganisationBankDto> {
  if (!BANK_ACCOUNT_TYPES.includes(input.accountType as OrganisationBankAccountType)) {
    throw new OrganisationCommercialError(400, "Invalid account type.", "invalid_account_type");
  }
  const valid = validateOrganisationCommercialUpload(input.proofFile);
  if (!valid.ok) {
    throw new OrganisationCommercialError(400, valid.error, "invalid_file");
  }

  const uploadId = randomUUID();
  const proofPath = organisationBankProofPath(
    input.organisationId,
    uploadId,
    input.proofFile.name
  );
  await uploadOrganisationCommercialFile(
    admin,
    ORGANISATION_BANK_PROOFS_BUCKET,
    proofPath,
    input.proofFile.buffer,
    input.proofFile.type
  );

  const { data, error } = await admin.rpc("submit_organisation_bank_account", {
    p_organisation_id: input.organisationId,
    p_actor_id: input.actorUserId,
    p_account_holder_name: input.accountHolderName,
    p_bank_name: input.bankName,
    p_account_type: input.accountType,
    p_branch_code: input.branchCode,
    p_account_number: input.accountNumber,
    p_proof_of_bank_path: proofPath,
  });

  if (error || !data) {
    throw mapRpcError(error?.message || "Could not submit bank details.");
  }

  const rpc = data as Record<string, unknown> & MaskedOrganisationBankDto & {
    superseded_verified?: boolean;
    previous_version_number?: number | null;
    proof_of_bank_submitted?: boolean;
  };

  if ("account_number" in rpc) {
    delete (rpc as { account_number?: unknown }).account_number;
  }

  const masked = toMaskedBankDto({
    ...rpc,
    proof_of_bank_path: proofPath,
  });

  const superseded = Boolean(rpc.superseded_verified);
  await adminAudit(
    organisationCommercialAuditEvent({
      action: superseded
        ? ORGANISATION_COMMERCIAL_AUDIT.bankSuperseded
        : ORGANISATION_COMMERCIAL_AUDIT.bankSubmitted,
      actorUserId: input.actorUserId,
      actorKind: organisationCommercialActorKind(input.isGlobalAdmin),
      organisationId: input.organisationId,
      targetType: "organisation_bank_account",
      targetId: masked.id,
      next: {
        status: masked.status,
        version_number: masked.version_number,
        account_number_last4: masked.account_number_last4,
        previous_version_number: rpc.previous_version_number ?? null,
      },
    })
  );

  await notifyOrganisationCommercialEvent({
    admin,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    kind: superseded ? "bank_superseded" : "bank_submitted",
    actorUserId: input.actorUserId,
  });

  return masked;
}

export async function decideOrganisationBankVerification(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    organisationName: string;
    actorUserId: string;
    decision: "verify" | "reject";
    reason?: string | null;
    notes?: string | null;
  }
): Promise<MaskedOrganisationBankDto> {
  const { data: current, error: loadError } = await admin
    .from("organisation_bank_accounts")
    .select(BANK_ADMIN_SELECT)
    .eq("organisation_id", input.organisationId)
    .eq("is_current", true)
    .maybeSingle();

  if (loadError || !current) {
    throw new OrganisationCommercialError(
      404,
      "No current bank account has been submitted.",
      "bank_not_submitted"
    );
  }

  const row = current as {
    id: string;
    status: string;
    proof_of_bank_path: string | null;
    account_holder_name: string;
    bank_name: string;
    account_type: string;
    branch_code: string;
    account_number: string;
    account_number_last4: string;
  };

  if (!row.proof_of_bank_path?.trim() || !row.account_number?.trim()) {
    throw new OrganisationCommercialError(
      400,
      "Proof of bank and complete bank details are required before verification.",
      "proof_required"
    );
  }

  if (input.decision === "verify") {
    if (row.status === "verified") {
      return toMaskedBankDto(
        current as unknown as MaskedOrganisationBankDto & { proof_of_bank_path?: string }
      );
    }

    const { data, error } = await admin
      .from("organisation_bank_accounts")
      .update({
        status: "verified",
        reviewed_at: new Date().toISOString(),
        reviewed_by: input.actorUserId,
        review_notes: trimOrNull(input.notes),
        rejection_reason: null,
      })
      .eq("id", row.id)
      .eq("is_current", true)
      .in("status", ["pending", "rejected"])
      .select(BANK_MASKED_SELECT)
      .maybeSingle();

    if (error) {
      throw new OrganisationCommercialError(
        400,
        error.message || "Could not verify bank details.",
        "verify_failed"
      );
    }
    if (!data) {
      const { data: latest } = await admin
        .from("organisation_bank_accounts")
        .select(BANK_MASKED_SELECT)
        .eq("id", row.id)
        .maybeSingle();
      if ((latest as { status?: string } | null)?.status === "verified") {
        return toMaskedBankDto(
          latest as MaskedOrganisationBankDto & { proof_of_bank_path?: string }
        );
      }
      throw new OrganisationCommercialError(
        400,
        "Could not verify bank details.",
        "verify_failed"
      );
    }

    await adminAudit(
      organisationCommercialAuditEvent({
        action: ORGANISATION_COMMERCIAL_AUDIT.bankVerified,
        actorUserId: input.actorUserId,
        actorKind: "global_admin",
        organisationId: input.organisationId,
        targetType: "organisation_bank_account",
        targetId: row.id,
        next: { status: "verified", account_number_last4: row.account_number_last4 },
      })
    );

    await notifyOrganisationCommercialEvent({
      admin,
      organisationId: input.organisationId,
      organisationName: input.organisationName,
      kind: "bank_verified",
      actorUserId: input.actorUserId,
    });

    return toMaskedBankDto(data as MaskedOrganisationBankDto & { proof_of_bank_path?: string });
  }

  const reason = trimOrNull(input.reason);
  if (!reason) {
    throw new OrganisationCommercialError(
      400,
      "A rejection reason is required.",
      "reason_required"
    );
  }

  if (row.status === "rejected") {
    return toMaskedBankDto(
      current as unknown as MaskedOrganisationBankDto & { proof_of_bank_path?: string }
    );
  }

  const { data, error } = await admin
    .from("organisation_bank_accounts")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.actorUserId,
      rejection_reason: reason,
      review_notes: trimOrNull(input.notes),
    })
    .eq("id", row.id)
    .eq("is_current", true)
    .in("status", ["pending", "verified"])
    .select(BANK_MASKED_SELECT)
    .maybeSingle();

  if (error) {
    throw new OrganisationCommercialError(
      400,
      error.message || "Could not reject bank details.",
      "reject_failed"
    );
  }
  if (!data) {
    const { data: latest } = await admin
      .from("organisation_bank_accounts")
      .select(BANK_MASKED_SELECT)
      .eq("id", row.id)
      .maybeSingle();
    if ((latest as { status?: string } | null)?.status === "rejected") {
      return toMaskedBankDto(
        latest as MaskedOrganisationBankDto & { proof_of_bank_path?: string }
      );
    }
    throw new OrganisationCommercialError(
      400,
      "Could not reject bank details.",
      "reject_failed"
    );
  }

  await adminAudit(
    organisationCommercialAuditEvent({
      action: ORGANISATION_COMMERCIAL_AUDIT.bankRejected,
      actorUserId: input.actorUserId,
      actorKind: "global_admin",
      organisationId: input.organisationId,
      targetType: "organisation_bank_account",
      targetId: row.id,
      reason,
      next: { status: "rejected", account_number_last4: row.account_number_last4 },
    })
  );

  await notifyOrganisationCommercialEvent({
    admin,
    organisationId: input.organisationId,
    organisationName: input.organisationName,
    kind: "bank_rejected",
    actorUserId: input.actorUserId,
    reason,
  });

  return toMaskedBankDto(data as MaskedOrganisationBankDto & { proof_of_bank_path?: string });
}

export async function createOrganisationListing(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    propertyId?: string | null;
    payload: Record<string, unknown>;
    actorUserId: string;
    isGlobalAdmin?: boolean;
  }
): Promise<{ id: string; propertyId: string }> {
  const { data: existing } = await admin
    .from("properties")
    .select("id, archived_at")
    .eq("organisation_id", input.organisationId)
    .order("created_at", { ascending: true });
  const organisationPropertyIds = (
    (existing || []) as Array<{ id: string; archived_at?: string | null }>
  )
    .filter((row) => !row.archived_at)
    .map((row) => row.id);

  const choice = resolveOrganisationListingPropertyChoice({
    organisationPropertyIds,
    requestedPropertyId: input.propertyId,
  });

  let propertyId: string | null = null;
  if (choice.kind === "invalid") {
    throw new OrganisationCommercialError(
      400,
      "Property must belong to this organisation.",
      "property_mismatch"
    );
  }
  if (choice.kind === "required") {
    throw new OrganisationCommercialError(
      400,
      "Choose which property this space belongs to.",
      "property_required"
    );
  }
  if (choice.kind === "use") {
    propertyId = choice.propertyId;
  } else {
    const { data: org } = await admin
      .from("organisations")
      .select("name")
      .eq("id", input.organisationId)
      .maybeSingle();
    const created = await createOrganisationProperty(admin, {
      organisationId: input.organisationId,
      actorUserId: input.actorUserId,
      isGlobalAdmin: Boolean(input.isGlobalAdmin),
      fields: {
        name:
          (typeof input.payload.city === "string" && input.payload.city.trim()) ||
          (org as { name?: string } | null)?.name ||
          "Organisation property",
        address_line1:
          (typeof input.payload.street_address === "string"
            ? input.payload.street_address
            : null) ||
          (typeof input.payload.address_line_1 === "string"
            ? input.payload.address_line_1
            : null),
        suburb:
          typeof input.payload.suburb === "string" ? input.payload.suburb : null,
        city: typeof input.payload.city === "string" ? input.payload.city : null,
        province:
          typeof input.payload.province === "string" ? input.payload.province : null,
        postal_code:
          typeof input.payload.postal_code === "string"
            ? input.payload.postal_code
            : null,
        country:
          typeof input.payload.country === "string"
            ? input.payload.country
            : "South Africa",
        latitude:
          typeof input.payload.latitude === "number" ? input.payload.latitude : null,
        longitude:
          typeof input.payload.longitude === "number"
            ? input.payload.longitude
            : null,
      },
    });
    propertyId = created.id;
  }

  if (!propertyId) {
    throw new OrganisationCommercialError(
      400,
      "Choose which property this space belongs to.",
      "property_required"
    );
  }

  const {
    _attributes: rawAttributes,
    owner_id: _ignoredOwner,
    ...spaceFields
  } = input.payload;

  const insertRow = {
    ...spaceFields,
    owner_id: null,
    property_id: propertyId,
  };

  const { data, error } = await admin
    .from("spaces")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data) {
    throw new OrganisationCommercialError(
      400,
      error?.message || "Could not create listing.",
      "listing_create_failed"
    );
  }

  const spaceId = (data as { id: string }).id;
  if (rawAttributes && typeof rawAttributes === "object") {
    const rows = Object.entries(rawAttributes as Record<string, unknown>).flatMap(
      ([attributeKey, values]) =>
        Array.isArray(values)
          ? values
              .filter((value): value is string => typeof value === "string" && value.trim() !== "")
              .map((value) => ({
                space_id: spaceId,
                attribute_key: attributeKey,
                attribute_value: value,
              }))
          : []
    );
    if (rows.length > 0) {
      await admin.from("space_attributes").insert(rows);
    }
  }

  return { id: spaceId, propertyId };
}
