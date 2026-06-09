import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

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
      .eq("status", "pending_verification")
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
  ]);

  return NextResponse.json({
    newListingEnquiries: newEnquiries ?? 0,
    newClaimInterests: newClaimInterests ?? 0,
    pendingListingReviews: pendingListingReviews ?? 0,
    pendingIdentityVerification: pendingIdentity ?? 0,
    pendingBankVerification: pendingBank ?? 0,
    pendingBookingPayments: pendingBookingPayments ?? 0,
  });
}
