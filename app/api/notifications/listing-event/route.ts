import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
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

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCommentBlock(comment?: string | null) {
  const trimmed = (comment || "").trim();

  if (!trimmed) return "";

  return `
    <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
      <p style="margin: 0 0 8px 0;"><strong>Admin note:</strong></p>
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(trimmed)}</p>
    </div>
  `;
}

function baseTemplate({
  heading,
  greeting,
  intro,
  detailsHtml,
  primaryLabel,
  primaryUrl,
  footer = "FindMySpace",
  comment,
}: {
  heading: string;
  greeting: string;
  intro: string;
  detailsHtml: string;
  primaryLabel?: string;
  primaryUrl?: string;
  footer?: string;
  comment?: string | null;
}) {
  return `
    <div style="font-family: Arial, sans-serif; color: #192a3a; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">${heading}</h2>
      <p>${greeting}</p>
      <p>${intro}</p>

      <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
        ${detailsHtml}
      </div>

      ${renderCommentBlock(comment)}

      ${
        primaryLabel && primaryUrl
          ? `
        <p>
          <a
            href="${primaryUrl}"
            style="display: inline-block; background: #192a3a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px;"
          >
            ${primaryLabel}
          </a>
        </p>
      `
          : ""
      }

      <p style="margin-top: 24px;">${footer}</p>
    </div>
  `;
}

function listingSubmittedAdminTemplate({
  adminName,
  hostName,
  spaceTitle,
  listingUrl,
}: {
  adminName: string;
  hostName: string;
  spaceTitle: string;
  listingUrl: string;
}) {
  return baseTemplate({
    heading: "New listing submitted for review",
    greeting: `Hello ${adminName},`,
    intro: "A new FindMySpace listing has been submitted and is waiting for admin review.",
    detailsHtml: `
      <p style="margin: 0 0 8px 0;"><strong>Host:</strong> ${escapeHtml(hostName)}</p>
      <p style="margin: 0;"><strong>Listing:</strong> ${escapeHtml(spaceTitle)}</p>
    `,
    primaryLabel: "Review listing",
    primaryUrl: listingUrl,
  });
}

function listingPendingOwnerTemplate({
  ownerName,
  spaceTitle,
  listingsUrl,
  comment,
}: {
  ownerName: string;
  spaceTitle: string;
  listingsUrl: string;
  comment?: string | null;
}) {
  return baseTemplate({
    heading: "Your listing needs attention",
    greeting: `Hello ${ownerName},`,
    intro:
      "Your FindMySpace listing is still pending. Please review the admin note below and update your listing or documents if needed.",
    detailsHtml: `<p style="margin: 0;"><strong>Listing:</strong> ${escapeHtml(spaceTitle)}</p>`,
    primaryLabel: "View my listings",
    primaryUrl: listingsUrl,
    comment,
  });
}

function listingRejectedOwnerTemplate({
  ownerName,
  spaceTitle,
  listingsUrl,
  comment,
}: {
  ownerName: string;
  spaceTitle: string;
  listingsUrl: string;
  comment?: string | null;
}) {
  return baseTemplate({
    heading: "Your listing was not approved",
    greeting: `Hello ${ownerName},`,
    intro:
      "Your FindMySpace listing has been marked as rejected. Please review the admin note below for the reason and any next steps.",
    detailsHtml: `<p style="margin: 0;"><strong>Listing:</strong> ${escapeHtml(spaceTitle)}</p>`,
    primaryLabel: "View my listings",
    primaryUrl: listingsUrl,
    comment,
  });
}

function listingActivatedOwnerTemplate({
  ownerName,
  spaceTitle,
  listingUrl,
}: {
  ownerName: string;
  spaceTitle: string;
  listingUrl: string;
}) {
  return baseTemplate({
    heading: "Your listing is now live",
    greeting: `Hello ${ownerName},`,
    intro:
      "Good news. Your FindMySpace listing has been approved and is now live on the platform.",
    detailsHtml: `<p style="margin: 0;"><strong>Listing:</strong> ${escapeHtml(spaceTitle)}</p>`,
    primaryLabel: "View listing",
    primaryUrl: listingUrl,
  });
}

function ownershipProofVerifiedOwnerTemplate({
  ownerName,
  spaceTitle,
  listingsUrl,
}: {
  ownerName: string;
  spaceTitle: string;
  listingsUrl: string;
}) {
  return baseTemplate({
    heading: "Ownership proof verified",
    greeting: `Hello ${ownerName},`,
    intro:
      "The ownership proof for your FindMySpace listing has been verified. If all remaining checks are approved, your listing will go live automatically.",
    detailsHtml: `<p style="margin: 0;"><strong>Listing:</strong> ${escapeHtml(spaceTitle)}</p>`,
    primaryLabel: "View my listings",
    primaryUrl: listingsUrl,
  });
}

async function createInAppNotification({
  supabaseAdmin,
  userId,
  title,
  message,
  type,
  actionUrl,
}: {
  supabaseAdmin: any;
  userId: string | null | undefined;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
}) {
  if (!userId) return;

  const payload = {
    user_id: userId,
    title,
    message,
    type,
    action_url: actionUrl || null,
    read: false,
  };

  const { error } = await (supabaseAdmin.from("notifications") as any).insert(payload);

  if (error) {
    console.error("Failed to create listing notification:", error);
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

    const ownerName = getDisplayName(owner);
    const spaceTitle = space.title || "Untitled listing";
    const appBaseUrl = getCanonicalPublicSiteUrl();
    const listingsUrl = `${appBaseUrl}/dashboard/listings`;
    const publicListingUrl = `${appBaseUrl}/spaces/${space.id}`;
    const adminListingsUrl = `${appBaseUrl}/admin/listings`;
    const resolvedComment = (adminComment || space.listing_admin_comment || "").trim() || null;

    if (eventType === "listing_submitted") {
      if (ADMIN_NOTIFICATION_EMAIL) {
        await sendEmail({
          to: ADMIN_NOTIFICATION_EMAIL,
          subject: "New listing submitted - FindMySpace",
          html: listingSubmittedAdminTemplate({
            adminName: "Admin",
            hostName: ownerName,
            spaceTitle,
            listingUrl: adminListingsUrl,
          }),
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        title: "Listing submitted",
        message: `${spaceTitle} has been submitted for admin review.`,
        type: "listing_submitted",
        actionUrl: "/dashboard/listings",
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_pending") {
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Your listing needs attention - FindMySpace",
          html: listingPendingOwnerTemplate({
            ownerName,
            spaceTitle,
            listingsUrl,
            comment: resolvedComment,
          }),
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        title: "Listing still pending",
        message: resolvedComment
          ? `${spaceTitle} is still pending. Admin note: ${resolvedComment}`
          : `${spaceTitle} is still pending and needs your attention.`,
        type: "listing_pending",
        actionUrl: "/dashboard/listings",
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_rejected") {
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Your listing was not approved - FindMySpace",
          html: listingRejectedOwnerTemplate({
            ownerName,
            spaceTitle,
            listingsUrl,
            comment: resolvedComment,
          }),
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        title: "Listing rejected",
        message: resolvedComment
          ? `${spaceTitle} was rejected. Admin note: ${resolvedComment}`
          : `${spaceTitle} was rejected.`,
        type: "listing_rejected",
        actionUrl: "/dashboard/listings",
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "listing_activated") {
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Your listing is now live - FindMySpace",
          html: listingActivatedOwnerTemplate({
            ownerName,
            spaceTitle,
            listingUrl: publicListingUrl,
          }),
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        title: "Listing live",
        message: `${spaceTitle} is now live on FindMySpace.`,
        type: "listing_activated",
        actionUrl: `/spaces/${space.id}`,
      });

      return NextResponse.json({ ok: true });
    }

    if (eventType === "ownership_proof_verified") {
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Ownership proof verified - FindMySpace",
          html: ownershipProofVerifiedOwnerTemplate({
            ownerName,
            spaceTitle,
            listingsUrl,
          }),
        });
      }

      await createInAppNotification({
        supabaseAdmin,
        userId: space.owner_id,
        title: "Ownership proof verified",
        message: `${spaceTitle} ownership proof has been verified.`,
        type: "ownership_proof_verified",
        actionUrl: "/dashboard/listings",
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported eventType" }, { status: 400 });
  } catch (error) {
    console.error("Listing event notification error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}