import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type ListingReviewEventType =
  | "listing_submitted_for_review"
  | "listing_needs_changes"
  | "listing_rejected"
  | "listing_activated";

export async function notifyListingReviewEvent(params: {
  spaceId: string;
  eventType: ListingReviewEventType;
  adminComment?: string | null;
}): Promise<void> {
  const base = getCanonicalPublicSiteUrl();
  const legacyType =
    params.eventType === "listing_submitted_for_review"
      ? "listing_submitted"
      : params.eventType === "listing_needs_changes"
        ? "listing_needs_changes"
        : params.eventType;

  try {
    const res = await fetch(`${base}/api/notifications/listing-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INTERNAL_API_SECRET
          ? { "X-Internal-Api-Secret": process.env.INTERNAL_API_SECRET }
          : {}),
      },
      body: JSON.stringify({
        spaceId: params.spaceId,
        eventType: legacyType,
        adminComment: params.adminComment ?? undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[listing-review-notify] ${params.eventType} failed:`,
        res.status,
        body
      );
    }
  } catch (err) {
    console.error(`[listing-review-notify] ${params.eventType} error:`, err);
  }
}
