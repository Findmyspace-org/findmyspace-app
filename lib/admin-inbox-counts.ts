import type { SupabaseClient } from "@supabase/supabase-js";
import { HEADER_DROPDOWN_NOTIFICATION_TYPES } from "@/lib/header-notification-types";
import { deriveAdminVerificationQueueFlags } from "@/lib/workflow-state";

/** Listing statuses that require admin review action. */
export const LISTING_REVIEW_ACTION_STATUSES = [
  "owner_claimed",
  "pending_verification",
  "pending",
] as const;

export type AdminModuleActionCounts = {
  listingEnquiries: number;
  listingClaimInterests: number;
  listingReviews: number;
  verification: number;
  pendingBookingPayments: number;
};

export type AdminInboxCounts = {
  unread: number;
  actionRequired: number;
  modules: AdminModuleActionCounts;
};

type VerificationDocRow = {
  owner_id: string;
  document_type: string;
  file_url: string | null;
  file_path: string | null;
};

type VerificationBankRow = {
  owner_id: string;
  proof_of_bank_url: string | null;
  proof_of_bank_path: string | null;
};

type VerificationProfileRow = {
  id: string;
  owner_verification_status: string | null;
  bank_verification_status: string | null;
};

export async function countAdminUnreadNotifications(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", [...HEADER_DROPDOWN_NOTIFICATION_TYPES])
    .is("read_at", null)
    .is("archived_at", null);

  if (error) return 0;
  return count ?? 0;
}

export async function computeAdminVerificationActionCount(
  admin: SupabaseClient
): Promise<number> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, owner_verification_status, bank_verification_status")
    .eq("is_host", true);

  const hostProfiles = (profiles as VerificationProfileRow[]) || [];
  if (hostProfiles.length === 0) return 0;

  const ownerIds = hostProfiles.map((row) => row.id);

  const [{ data: docs }, { data: banks }] = await Promise.all([
    admin
      .from("owner_verification_documents")
      .select("owner_id, document_type, file_url, file_path")
      .in("owner_id", ownerIds),
    admin
      .from("owner_bank_details")
      .select("owner_id, proof_of_bank_url, proof_of_bank_path")
      .in("owner_id", ownerIds),
  ]);

  const docsByOwner = new Map<string, VerificationDocRow[]>();
  for (const row of (docs as VerificationDocRow[]) || []) {
    const list = docsByOwner.get(row.owner_id) || [];
    list.push(row);
    docsByOwner.set(row.owner_id, list);
  }

  const bankByOwner = new Map<string, VerificationBankRow>();
  for (const row of (banks as VerificationBankRow[]) || []) {
    bankByOwner.set(row.owner_id, row);
  }

  let count = 0;
  for (const profile of hostProfiles) {
    const ownerDocs = docsByOwner.get(profile.id) || [];
    const hasIdFront = ownerDocs.some(
      (doc) =>
        doc.document_type === "id_front" &&
        Boolean(doc.file_url || doc.file_path)
    );
    const hasIdBack = ownerDocs.some(
      (doc) =>
        doc.document_type === "id_back" &&
        Boolean(doc.file_url || doc.file_path)
    );
    const bank = bankByOwner.get(profile.id);
    const hasBankProof = Boolean(
      bank?.proof_of_bank_url || bank?.proof_of_bank_path
    );

    const flags = deriveAdminVerificationQueueFlags({
      ownerVerificationStatus: profile.owner_verification_status,
      bankVerificationStatus: profile.bank_verification_status,
      hasIdFront,
      hasIdBack,
      hasBankProof,
    });

    if (flags.identityPending || flags.bankPending) {
      count += 1;
    }
  }

  return count;
}

export async function computeAdminModuleActionCounts(
  admin: SupabaseClient
): Promise<AdminModuleActionCounts> {
  const [
    { count: newEnquiries },
    { count: newClaimInterests },
    { count: pendingListingReviews },
    { count: pendingBookingPayments },
    verification,
  ] = await Promise.all([
    admin
      .from("listing_enquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    admin
      .from("listing_claim_interests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .in("status", [...LISTING_REVIEW_ACTION_STATUSES])
      .not("owner_id", "is", null),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_owner"),
    computeAdminVerificationActionCount(admin),
  ]);

  return {
    listingEnquiries: newEnquiries ?? 0,
    listingClaimInterests: newClaimInterests ?? 0,
    listingReviews: pendingListingReviews ?? 0,
    verification,
    pendingBookingPayments: pendingBookingPayments ?? 0,
  };
}

export async function computeAdminInboxCounts(
  admin: SupabaseClient,
  userId: string
): Promise<AdminInboxCounts> {
  const [unread, modules] = await Promise.all([
    countAdminUnreadNotifications(admin, userId),
    computeAdminModuleActionCounts(admin),
  ]);

  const actionRequired =
    modules.listingEnquiries +
    modules.listingClaimInterests +
    modules.listingReviews +
    modules.verification +
    modules.pendingBookingPayments;

  return { unread, actionRequired, modules };
}
