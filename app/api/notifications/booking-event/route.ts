import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  bookingApprovedRenterTemplate,
  bookingRequestOwnerTemplate,
  paymentConfirmedTemplate,
  sendEmail,
} from "@/lib/email";
import {
  formatBookingRangeForEmail,
  getDisplayName,
} from "@/lib/bookingEmailHelpers";
import { isCommunicationAllowed } from "@/lib/booking-communication";

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

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

    const requestOrigin = (() => {
      try {
        return new URL(req.url).origin;
      } catch {
        return null;
      }
    })();

    const appBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin || "";

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
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "New booking request - FindMySpace",
          html: bookingRequestOwnerTemplate({
            ownerName: getDisplayName(owner),
            renterName: getDisplayName(renter),
            spaceTitle: space?.title,
            bookingType: booking.booking_unit,
            periodLabel,
            dashboardUrl: `${appBaseUrl}/dashboard/requests`,
            renterMessage: booking.notes || null,
          }),
        });
      }

      if (owner?.id) {
        await createNotification({
          user_id: owner.id,
          role: "owner",
          type: "booking_request",
          title: "New booking request",
          message: `${getDisplayName(renter)} requested ${space?.title || "your space"}`,
          href: "/dashboard/requests",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "booking_approved_payment_needed") {
      if (renter?.email) {
        await sendEmail({
          to: renter.email,
          subject: "Your booking was approved - payment needed",
          html: bookingApprovedRenterTemplate({
            renterName: getDisplayName(renter),
            spaceTitle: space?.title,
            periodLabel,
            totalPrice: booking.total_price,
            payUrl: `${appBaseUrl}/dashboard/my-bookings`,
            ownerMessage: booking.owner_response_message || null,
          }),
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "payment_needed",
          title: "Payment needed for your booking",
          message: `${space?.title || "Your booking"} was approved and is awaiting payment`,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "booking_declined") {
      if (renter?.email) {
        await sendEmail({
          to: renter.email,
          subject: "Your booking request was declined",
          html: `
            <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
              <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Booking request declined</h1>
                <p style="margin:0 0 14px;font-size:15px;">Hello ${getDisplayName(renter)},</p>
                <p style="margin:0 0 14px;font-size:15px;">Your booking request for <strong>${space?.title || "this space"}</strong> was declined.</p>
                <p style="margin:0 0 14px;font-size:15px;"><strong>Requested period:</strong> ${periodLabel}</p>
                ${booking.owner_response_message ? `
                <div style="margin:0 0 24px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                  <p style="margin:0 0 8px;font-size:13px;color:#192a3a;font-weight:600;">Message from owner</p>
                  <p style="margin:0;font-size:15px;color:#192a3a;white-space:pre-wrap;">${booking.owner_response_message}</p>
                </div>
                ` : ""}
                <p style="margin:0 0 28px;">
                  <a href="${appBaseUrl}/dashboard/my-bookings" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                    View my bookings
                  </a>
                </p>
                <p style="margin:0;font-size:13px;color:#64748b;">FindMySpace</p>
              </div>
            </div>
          `,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_declined",
          title: "Booking request declined",
          message: `${space?.title || "Your booking request"} was declined by the owner`,
          href: "/dashboard/my-bookings",
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }
    }

    if (eventType === "payment_confirmed") {
      if (renter?.email) {
        await sendEmail({
          to: renter.email,
          subject: "Your booking is confirmed",
          html: paymentConfirmedTemplate({
            name: getDisplayName(renter),
            spaceTitle: space?.title,
            periodLabel,
            totalPrice: booking.total_price,
            bookingsUrl: `${appBaseUrl}/dashboard/my-bookings`,
            ownerMessage: null,
          }),
        });
      }

      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Payment received - booking confirmed",
          html: paymentConfirmedTemplate({
            name: getDisplayName(owner),
            spaceTitle: space?.title,
            periodLabel,
            totalPrice: booking.total_price,
            bookingsUrl: `${appBaseUrl}/dashboard/requests`,
            ownerMessage: null,
          }),
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_confirmed",
          title: "Booking confirmed",
          message: `${space?.title || "Your booking"} is confirmed and paid`,
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
          title: "Payment received - booking confirmed",
          message: `${getDisplayName(renter)} paid for ${space?.title || "your space"}. The booking is now confirmed.`,
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
      if (renter?.email) {
        await sendEmail({
          to: renter.email,
          subject: "Booking expired - payment not received",
          html: `
            <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
              <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Booking expired</h1>
                <p style="margin:0 0 14px;font-size:15px;">Hello ${getDisplayName(renter)},</p>
                <p style="margin:0 0 14px;font-size:15px;">Your booking for <strong>${space?.title || "this space"}</strong> expired because payment was not completed within 24 hours.</p>
                <p style="margin:0 0 14px;font-size:15px;"><strong>Requested period:</strong> ${periodLabel}</p>
                <p style="margin:0 0 28px;font-size:15px;">Thank you for your interest. You can submit a new request if you would still like to book this space.</p>
                <p style="margin:0 0 28px;">
                  <a href="${appBaseUrl}/dashboard/my-bookings" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                    View my bookings
                  </a>
                </p>
                <p style="margin:0;font-size:13px;color:#64748b;">FindMySpace</p>
              </div>
            </div>
          `,
        });
      }

      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: "Booking request expired - FindMySpace",
          html: `
            <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
              <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Booking expired</h1>
                <p style="margin:0 0 14px;font-size:15px;">Hello ${getDisplayName(owner)},</p>
                <p style="margin:0 0 14px;font-size:15px;">A booking request for <strong>${space?.title || "your space"}</strong> expired because the renter did not complete payment within 24 hours. The dates are available again.</p>
                <p style="margin:0 0 14px;font-size:15px;"><strong>Requested period:</strong> ${periodLabel}</p>
                <p style="margin:0 0 28px;">
                  <a href="${appBaseUrl}/dashboard/requests" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                    Open requests
                  </a>
                </p>
                <p style="margin:0;font-size:13px;color:#64748b;">FindMySpace</p>
              </div>
            </div>
          `,
        });
      }

      if (renter?.id) {
        await createNotification({
          user_id: renter.id,
          role: "renter",
          type: "booking_expired",
          title: "Booking expired",
          message: `${space?.title || "Your booking"} expired — payment was not received in time`,
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
          title: "Booking request expired",
          message: `A request for ${space?.title || "your space"} expired without payment; dates are open again`,
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
      const resolvedSenderId = rawSenderId || null;
      const messagePreview = String(rawMessage || "").trim();

      let recipientProfile = null as any;
      let senderProfile = null as any;
      let actionUrl = "/dashboard";

      if (resolvedRecipientId) {
        const { data } = await (supabaseAdmin.from("profiles") as any)
          .select("id, first_name, last_name, email")
          .eq("id", resolvedRecipientId)
          .single();
        recipientProfile = data;
      }

      if (resolvedSenderId) {
        const { data } = await (supabaseAdmin.from("profiles") as any)
          .select("id, first_name, last_name, email")
          .eq("id", resolvedSenderId)
          .single();
        senderProfile = data;
      }

      if (resolvedRecipientId === booking.owner_id) {
        actionUrl = "/dashboard/requests";
      } else if (resolvedRecipientId === booking.renter_id) {
        actionUrl = "/dashboard/my-bookings";
      }

      const senderName = getDisplayName(senderProfile);
      const resolvedSpaceTitle = space?.title || "your booking";
      const notificationTitle = `New message about ${resolvedSpaceTitle}`;
      const notificationMessage = messagePreview
        ? `${senderName}: ${messagePreview.length > 120 ? `${messagePreview.slice(0, 117)}...` : messagePreview}`
        : `${senderName} sent you a new message about ${resolvedSpaceTitle}.`;

      if (recipientProfile?.id) {
        await createNotification({
          user_id: recipientProfile.id,
          role: recipientProfile.id === booking.owner_id ? "owner" : "renter",
          type: "booking_message",
          title: notificationTitle,
          message: notificationMessage,
          href: actionUrl,
          related_entity_type: "booking",
          related_entity_id: booking.id,
        });
      }

      if (recipientProfile?.email) {
        await sendEmail({
          to: recipientProfile.email,
          subject:
            resolvedRecipientId === booking.owner_id
              ? "New message from renter - FindMySpace"
              : "New message from owner - FindMySpace",
          html: `
            <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
              <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">New booking message</h1>
                <p style="margin:0 0 14px;font-size:15px;">Hello ${getDisplayName(recipientProfile)},</p>
                <p style="margin:0 0 20px;font-size:15px;">${senderName} sent you a new message about <strong>${resolvedSpaceTitle}</strong>.</p>
                ${messagePreview ? `
                <div style="margin:0 0 24px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                  <p style="margin:0 0 8px;font-size:13px;color:#192a3a;font-weight:600;">Message</p>
                  <p style="margin:0;font-size:15px;color:#192a3a;white-space:pre-wrap;">${messagePreview}</p>
                </div>
                ` : ""}
                <p style="margin:0 0 28px;">
                  <a href="${appBaseUrl}${actionUrl}" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
                    Open booking messages
                  </a>
                </p>
                <p style="margin:0;font-size:13px;color:#64748b;">FindMySpace</p>
              </div>
            </div>
          `,
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