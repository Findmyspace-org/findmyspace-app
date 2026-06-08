import { NextRequest, NextResponse } from "next/server";
import { adminAudit } from "@/lib/admin-audit";
import { computeListingCompletion } from "@/lib/listing-completion";
import { notifyListingReviewEvent } from "@/lib/listing-review-notify";
import { requireOwnerListingApi } from "@/lib/require-owner-listing-api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerListingApi(req, id);
  if ("response" in auth) return auth.response;

  const completion = await computeListingCompletion(auth.admin, id);
  if (!completion) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  if (
    completion.status !== "owner_claimed" &&
    completion.status !== "needs_changes" &&
    completion.status !== "rejected"
  ) {
    return NextResponse.json(
      {
        error:
          "This listing cannot be submitted in its current status. Complete missing steps or wait for admin review.",
      },
      { status: 400 }
    );
  }

  if (!completion.canSubmit) {
    return NextResponse.json(
      {
        error: "Complete all required steps before submitting.",
        submitBlockers: completion.submitBlockers,
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await auth.admin
    .from("spaces")
    .update({
      status: "pending_verification",
      submitted_for_review_at: now,
    })
    .eq("id", id)
    .eq("owner_id", auth.userId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminAudit({
    action: "listing_submitted_for_review",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
  });

  await notifyListingReviewEvent({
    spaceId: id,
    eventType: "listing_submitted_for_review",
  });

  const updated = await computeListingCompletion(auth.admin, id);
  return NextResponse.json({ ok: true, completion: updated });
}
