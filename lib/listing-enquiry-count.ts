import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

export async function getListingEnquiryCount(listingId: string): Promise<number> {
  const admin = createServiceAdminClient();
  if (!admin) return 0;

  const { count, error } = await admin
    .from("listing_enquiries")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);

  if (error) {
    console.error("[listing-enquiry-count]", error.message);
    return 0;
  }

  return count ?? 0;
}
