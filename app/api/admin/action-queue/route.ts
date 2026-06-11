import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { daysSince } from "@/lib/days-waiting";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const [
    { count: newEnquiries },
    { count: newClaimInterests },
    { count: pendingListingReviews },
    { count: pendingIdentity },
    { count: pendingBank },
    { count: pendingBookingPayments },
    { data: oldestReviewRows },
    { data: oldestEnquiry },
    { data: oldestClaim },
    { data: pendingIdentityProfiles },
    { data: pendingBankProfiles },
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
      .in("status", ["owner_claimed", "pending_verification", "needs_changes", "rejected"])
      .not("owner_id", "is", null),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_host", true)
      .eq("owner_verification_status", "pending"),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_host", true)
      .eq("bank_verification_status", "pending"),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_owner"),
    admin
      .from("spaces")
      .select("submitted_for_review_at, claimed_at, created_at")
      .in("status", ["owner_claimed", "pending_verification", "needs_changes", "rejected"])
      .not("owner_id", "is", null)
      .limit(200),
    admin
      .from("listing_enquiries")
      .select("created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("listing_claim_interests")
      .select("created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id")
      .eq("is_host", true)
      .eq("owner_verification_status", "pending"),
    admin
      .from("profiles")
      .select("id")
      .eq("is_host", true)
      .eq("bank_verification_status", "pending"),
  ]);

  const identityIds = ((pendingIdentityProfiles as { id: string }[]) || []).map(
    (row) => row.id
  );
  const bankIds = ((pendingBankProfiles as { id: string }[]) || []).map(
    (row) => row.id
  );

  let oldestIdentityDoc: { uploaded_at: string | null } | null = null;
  let oldestBankDoc: { uploaded_at: string | null } | null = null;

  if (identityIds.length > 0) {
    const { data } = await admin
      .from("owner_verification_documents")
      .select("uploaded_at")
      .in("owner_id", identityIds)
      .not("uploaded_at", "is", null)
      .order("uploaded_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    oldestIdentityDoc = data;
  }

  if (bankIds.length > 0) {
    const { data } = await admin
      .from("owner_bank_details")
      .select("uploaded_at")
      .in("owner_id", bankIds)
      .not("uploaded_at", "is", null)
      .order("uploaded_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    oldestBankDoc = data;
  }

  const reviewRows = (oldestReviewRows as {
    submitted_for_review_at?: string | null;
    claimed_at?: string | null;
    created_at?: string | null;
  }[]) || [];
  let reviewDate: string | null = null;
  for (const row of reviewRows) {
    const candidate =
      row.submitted_for_review_at || row.claimed_at || row.created_at || null;
    if (!candidate) continue;
    if (!reviewDate || new Date(candidate) < new Date(reviewDate)) {
      reviewDate = candidate;
    }
  }

  const identityDays = daysSince(oldestIdentityDoc?.uploaded_at);
  const bankDays = daysSince(oldestBankDoc?.uploaded_at);
  const verificationDays =
    identityDays === null
      ? bankDays
      : bankDays === null
        ? identityDays
        : Math.max(identityDays, bankDays);

  return NextResponse.json({
    newListingEnquiries: newEnquiries ?? 0,
    newClaimInterests: newClaimInterests ?? 0,
    pendingListingReviews: pendingListingReviews ?? 0,
    pendingIdentityVerification: pendingIdentity ?? 0,
    pendingBankVerification: pendingBank ?? 0,
    pendingBookingPayments: pendingBookingPayments ?? 0,
    oldestListingReviewDays: daysSince(reviewDate),
    oldestListingEnquiryDays: daysSince(
      (oldestEnquiry as { created_at?: string } | null)?.created_at
    ),
    oldestClaimInterestDays: daysSince(
      (oldestClaim as { created_at?: string } | null)?.created_at
    ),
    oldestIdentityVerificationDays: identityDays,
    oldestBankVerificationDays: bankDays,
    oldestVerificationDays: verificationDays,
  });
}
