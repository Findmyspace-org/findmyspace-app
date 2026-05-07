import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import {
  buildBookingDeclinedCopy,
  buildBookingExpiredOwnerCopy,
  buildBookingExpiredRenterCopy,
  buildBookingMessageCopy,
  buildBookingRequestCopy,
  buildPaymentConfirmedOwnerCopy,
  buildPaymentConfirmedRenterCopy,
  buildPaymentNeededCopy,
} from "@/lib/communication-copy";
import { formatBookingRangeForEmail } from "@/lib/bookingEmailHelpers";
import { isCommunicationAllowed } from "@/lib/booking-communication";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import { buildModalLoginUrl } from "@/lib/auth-redirect";
import { markNotificationsReadByBooking } from "@/lib/notification-lifecycle";

/**
 * Phase 2C complete:
 *
 * Every branch in this file now renders email through the shared
 * `EmailLayout` + `lib/communication-copy` constants. The legacy inline HTML
 * blocks and `paymentConfirmedTemplate` have been removed.
 *
 *   - booking_request_created          → buildBookingRequestCopy
 *   - booking_approved_payment_needed  → buildPaymentNeededCopy
 *   - booking_declined                 → buildBookingDeclinedCopy
 *   - payment_confirmed (renter)       → buildPaymentConfirmedRenterCopy
 *   - payment_confirmed (owner)        → buildPaymentConfirmedOwnerCopy
 *   - booking_expired (renter)         → buildBookingExpiredRenterCopy
 *   - booking_expired (owner)          → buildBookingExpiredOwnerCopy
 *   - booking_message                  → buildBookingMessageCopy
 */

const MESSAGING_FORBIDDEN_MSG =
  "Messaging is only available after payment confirmation.";

type NotificationInsertRow = {
  user_id: string;
  role: "renter" | "owner" | "admin";
  type: string;
  title?: string;
  message?: string;
  href?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  is_read?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const { bookingId, eventType, recipientId, senderId, message: bookingMessageText } = rawBody || {};

    if (!bookingId || !eventType) {
      return NextResponse.json(
        { error: "Missing bookingId or eventType" },
        { status: 400 }
      );
    }

    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL,
    } = process.env;

    if (
      !NEXT_PUBLIC_SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !NEXT_PUBLIC_SITE_URL?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Missing server config. Ensure NEXT_PUBLIC_SITE_URL is set for absolute links in emails.",
        },
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

    const appBaseUrl = getCanonicalPublicSiteUrl();

    const authNextUrl = (path: string) => buildModalLoginUrl(appBaseUrl, path);

    async function createNotification(row: NotificationInsertRow) {
      const fullPayload = {
        user_id: row.user_id,
        role: row.role,
        type: row.type,
        title: row.title,
        message: row.message,
        href: row.href,
        related_entity_type: row.related_entity_type,
        related_entity_id: row.related_entity_id,
        is_read: row.is_read ?? false,
      };

      const { error: fullInsertError } = await (supabaseAdmin
        .from("notifications") as any)
        .insert(fullPayload);

      if (!fullInsertError) {
        return;
      }

      console.error(
        "Full notification insert failed, retrying with minimal payload:",
        fullInsertError
      );

      const minimalPayload = {
        user_id: row.user_id,
        role: row.role,
        type: row.type,
      };

      const { error: minimalInsertError } = await (supabaseAdmin
        .from("notifications") as any)
        .insert(minimalPayload);

      if (minimalInsertError) {
        console.error("Minimal notification insert failed:", minimalInsertError);
      }
    }

    const { data: booking, error: bookingError } = await (supabaseAdmin
      .from("bookings") as any)
      .select(
        "id, booking_unit, start_at, end_at, renter_id, owner_id, total_price, space_id, notes, owner_response_message, payment_status, status"
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("Booking event booking lookup failed:", {
        bookingId,
        bookingError,
      });

      return NextResponse.json(
        {
          error: "Booking lookup failed",
          bookingId,
          details: bookingError?.message || null,
        },
        { status: 404 }
      );
    }

    const { data: space } = await supabaseAdmin
      .from("spaces")
      .select("id, title")
      .eq("id", booking.space_id)
      .single();

    const { data: renter } = await (supabaseAdmin.from("profiles") as any)
      .select("id, first_name, last_name, email")
      .eq("id", booking.renter_id)
      .single();

    const { data: owner } = await (supabaseAdmin.from("profiles") as any)
      .select("id, first_name, last_name, email")
      .eq("id", booking.owner_id)
      .single();

    const { data: admins } = await (supabaseAdmin.from("profiles") as any)
      .select("id")
      .eq("role", "admin");

    const periodLabel = formatBookingRangeForEmail(booking);

    if (eventType === "booking_request_created") {
      const copy = buildBookingRequestCopy({
        ownerFirstName: owner?.first_name ?? null,
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "your space",
        bookingType: booking.booking_unit,
        periodLabel,
        renterMessage: booking.notes || null,
      });

      if (owner?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: authNextUrl("/dashboard/requests"),
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: owner.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (owner?.id) {
        await createNotification({
          user_id: owner.id,
          role: "owner",
          type: "booking_request",
          title: copy.notificationTitle,
          message: copy.notificationMessage,
          href: "/dashboard/requests",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "booking_approved_payment_needed") {
      await markNotificationsReadByBooking(supabaseAdmin, {
        bookingId,
        types: ["booking_request"],
        userIds: booking.owner_id ? [booking.owner_id] : undefined,
      });

      const copy = buildPaymentNeededCopy({
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "the space",
        periodLabel,
        totalPrice: booking.total_price ?? null,
        ownerMessage: booking.owner_response_message || null,
      });

      if (renter?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: authNextUrl("/dashboard/my-bookings"),
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: renter.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "payment_needed",
          title: copy.notificationTitle,
          message: copy.notificationMessage,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "booking_declined") {
      await markNotificationsReadByBooking(supabaseAdmin, {
        bookingId,
        types: ["booking_request", "payment_needed"],
      });

      const copy = buildBookingDeclinedCopy({
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "this space",
        periodLabel,
        ownerMessage: booking.owner_response_message || null,
      });

      if (renter?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: authNextUrl("/dashboard/my-bookings"),
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: renter.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_declined",
          title: copy.notificationTitle,
          message: copy.notificationMessage,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "payment_confirmed") {
      await markNotificationsReadByBooking(supabaseAdmin, {
        bookingId,
        types: ["payment_needed", "booking_request"],
      });

      const renterCopy = buildPaymentConfirmedRenterCopy({
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "the space",
        periodLabel,
        totalPrice: booking.total_price ?? null,
        ownerMessage: null,
      });
      const ownerCopy = buildPaymentConfirmedOwnerCopy({
        ownerFirstName: owner?.first_name ?? null,
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "your space",
        periodLabel,
        totalPrice: booking.total_price ?? null,
      });

      if (renter?.email) {
        const rendered = renderEmailLayout({
          preheader: renterCopy.emailPreheader,
          title: renterCopy.emailTitle,
          bodyLines: renterCopy.emailBodyLines,
          primaryCTA: {
            label: renterCopy.ctaLabel,
            href: authNextUrl("/dashboard/my-bookings"),
          },
          footerRole: renterCopy.emailFooterRole,
        });
        await sendEmail({
          to: renter.email,
          subject: renterCopy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (owner?.email) {
        const rendered = renderEmailLayout({
          preheader: ownerCopy.emailPreheader,
          title: ownerCopy.emailTitle,
          bodyLines: ownerCopy.emailBodyLines,
          primaryCTA: {
            label: ownerCopy.ctaLabel,
            href: authNextUrl("/dashboard/requests"),
          },
          footerRole: ownerCopy.emailFooterRole,
        });
        await sendEmail({
          to: owner.email,
          subject: ownerCopy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_confirmed",
          title: renterCopy.notificationTitle,
          message: renterCopy.notificationMessage,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      if (owner?.id) {
        await createNotification({
          user_id: owner.id,
          role: "owner",
          type: "booking_paid",
          title: ownerCopy.notificationTitle,
          message: ownerCopy.notificationMessage,
          href: "/dashboard/requests",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      for (const admin of ((admins || []) as { id: string }[])) {
        if (!admin?.id) continue;

        await createNotification({
          user_id: admin.id,
          role: "admin",
          type: "payment_received",
          title: "Payment received for booking",
          message: `${space?.title || "A booking"} has been paid and confirmed`,
          href: "/admin/bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "booking_expired") {
      await markNotificationsReadByBooking(supabaseAdmin, {
        bookingId,
        types: ["payment_needed", "booking_request"],
      });

      const renterCopy = buildBookingExpiredRenterCopy({
        renterFirstName: renter?.first_name ?? null,
        spaceTitle: space?.title || "this space",
        periodLabel,
      });
      const ownerCopy = buildBookingExpiredOwnerCopy({
        ownerFirstName: owner?.first_name ?? null,
        spaceTitle: space?.title || "your space",
        periodLabel,
      });

      if (renter?.email) {
        const rendered = renderEmailLayout({
          preheader: renterCopy.emailPreheader,
          title: renterCopy.emailTitle,
          bodyLines: renterCopy.emailBodyLines,
          primaryCTA: {
            label: renterCopy.ctaLabel,
            href: authNextUrl("/dashboard/my-bookings"),
          },
          footerRole: renterCopy.emailFooterRole,
        });
        await sendEmail({
          to: renter.email,
          subject: renterCopy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (owner?.email) {
        const rendered = renderEmailLayout({
          preheader: ownerCopy.emailPreheader,
          title: ownerCopy.emailTitle,
          bodyLines: ownerCopy.emailBodyLines,
          primaryCTA: {
            label: ownerCopy.ctaLabel,
            href: authNextUrl("/dashboard/requests"),
          },
          footerRole: ownerCopy.emailFooterRole,
        });
        await sendEmail({
          to: owner.email,
          subject: ownerCopy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_expired",
          title: renterCopy.notificationTitle,
          message: renterCopy.notificationMessage,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      if (owner?.id) {
        await createNotification({
          user_id: owner.id,
          role: "owner",
          type: "booking_expired",
          title: ownerCopy.notificationTitle,
          message: ownerCopy.notificationMessage,
          href: "/dashboard/requests",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (eventType === "booking_message") {
      if (
        !isCommunicationAllowed({
          status: booking.status,
          payment_status: booking.payment_status,
        })
      ) {
        return NextResponse.json(
          { error: MESSAGING_FORBIDDEN_MSG },
          { status: 403 }
        );
      }

      const rawRecipientId = recipientId;
      const rawSenderId = senderId;
      const rawMessage = bookingMessageText;

      const resolvedRecipientId = rawRecipientId || null;
      // `senderId` is still accepted in the request payload for backwards
      // compatibility but is no longer needed: the new shared copy describes
      // the sender by role ("from the host" / "from the renter") rather than
      // by name.
      void rawSenderId;
      const messagePreview = String(rawMessage || "").trim();

      let recipientProfile = null as any;

      if (resolvedRecipientId) {
        const { data } = await (supabaseAdmin.from("profiles") as any)
          .select("id, first_name, last_name, email")
          .eq("id", resolvedRecipientId)
          .single();
        recipientProfile = data;
      }

      const actionUrl = `/dashboard/messages/${booking.id}`;
      const resolvedSpaceTitle = space?.title || "your booking";
      const recipientRole: "renter" | "host" =
        resolvedRecipientId === booking.owner_id ? "host" : "renter";

      const copy = buildBookingMessageCopy({
        recipientRole,
        recipientFirstName: recipientProfile?.first_name ?? null,
        spaceTitle: resolvedSpaceTitle,
        messagePreview,
      });

      if (recipientProfile?.id) {
        await createNotification({
          user_id: recipientProfile.id,
          role: recipientProfile.id === booking.owner_id ? "owner" : "renter",
          type: "booking_message",
          title: copy.notificationTitle,
          message: copy.notificationMessage,
          href: actionUrl,
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      if (recipientProfile?.email) {
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: `${appBaseUrl}${actionUrl}`,
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: recipientProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Booking event notification error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}