import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildClaimReadiness,
  claimSubmitBlockers,
} from "@/lib/claim-readiness";

export type ChecklistItemState = "done" | "missing" | "pending_review" | "rejected";

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  state: ChecklistItemState;
  requiredForSubmit: boolean;
  requiredForApproval: boolean;
};

export type ListingCompletionResult = {
  spaceId: string;
  status: string | null;
  listingTitle: string | null;
  canSubmit: boolean;
  canApprove: boolean;
  submitBlockers: string[];
  approvalBlockers: string[];
  items: ChecklistItem[];
  owner: {
    owner_verification_status: string | null;
    bank_verification_status: string | null;
  };
  ownership_proof_status: string | null;
  listing_admin_comment: string | null;
  submitted_for_review_at: string | null;
};

type SpaceRow = {
  id: string;
  title: string | null;
  description: string | null;
  space_type: string | null;
  booking_unit: string | null;
  city: string | null;
  suburb: string | null;
  status: string | null;
  owner_id: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  ownership_proof_status: string | null;
  listing_admin_comment: string | null;
  submitted_for_review_at: string | null;
};

function docState(
  hasFile: boolean,
  status: string | null | undefined
): ChecklistItemState {
  if (!hasFile) return "missing";
  if (status === "verified") return "done";
  if (status === "rejected") return "rejected";
  return "pending_review";
}

function uploadedVerificationState(
  uploaded: boolean,
  profileStatus: string | null | undefined
): ChecklistItemState {
  if (!uploaded) return "missing";
  if (profileStatus === "verified") return "done";
  if (profileStatus === "rejected") return "rejected";
  return "pending_review";
}

function hasPricing(space: SpaceRow): boolean {
  const unit = space.booking_unit || "day";
  if (unit === "hour") return (space.price_per_hour ?? 0) > 0;
  if (unit === "month") return (space.price_per_month ?? 0) > 0;
  return (space.price_per_day ?? 0) > 0;
}

function basicsComplete(space: SpaceRow): boolean {
  return Boolean(
    space.title?.trim() &&
      space.space_type?.trim() &&
      space.description?.trim() &&
      (space.city?.trim() || space.suburb?.trim())
  );
}

export async function computeListingCompletion(
  admin: SupabaseClient,
  spaceId: string
): Promise<ListingCompletionResult | null> {
  const { data: space, error } = await admin
    .from("spaces")
    .select(
      "id, title, description, space_type, booking_unit, city, suburb, status, owner_id, price_per_hour, price_per_day, price_per_month, ownership_proof_status, listing_admin_comment, submitted_for_review_at"
    )
    .eq("id", spaceId)
    .maybeSingle();

  if (error || !space) return null;

  const row = space as SpaceRow;
  const ownerId = row.owner_id;
  if (!ownerId) return null;

  const [
    { count: imageCount },
    { count: blockedCount },
    { data: ownershipDoc },
    { data: profile },
    { data: idDocs },
    { data: bankRow },
  ] = await Promise.all([
    admin
      .from("space_images")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId),
    admin
      .from("blocked_dates")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId),
    admin
      .from("listing_ownership_documents")
      .select("id, status")
      .eq("space_id", spaceId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("profiles")
      .select(
        "owner_verification_status, bank_verification_status, first_name, phone"
      )
      .eq("id", ownerId)
      .maybeSingle(),
    admin
      .from("owner_verification_documents")
      .select("document_type, status")
      .eq("owner_id", ownerId),
    admin
      .from("owner_bank_details")
      .select("id, status, proof_file_path")
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);

  const prof = profile as {
    owner_verification_status: string | null;
    bank_verification_status: string | null;
    first_name: string | null;
    phone: string | null;
  } | null;

  const contactComplete = Boolean(
    prof?.first_name?.trim() && prof?.phone?.trim()
  );

  const idDocList =
    (idDocs as { document_type: string; status: string | null }[]) || [];
  const hasIdFront = idDocList.some((d) => d.document_type === "id_front");
  const hasIdBack = idDocList.some((d) => d.document_type === "id_back");
  const identitySubmitted = hasIdFront && hasIdBack;
  const bank = bankRow as {
    status: string | null;
    proof_file_path: string | null;
  } | null;
  const bankSubmitted = Boolean(
    bank?.proof_file_path || bank?.status === "pending" || bank?.status === "verified"
  );

  const ownership = ownershipDoc as { status: string | null } | null;
  const hasOwnershipFile = Boolean(
    ownership ||
      row.ownership_proof_status === "pending" ||
      row.ownership_proof_status === "verified"
  );
  const ownershipStatus = row.ownership_proof_status || ownership?.status || null;

  const basicsDone = basicsComplete(row);
  const photosDone = (imageCount ?? 0) >= 1;
  const pricingDone = hasPricing(row);
  const availabilityDone = (blockedCount ?? 0) > 0;

  const identityState = uploadedVerificationState(
    identitySubmitted,
    prof?.owner_verification_status
  );
  const bankState = uploadedVerificationState(
    bankSubmitted,
    prof?.bank_verification_status
  );
  const ownershipState = docState(hasOwnershipFile, ownershipStatus);

  const isClaimOnboarding = row.status === "owner_claimed";
  const isClaimSubmitFlow =
    row.status === "owner_claimed" || row.status === "rejected";
  const claimHref = `/dashboard/listings/${spaceId}/claim`;

  const items: ChecklistItem[] = [
    {
      id: "basics",
      title: "Listing basics",
      description: "Title, category, description, and location.",
      href: `/spaces/${spaceId}/edit`,
      state: basicsDone ? "done" : "missing",
      requiredForSubmit: !isClaimOnboarding,
      requiredForApproval: true,
    },
    {
      id: "photos",
      title: "Photos",
      description: "At least one listing photo.",
      href: `/spaces/${spaceId}/edit`,
      state: photosDone ? "done" : "missing",
      requiredForSubmit: !isClaimOnboarding,
      requiredForApproval: true,
    },
    {
      id: "pricing",
      title: "Pricing",
      description: "Set a rate for your booking unit (hour, day, or month).",
      href: `/spaces/${spaceId}/edit`,
      state: pricingDone ? "done" : "missing",
      requiredForSubmit: !isClaimOnboarding,
      requiredForApproval: true,
    },
    {
      id: "availability",
      title: "Availability",
      description: "Review your calendar and block unavailable dates.",
      href: "/dashboard/calendar",
      state: availabilityDone ? "done" : "missing",
      requiredForSubmit: false,
      requiredForApproval: false,
    },
    {
      id: "identity",
      title: "Identity verification",
      description: "Upload ID front and back.",
      href: isClaimOnboarding
        ? `${claimHref}?step=identity`
        : "/dashboard/verification?step=identity",
      state: identityState,
      requiredForSubmit: true,
      requiredForApproval: true,
    },
    {
      id: "bank",
      title: "Bank verification",
      description: "Bank details and proof of bank account (required before payouts).",
      href: "/dashboard/verification?step=bank",
      state: bankState,
      requiredForSubmit: !isClaimSubmitFlow,
      requiredForApproval: true,
    },
    {
      id: "ownership",
      title: "Ownership proof",
      description: "Proof of right to list this space.",
      href: isClaimOnboarding ? `${claimHref}?step=ownership` : `/spaces/${spaceId}/edit`,
      state: ownershipState,
      requiredForSubmit: true,
      requiredForApproval: true,
    },
  ];

  const submitBlockers: string[] = [];
  if (isClaimSubmitFlow) {
    const claimReadiness = buildClaimReadiness({
      contactComplete,
      hasOwnershipProof: hasOwnershipFile,
      hasIdFront,
      hasIdBack,
      ownershipVerified: ownershipState === "done",
      identityVerified: identityState === "done",
      ownershipRejected: ownershipState === "rejected",
      identityRejected: identityState === "rejected",
    });
    submitBlockers.push(...claimSubmitBlockers(claimReadiness));
  } else {
    for (const item of items) {
      if (!item.requiredForSubmit) continue;
      if (item.id === "identity" || item.id === "bank" || item.id === "ownership") {
        if (item.state === "missing" || item.state === "rejected") {
          submitBlockers.push(item.title);
        }
        continue;
      }
      if (item.state !== "done") submitBlockers.push(item.title);
    }
  }

  const approvalBlockers: string[] = [];
  for (const item of items) {
    if (!item.requiredForApproval) continue;
    if (item.state !== "done") approvalBlockers.push(item.title);
  }

  const canSubmit =
    submitBlockers.length === 0 &&
    (row.status === "owner_claimed" ||
      row.status === "needs_changes" ||
      row.status === "rejected");

  const canApprove =
    approvalBlockers.length === 0 &&
    (row.status === "pending_verification" || row.status === "pending");

  return {
    spaceId,
    status: row.status,
    listingTitle: row.title,
    canSubmit,
    canApprove,
    submitBlockers,
    approvalBlockers,
    items,
    owner: {
      owner_verification_status: prof?.owner_verification_status ?? null,
      bank_verification_status: prof?.bank_verification_status ?? null,
    },
    ownership_proof_status: ownershipStatus,
    listing_admin_comment: row.listing_admin_comment,
    submitted_for_review_at: row.submitted_for_review_at,
  };
}

export const OWNER_REVIEWABLE_STATUSES = [
  "owner_claimed",
  "needs_changes",
  "pending_verification",
  "rejected",
] as const;

export const ADMIN_REVIEW_QUEUE_STATUSES = [
  "pending_verification",
  "needs_changes",
  "owner_claimed",
] as const;
