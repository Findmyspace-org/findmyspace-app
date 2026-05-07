import { Resend } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.error("Missing email config: RESEND_API_KEY is not set");
    return null;
  }

  return new Resend(apiKey);
}

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Optional plain-text body. If omitted, derived from `html` automatically. */
  text?: string;
};

/**
 * Strip HTML tags and collapse whitespace into a readable plain-text fallback.
 * Used when callers don't supply their own `text` body.
 */
function htmlToPlainText(html: string): string {
  return String(html || "")
    // Replace <br> and block-closing tags with newlines for legibility.
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    // Strip remaining tags.
    .replace(/<[^>]+>/g, " ")
    // Decode the most common HTML entities so URLs and ampersands read sensibly.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Collapse whitespace.
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const from = process.env.EMAIL_FROM;
  const resend = getResendClient();

  if (!resend || !from) {
    console.error("Missing email config", {
      hasApiKey: !!process.env.RESEND_API_KEY,
      from,
    });
    return { ok: false };
  }

  // Always send a plain-text alternative for deliverability + accessibility.
  const plainText = (text && text.trim()) || htmlToPlainText(html);

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text: plainText,
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

/**
 * Note: every named template export that previously lived here
 * (`bookingRequestOwnerTemplate`, `bookingApprovedRenterTemplate`,
 * `listingQuestionOwnerTemplate`, `listingQuestionAnsweredRenterTemplate`,
 * `paymentConfirmedTemplate`) was removed in Phase 2C followup. Every
 * outbound transactional email now goes through `renderEmailLayout` from
 * `lib/email-templates/EmailLayout.ts` with copy from
 * `lib/communication-copy.ts`.
 *
 * `sendEmail` and `htmlToPlainText` above stay here as the transport layer
 * and last-resort fallback.
 */