import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const from = process.env.EMAIL_FROM;

  if (!process.env.RESEND_API_KEY || !from) {
    console.error("Missing email config", {
      hasApiKey: !!process.env.RESEND_API_KEY,
      from,
    });
    return { ok: false };
  }

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    console.log("Email sent:", {
      to,
      subject,
      result,
    });

    return { ok: true, result };
  } catch (error) {
    console.error("Email send failed:", {
      to,
      subject,
      error,
    });

    return { ok: false, error };
  }
}

export function bookingRequestOwnerTemplate(input: {
  ownerName?: string | null;
  renterName?: string | null;
  spaceTitle?: string | null;
  bookingType?: string | null;
  periodLabel?: string;
  dashboardUrl: string;
  renterMessage?: string | null;
}) {
  return `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
          <div style="font-size:28px;font-weight:700;color:#192a3a;">FindMySpace</div>
          <div style="margin-top:6px;font-size:13px;color:#6b7280;">New booking request</div>
        </div>

        <div style="padding:32px 28px;">
          <h1 style="margin:0 0 20px;font-size:36px;line-height:1.15;color:#192a3a;">
            New booking request
          </h1>

          <p style="margin:0 0 18px;font-size:16px;">
            Hello ${input.ownerName || "there"},
          </p>

          <p style="margin:0 0 24px;font-size:16px;">
            You have received a new booking request for
            <strong>${input.spaceTitle || "your space"}</strong>.
          </p>

          <div style="margin:0 0 28px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
            <p style="margin:0 0 10px;font-size:15px;">
              <strong>Requester:</strong> ${input.renterName || "A renter"}
            </p>
            <p style="margin:0 0 10px;font-size:15px;">
              <strong>Booking type:</strong> ${input.bookingType || "day"}
            </p>
            <p style="margin:0;font-size:15px;">
              <strong>Requested period:</strong> ${input.periodLabel || "-"}
            </p>
          </div>

          ${input.renterMessage ? `
          <div style="margin:0 0 28px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
            <p style="margin:0 0 8px;font-size:13px;color:#192a3a;font-weight:600;">
              Note from renter
            </p>
            <p style="margin:0;font-size:15px;color:#192a3a;white-space:pre-wrap;">
              ${input.renterMessage}
            </p>
          </div>
          ` : ""}

          <p style="margin:0 0 28px;">
            <a href="${input.dashboardUrl}" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
              Review booking request
            </a>
          </p>

          <p style="margin:0;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:18px;">
            FindMySpace - Rent spaces easily and securely
          </p>
        </div>
      </div>
    </div>
  `;
}

export function bookingApprovedRenterTemplate(input: {
  renterName?: string | null;
  spaceTitle?: string | null;
  periodLabel?: string;
  totalPrice?: number | null;
  payUrl: string;
  ownerMessage?: string | null;
}) {
  return `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
          <div style="font-size:28px;font-weight:700;color:#192a3a;">FindMySpace</div>
          <div style="margin-top:6px;font-size:13px;color:#6b7280;">Booking approved</div>
        </div>

        <div style="padding:32px 28px;">
          <h1 style="margin:0 0 20px;font-size:36px;line-height:1.15;color:#192a3a;">
            Your booking was approved
          </h1>

          <p style="margin:0 0 18px;font-size:16px;">
            Hello ${input.renterName || "there"},
          </p>

          <p style="margin:0 0 24px;font-size:16px;">
            Your booking for <strong>${input.spaceTitle || "the space"}</strong> has been approved.
          </p>

          <div style="margin:0 0 28px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
            <p style="margin:0 0 10px;font-size:15px;">
              <strong>Period:</strong> ${input.periodLabel || "-"}
            </p>
            <p style="margin:0;font-size:15px;">
              <strong>Amount due:</strong> R${Number(input.totalPrice || 0).toFixed(2)}
            </p>
          </div>
          ${input.ownerMessage ? `
          <div style="margin:0 0 28px;padding:18px 20px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;">
            <p style="margin:0 0 8px;font-size:13px;color:#3730a3;font-weight:600;">
              Message from host
            </p>
            <p style="margin:0;font-size:15px;color:#192a3a;">
              ${input.ownerMessage}
            </p>
          </div>
          ` : ""}
          <p style="margin:0 0 28px;">
            <a href="${input.payUrl}" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
              Pay now
            </a>
          </p>

          <p style="margin:0;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:18px;">
            FindMySpace - Rent spaces easily and securely
          </p>
        </div>
      </div>
    </div>
  `;
}

export function paymentConfirmedTemplate(input: {
  name?: string | null;
  spaceTitle?: string | null;
  periodLabel?: string;
  totalPrice?: number | null;
  bookingsUrl: string;
  ownerMessage?: string | null;
}) {
  return `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#192a3a;line-height:1.5;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;background:#ffffff;">
          <div style="font-size:28px;font-weight:700;color:#192a3a;">FindMySpace</div>
          <div style="margin-top:6px;font-size:13px;color:#6b7280;">Booking confirmed</div>
        </div>

        <div style="padding:32px 28px;">
          <h1 style="margin:0 0 20px;font-size:36px;line-height:1.15;color:#192a3a;">
            Payment made and the booking is now confirmed.
          </h1>

          <p style="margin:0 0 18px;font-size:16px;">
            Hello ${input.name || "there"},
          </p>

          <p style="margin:0 0 24px;font-size:16px;">
            The booking for <strong>${input.spaceTitle || "the space"}</strong> has been confirmed.
          </p>

          <div style="margin:0 0 28px;padding:18px 20px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
            <p style="margin:0 0 10px;font-size:15px;">
              <strong>Period:</strong> ${input.periodLabel || "-"}
            </p>
            <p style="margin:0;font-size:15px;">
              <strong>Amount paid:</strong> R${Number(input.totalPrice || 0).toFixed(2)}
            </p>
          </div>
          ${input.ownerMessage ? `
          <div style="margin:0 0 28px;padding:18px 20px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;">
            <p style="margin:0 0 8px;font-size:13px;color:#3730a3;font-weight:600;">
              Message from host
            </p>
            <p style="margin:0;font-size:15px;color:#192a3a;">
              ${input.ownerMessage}
            </p>
          </div>
          ` : ""}
          <p style="margin:0 0 28px;">
            <a href="${input.bookingsUrl}" style="display:inline-block;padding:14px 20px;background:#192a3a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
              View bookings
            </a>
          </p>

          <p style="margin:0;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:18px;">
            FindMySpace - Rent spaces easily and securely
          </p>
        </div>
      </div>
    </div>
  `;
}