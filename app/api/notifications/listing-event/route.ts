import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import {
  emailStrong,
  renderEmailLayout,
} from "@/lib/email-templates/EmailLayout";
import {
  buildListingActivatedCopy,
  buildListingPendingCopy,
  buildListingRejectedCopy,
  buildListingSubmittedCopy,
  buildOwnershipProofVerifiedCopy,
} from "@/lib/communication-copy";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type BasicProfile = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type ListingEventType =
  | "listing_submitted"
  | "listing_pending"
  | "listing_rejected"
  | "listing_activated"
  | "ownership_proof_verified";

function getDisplayName(profile?: BasicProfile) {
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return fullName || profile?.email || "User";
}

async function createInAppNotification({
  supabaseAdmin,
  userId,
  role,
  title,
  message,
  type,
  href,
  spaceId,
}: {
  supabaseAdmin: any;
  userId: string | null | undefined;
  role: "owner" | "renter" | "admin";
  title: string;
  message: string;
  type: string;
  href: string;
  spaceId: string;
}) {
  if (!userId) return;

  // Canonical notifications schema (matches booking-event + verification-event):
  //   user_id, role, type, title, message, href, related_entity_type,
  //   related_entity_id, is_read.
  const payload = {
    user_id: userId,
    role,
    type,
    title,
    message,
    href,
    related_entity_type: "space",
    related_entity_id: spaceId,
    is_read: false,
  };

  const { error } = await (supabaseAdmin.from("notifications") as any).insert(payload);

  if (error) {
    console.error("Failed to create listing notification:", error);
    // Fallback: minimal payload, mirrors booking-event resilience pattern.
    await (supabaseAdmin.from("notifications") as any)
      .insert({ user_id: userId, role, type })
      .then(({ error: fallbackError }: { error: unknown }) => {
        if (fallbackError) {
          console.error("Listing notification fallback insert also failed:", fallbackError);
        }
      });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const spaceId = rawBody?.spaceId as string | undefined;
    const eventType = rawBody?.eventType as ListingEventType | undefined;
    const adminComment = rawBody?.adminComment as string | undefined;

    if (!spaceId || !eventType) {
      return NextResponse.json(
        { error: "Missing spaceId or eventType" },
        { status: 400 }
      );
    }

    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      ADMIN_NOTIFICATION_EMAIL,
    } = process.env;

    if (
      !NEXT_PUBLIC_SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json(
        { error: "Missing server config" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: space, error: spaceError } = await (supabaseAdmin
      .from("spaces") as any)
      .select("id, title, owner_id, status, listing_admin_comment")
      .eq("id", spaceId)
      .single();

    if (spaceError || !space) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const { data: owner } = await (supabaseAdmin.from("profiles") as any)
      .select("id, first_name, last_name, email")
      .eq("id", space.owner_id)
      .single();

    const ownerProfile = owner as BasicProfile | null;
    const spaceTitle = space.title || "Untitled listing";
    const appBaseUrl = getCanonicalPublicSiteUrl();
    const listingsUrl = `${appBaseUrl}/dashboard/listings?focus=${space.id}`;
    const publicListingUrl = `${appBaseUrl}/spaces/${space.id}`;
    const adminListingsUrl = `${appBaseUrl}/admin/listings`;
    const resolvedComment = (adminComment || space.listing_admin_comment || "").trim() || null;

    if (eventType === "listing_submitted") {
      // Admin email — admin copy isn't part of the user-facing copy module,
      // so we render inline through the shared layout for visual consistency.
      if (ADMIN_NOTIFICATION_EMAIL) {
        const renderedAdmin = renderEmailLayout({
          preheader: `${getDisplayName(ownerProfile || undefined)} submitted ${spaceTitle} for review.`,
          title: "New listing submitted for review",
          bodyLines: [
            "A new FindMySpace listing has been submitted and is waiting for admin review.",
            {
              html: `Host: ${
                emailStrong(getDisplayName(ownerProfile || undefined)).html
              }`,
            },
            {
              html: `Listing: ${emailStrong(spaceTitle).html}`,
            },
          ],
          primaryCTA: {
            label: "Review listing",
            href: adminListingsUrl,
          },
          footerRole: "admin",
        });
        await sendEmail({
          to: ADMIN_NOTIFICATION_EMAIL,
          subject: "New listing submitted - FindMySpace",
          html: renderedAdmin.html,
          text: renderedAdmin.text,
        });
      }

      // Owner-facing acknowledgement notification (no email sent to owner —
      // they already see "submitted for review" in the listing form UI).
      const ownerCopy = buildListingSubmittedCopy({
        ownerFirstName: ownerProfile?.first_name ?? null,
        spaceTitle,
      });
      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        role: "owner",
        title: ownerCopy.notificationTitle,
        message: ownerCopy.notificationMessage,
        type: "listing_submitted",
        href: "/dashboard/listings",
        spaceId: space.id,
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_pending") {
      const copy = buildListingPendingCopy({
        ownerFirstName: ownerProfile?.first_name ?? null,
        spaceTitle,
        adminComment: resolvedComment,
      });

      if (ownerProfile?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: { label: copy.ctaLabel, href: listingsUrl },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: ownerProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        role: "owner",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        type: "listing_pending",
        href: "/dashboard/listings",
        spaceId: space.id,
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_rejected") {
      const copy = buildListingRejectedCopy({
        ownerFirstName: ownerProfile?.first_name ?? null,
        spaceTitle,
        adminComment: resolvedComment,
      });

      if (ownerProfile?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: { label: copy.ctaLabel, href: listingsUrl },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: ownerProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        role: "owner",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        type: "listing_rejected",
        href: "/dashboard/listings",
        spaceId: space.id,
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_activated") {
      const copy = buildListingActivatedCopy({
        ownerFirstName: ownerProfile?.first_name ?? null,
        spaceTitle,
      });

      if (ownerProfile?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: { label: copy.ctaLabel, href: publicListingUrl },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: ownerProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        role: "owner",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        type: "listing_activated",
        href: `/spaces/${space.id}`,
        spaceId: space.id,
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "ownership_proof_verified") {
      const copy = buildOwnershipProofVerifiedCopy({
        ownerFirstName: ownerProfile?.first_name ?? null,
        spaceTitle,
      });

      if (ownerProfile?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: { label: copy.ctaLabel, href: listingsUrl },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: ownerProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        role: "owner",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        type: "ownership_proof_verified",
        href: "/dashboard/listings",
        spaceId: space.id,
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported eventType" }, { status: 400 });
  } catch (error) {
    console.error("Listing event notification error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
