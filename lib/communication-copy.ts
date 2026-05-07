/**
 * Centralised copy for FindMySpace user-facing communications.
 *
 * Each event group exposes the same shape so that:
 *   - the in-app notification bell
 *   - the `/dashboard/notifications` archive
 *   - the outgoing email
 * all speak with the same voice, and changing wording is a one-file edit.
 *
 * Event groups currently covered:
 *   - listing_question
 *   - listing_question_answered
 *   - identity_verified / identity_rejected
 *   - bank_verified / bank_rejected
 *   - booking_request
 *   - payment_needed
 *   - booking_message
 *   - booking_declined
 *   - payment_confirmed (renter + owner sides)
 *   - booking_expired (renter + owner sides)
 *   - listing_submitted (owner-facing acknowledgement)
 *   - listing_pending
 *   - listing_rejected
 *   - listing_activated
 *   - ownership_proof_verified
 *
 * The notification copy returned here is intended to be stored in
 * `notifications.title` / `notifications.message`. The email copy is intended
 * to be passed straight into `renderEmailLayout` from
 * `lib/email-templates/EmailLayout.ts`.
 */

import {
  emailCallout,
  emailStrong,
  type EmailFooterRole,
  type RenderEmailLayoutInput,
} from "@/lib/email-templates/EmailLayout";

function truncate(value: string, max: number): string {
  const v = String(value || "").trim();
  if (v.length <= max) return v;
  return v.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function safeName(name?: string | null, fallback = "there"): string {
  const v = String(name || "").trim();
  return v.length > 0 ? v : fallback;
}

export type CommunicationCopy = {
  /** Title for the in-app `notifications.title` row. */
  notificationTitle: string;
  /** Body for the in-app `notifications.message` row. */
  notificationMessage: string;
  /** Subject line for the outgoing email. */
  emailSubject: string;
  /** ~80-char inbox preview line, hidden inside the email body. */
  emailPreheader: string;
  /** H1 for the email card. */
  emailTitle: string;
  /** `bodyLines` argument for `renderEmailLayout`. */
  emailBodyLines: RenderEmailLayoutInput["bodyLines"];
  /** Default CTA button label. */
  ctaLabel: string;
  /** Suggested footer role for the layout. */
  emailFooterRole: EmailFooterRole;
};

// -----------------------------------------------------------------------------
// listing_question — host receives a yes/no question from a renter.
// -----------------------------------------------------------------------------

export type ListingQuestionInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
  question: string;
  /** Optional renter first name used in the in-app message preview. */
  renterFirstName?: string | null;
};

export function buildListingQuestionCopy(
  input: ListingQuestionInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "your listing";
  const renter = safeName(input.renterFirstName, "A renter");
  const preview = truncate(input.question, 140);

  return {
    notificationTitle: "New listing question",
    notificationMessage: `${renter} asked a yes/no question about ${space}: "${preview}"`,
    emailSubject: "New listing question - FindMySpace",
    emailPreheader: `${renter} asked a yes/no question about ${space}.`,
    emailTitle: "New listing question",
    emailBodyLines: [
      `Hi ${ownerName},`,
      {
        html: `A renter asked a yes/no question about ${
          emailStrong(space).html
        }. You can reply with Yes, No, or Not applicable — no contact details are shared.`,
      },
      emailCallout({ label: "Question", body: input.question, tone: "neutral" }),
    ],
    ctaLabel: "Answer question",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// listing_question (batched) — host receives several yes/no questions from a
// renter in a single submit. Drives ONE notification + ONE email.
// -----------------------------------------------------------------------------

export type ListingQuestionsBatchInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
  questions: string[];
  /** Optional renter first name used in the in-app message preview. */
  renterFirstName?: string | null;
};

export function buildListingQuestionsBatchCopy(
  input: ListingQuestionsBatchInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "your listing";
  const renter = safeName(input.renterFirstName, "A renter");
  const cleaned = (input.questions || [])
    .map((q) => String(q || "").trim())
    .filter(Boolean);
  const count = cleaned.length;

  // Ordered list of questions, escaped via emailCallout's html-friendly chunks
  // so renderEmailLayout produces a clean, scannable block.
  const questionList = {
    html:
      `<ol style="margin:0 0 16px 24px;padding:0;color:#0f172a;font-size:15px;line-height:1.6;">` +
      cleaned
        .map(
          (q) =>
            `<li style="margin:0 0 8px 0;">${escapeHtml(q)}</li>`
        )
        .join("") +
      `</ol>`,
  };

  return {
    notificationTitle: count <= 1 ? "New listing question" : "New listing questions",
    notificationMessage:
      count <= 1
        ? `${renter} asked a yes/no question about ${space}.`
        : `${renter} asked ${count} yes/no questions about ${space}.`,
    emailSubject:
      count <= 1
        ? "New listing question - FindMySpace"
        : "New listing questions - FindMySpace",
    emailPreheader:
      count <= 1
        ? `${renter} asked a yes/no question about ${space}.`
        : `${renter} asked ${count} yes/no questions about ${space}.`,
    emailTitle: count <= 1 ? "New listing question" : "New listing questions",
    emailBodyLines: [
      `Hi ${ownerName},`,
      {
        html: `A renter asked a few yes/no questions about ${
          emailStrong(space).html
        }. You can answer each one with Yes, No, or Not applicable — no contact details are shared.`,
      },
      questionList,
    ],
    ctaLabel: "Answer questions",
    emailFooterRole: "host",
  };
}

// Tiny HTML escape — kept local so this file has no outside dependencies.
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// -----------------------------------------------------------------------------
// listing_question_answered — renter receives a host's yes/no answer.
// -----------------------------------------------------------------------------

export type ListingQuestionAnsweredInput = {
  renterFirstName?: string | null;
  spaceTitle: string;
  question: string;
  answerLabel: string; // "Yes" | "No" | "Not applicable"
};

export function buildListingQuestionAnsweredCopy(
  input: ListingQuestionAnsweredInput
): CommunicationCopy {
  const renterName = safeName(input.renterFirstName);
  const space = input.spaceTitle || "the listing";

  return {
    notificationTitle: "Your listing question was answered",
    notificationMessage: `Host answered "${input.answerLabel}" on ${space}.`,
    emailSubject: "Your listing question was answered - FindMySpace",
    emailPreheader: `The host replied "${input.answerLabel}" to your question about ${space}.`,
    emailTitle: "Your listing question was answered",
    emailBodyLines: [
      `Hi ${renterName},`,
      {
        html: `The host replied to your question about ${
          emailStrong(space).html
        }.`,
      },
      emailCallout({ label: "Your question", body: input.question, tone: "neutral" }),
      emailCallout({
        label: "Host answer",
        body: input.answerLabel,
        tone: "success",
      }),
    ],
    ctaLabel: "View answer",
    emailFooterRole: "renter",
  };
}

// -----------------------------------------------------------------------------
// identity_verified / identity_rejected — host receives admin's identity decision.
// bank_verified / bank_rejected     — host receives admin's bank decision.
// -----------------------------------------------------------------------------

export type VerificationDecisionInput = {
  hostFirstName?: string | null;
  /** Optional admin note to surface to the host. */
  adminComment?: string | null;
};

function buildVerificationDecisionCopy(
  decisionType: "identity" | "bank",
  outcome: "verified" | "rejected",
  input: VerificationDecisionInput
): CommunicationCopy {
  const hostName = safeName(input.hostFirstName);
  const subject =
    decisionType === "identity"
      ? outcome === "verified"
        ? "Identity verified"
        : "Identity verification needs attention"
      : outcome === "verified"
      ? "Bank account verified"
      : "Bank verification needs attention";

  const intro =
    outcome === "verified"
      ? decisionType === "identity"
        ? "Your identity has been verified. Thank you — your hosting account is one step closer to fully active."
        : "Your bank account has been verified. Payouts can now be processed once your bookings are paid."
      : decisionType === "identity"
      ? "We weren’t able to verify your identity yet. Please review the documents you submitted and try again."
      : "We weren’t able to verify your bank details yet. Please review what you submitted and try again.";

  const note = (input.adminComment || "").trim();
  const calloutTone: "success" | "warning" =
    outcome === "verified" ? "success" : "warning";

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${hostName},`,
    intro,
  ];
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({
        label: outcome === "rejected" ? "Reviewer note" : "Note from FindMySpace",
        body: note,
        tone: calloutTone,
      })
    );
  }
  bodyLines.push(
    "You can review the full status from your host settings."
  );

  return {
    notificationTitle: subject,
    notificationMessage:
      outcome === "verified"
        ? `${decisionType === "identity" ? "Identity" : "Bank account"} verified.`
        : note.length > 0
        ? `${decisionType === "identity" ? "Identity" : "Bank"} verification needs attention. ${truncate(note, 120)}`
        : `${decisionType === "identity" ? "Identity" : "Bank"} verification needs attention. Please review and resubmit.`,
    emailSubject: `${subject} - FindMySpace`,
    emailPreheader:
      outcome === "verified"
        ? "Your verification has been approved."
        : "Your verification needs another look — full details inside.",
    emailTitle: subject,
    emailBodyLines: bodyLines,
    ctaLabel: outcome === "verified" ? "Open host settings" : "Review and update",
    emailFooterRole: "host",
  };
}

export function buildIdentityVerifiedCopy(input: VerificationDecisionInput) {
  return buildVerificationDecisionCopy("identity", "verified", input);
}
export function buildIdentityRejectedCopy(input: VerificationDecisionInput) {
  return buildVerificationDecisionCopy("identity", "rejected", input);
}
export function buildBankVerifiedCopy(input: VerificationDecisionInput) {
  return buildVerificationDecisionCopy("bank", "verified", input);
}
export function buildBankRejectedCopy(input: VerificationDecisionInput) {
  return buildVerificationDecisionCopy("bank", "rejected", input);
}

// -----------------------------------------------------------------------------
// booking_request — host receives a new booking request from a renter.
// -----------------------------------------------------------------------------

export type BookingRequestInput = {
  ownerFirstName?: string | null;
  renterFirstName?: string | null;
  spaceTitle: string;
  bookingType?: string | null;
  periodLabel?: string | null;
  renterMessage?: string | null;
};

export function buildBookingRequestCopy(
  input: BookingRequestInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const renter = safeName(input.renterFirstName, "A renter");
  const space = input.spaceTitle || "your space";
  const period = (input.periodLabel || "").trim();
  const note = (input.renterMessage || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${ownerName},`,
    {
      html: `${renter} just sent a booking request for ${
        emailStrong(space).html
      }${period ? ` for ${emailStrong(period).html}` : ""}.`,
    },
  ];
  if (input.bookingType || period) {
    const summary = [
      input.bookingType ? `Booking type: ${input.bookingType}` : "",
      period ? `Period: ${period}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (summary.length > 0) {
      bodyLines.push(
        emailCallout({ label: "Request summary", body: summary, tone: "neutral" })
      );
    }
  }
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({ label: "Note from renter", body: note, tone: "neutral" })
    );
  }
  bodyLines.push(
    "Open your booking requests to approve, decline, or message the renter."
  );

  return {
    notificationTitle: "New booking request",
    notificationMessage: `${renter} requested ${space}${period ? ` (${period})` : ""}.`,
    emailSubject: "New booking request - FindMySpace",
    emailPreheader: `${renter} requested ${space}${period ? ` for ${period}` : ""}.`,
    emailTitle: "New booking request",
    emailBodyLines: bodyLines,
    ctaLabel: "Review booking request",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// payment_needed — renter receives "approved, please pay".
// -----------------------------------------------------------------------------

export type PaymentNeededInput = {
  renterFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
  totalPrice?: number | null;
  ownerMessage?: string | null;
};

export function buildPaymentNeededCopy(
  input: PaymentNeededInput
): CommunicationCopy {
  const renterName = safeName(input.renterFirstName);
  const space = input.spaceTitle || "the space";
  const period = (input.periodLabel || "").trim();
  const note = (input.ownerMessage || "").trim();
  const amount = Number.isFinite(Number(input.totalPrice))
    ? `R${Number(input.totalPrice).toFixed(2)}`
    : null;

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${renterName},`,
    {
      html: `Your booking for ${emailStrong(space).html} has been approved. Complete payment to lock it in.`,
    },
  ];
  const summaryLines = [
    period ? `Period: ${period}` : "",
    amount ? `Amount due: ${amount}` : "",
  ].filter(Boolean);
  if (summaryLines.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Booking summary",
        body: summaryLines.join("\n"),
        tone: "neutral",
      })
    );
  }
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({ label: "Message from host", body: note, tone: "neutral" })
    );
  }
  bodyLines.push(
    "If payment isn’t received within the booking window the request expires automatically."
  );

  return {
    notificationTitle: "Booking approved — payment needed",
    notificationMessage: `Pay${amount ? ` ${amount}` : ""} to confirm ${space}${period ? ` (${period})` : ""}.`,
    emailSubject: "Your booking was approved - payment needed",
    emailPreheader: `Pay${amount ? ` ${amount}` : ""} to confirm your booking for ${space}.`,
    emailTitle: "Your booking was approved",
    emailBodyLines: bodyLines,
    ctaLabel: "Pay now",
    emailFooterRole: "renter",
  };
}

// -----------------------------------------------------------------------------
// booking_message — renter or host receives a new chat message.
// -----------------------------------------------------------------------------

export type BookingMessageInput = {
  /** "renter" if the recipient is a renter, "host" if the recipient is a host. */
  recipientRole: "renter" | "host";
  recipientFirstName?: string | null;
  spaceTitle: string;
  /** Optional preview of the message body. Truncated for safety. */
  messagePreview?: string | null;
};

export function buildBookingMessageCopy(
  input: BookingMessageInput
): CommunicationCopy {
  const senderRoleLabel = input.recipientRole === "renter" ? "host" : "renter";
  const name = safeName(input.recipientFirstName);
  const space = input.spaceTitle || "your booking";
  const preview = truncate(input.messagePreview || "", 200);

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${name},`,
    {
      html: `You have a new message from the ${senderRoleLabel} about ${
        emailStrong(space).html
      }.`,
    },
  ];
  if (preview.length > 0) {
    bodyLines.push(
      emailCallout({
        label: `Message from the ${senderRoleLabel}`,
        body: preview,
        tone: "neutral",
      })
    );
  }
  bodyLines.push("Open the booking thread to read it in full and reply.");

  return {
    notificationTitle: "New booking message",
    notificationMessage: preview.length > 0
      ? `New message from the ${senderRoleLabel}: "${preview}"`
      : `New message from the ${senderRoleLabel} about ${space}.`,
    emailSubject:
      input.recipientRole === "host"
        ? "New message from renter - FindMySpace"
        : "New message from host - FindMySpace",
    emailPreheader: preview.length > 0
      ? preview
      : `Open the booking thread for ${space}.`,
    emailTitle: "New booking message",
    emailBodyLines: bodyLines,
    ctaLabel: "Open messages",
    emailFooterRole: input.recipientRole === "host" ? "host" : "renter",
  };
}

// -----------------------------------------------------------------------------
// booking_declined — renter receives "host declined the request".
// -----------------------------------------------------------------------------

export type BookingDeclinedInput = {
  renterFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
  ownerMessage?: string | null;
};

export function buildBookingDeclinedCopy(
  input: BookingDeclinedInput
): CommunicationCopy {
  const renterName = safeName(input.renterFirstName);
  const space = input.spaceTitle || "this space";
  const period = (input.periodLabel || "").trim();
  const note = (input.ownerMessage || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${renterName},`,
    {
      html: `Your booking request for ${
        emailStrong(space).html
      } was declined by the host.`,
    },
  ];
  if (period.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Requested period",
        body: period,
        tone: "neutral",
      })
    );
  }
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Message from host",
        body: note,
        tone: "neutral",
      })
    );
  }
  bodyLines.push(
    "You can browse other spaces or send a new request from your dashboard."
  );

  return {
    notificationTitle: "Booking request declined",
    notificationMessage: `${space}${period ? ` (${period})` : ""} was declined by the host.`,
    emailSubject: "Booking request declined - FindMySpace",
    emailPreheader: `Your request for ${space} was declined.`,
    emailTitle: "Booking request declined",
    emailBodyLines: bodyLines,
    ctaLabel: "View my bookings",
    emailFooterRole: "renter",
  };
}

// -----------------------------------------------------------------------------
// payment_confirmed — renter receives "your booking is confirmed".
// -----------------------------------------------------------------------------

export type PaymentConfirmedRenterInput = {
  renterFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
  totalPrice?: number | null;
  ownerMessage?: string | null;
};

export function buildPaymentConfirmedRenterCopy(
  input: PaymentConfirmedRenterInput
): CommunicationCopy {
  const renterName = safeName(input.renterFirstName);
  const space = input.spaceTitle || "the space";
  const period = (input.periodLabel || "").trim();
  const note = (input.ownerMessage || "").trim();
  const amount = Number.isFinite(Number(input.totalPrice))
    ? `R${Number(input.totalPrice).toFixed(2)}`
    : null;

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${renterName},`,
    {
      html: `Payment received — your booking for ${
        emailStrong(space).html
      } is now confirmed.`,
    },
  ];
  const summary = [
    period ? `Period: ${period}` : "",
    amount ? `Amount paid: ${amount}` : "",
  ].filter(Boolean);
  if (summary.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Booking summary",
        body: summary.join("\n"),
        tone: "success",
      })
    );
  }
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({ label: "Message from host", body: note, tone: "neutral" })
    );
  }
  bodyLines.push(
    "Your invoice is available from your bookings dashboard at any time."
  );

  return {
    notificationTitle: "Booking confirmed",
    notificationMessage: `${space}${period ? ` (${period})` : ""} is confirmed and paid.`,
    emailSubject: "Your booking is confirmed - FindMySpace",
    emailPreheader: `Your booking for ${space} is confirmed.`,
    emailTitle: "Your booking is confirmed",
    emailBodyLines: bodyLines,
    ctaLabel: "View my bookings",
    emailFooterRole: "renter",
  };
}

// -----------------------------------------------------------------------------
// payment_confirmed — host receives "payment received, booking confirmed".
// -----------------------------------------------------------------------------

export type PaymentConfirmedOwnerInput = {
  ownerFirstName?: string | null;
  renterFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
  totalPrice?: number | null;
};

export function buildPaymentConfirmedOwnerCopy(
  input: PaymentConfirmedOwnerInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const renter = safeName(input.renterFirstName, "The renter");
  const space = input.spaceTitle || "your space";
  const period = (input.periodLabel || "").trim();
  const amount = Number.isFinite(Number(input.totalPrice))
    ? `R${Number(input.totalPrice).toFixed(2)}`
    : null;

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${ownerName},`,
    {
      html: `${renter} paid for ${
        emailStrong(space).html
      } — the booking is now confirmed.`,
    },
  ];
  const summary = [
    period ? `Period: ${period}` : "",
    amount ? `Amount received: ${amount}` : "",
  ].filter(Boolean);
  if (summary.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Booking summary",
        body: summary.join("\n"),
        tone: "success",
      })
    );
  }
  bodyLines.push(
    "Open your booking requests to review the dates and message the renter if needed."
  );

  return {
    notificationTitle: "Payment received - booking confirmed",
    notificationMessage: `${renter} paid for ${space}${period ? ` (${period})` : ""}.`,
    emailSubject: "Payment received - booking confirmed - FindMySpace",
    emailPreheader: `${renter} paid for ${space}.`,
    emailTitle: "Payment received — booking confirmed",
    emailBodyLines: bodyLines,
    ctaLabel: "Open booking requests",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// booking_expired — renter receives "your booking expired".
// -----------------------------------------------------------------------------

export type BookingExpiredRenterInput = {
  renterFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
};

export function buildBookingExpiredRenterCopy(
  input: BookingExpiredRenterInput
): CommunicationCopy {
  const renterName = safeName(input.renterFirstName);
  const space = input.spaceTitle || "this space";
  const period = (input.periodLabel || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${renterName},`,
    {
      html: `Your booking for ${
        emailStrong(space).html
      } expired because payment wasn’t completed in time.`,
    },
  ];
  if (period.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Requested period",
        body: period,
        tone: "neutral",
      })
    );
  }
  bodyLines.push(
    "You can submit a new request if you still want to book — the dates are open again."
  );

  return {
    notificationTitle: "Booking expired",
    notificationMessage: `${space}${period ? ` (${period})` : ""} expired — payment wasn’t received in time.`,
    emailSubject: "Booking expired - payment not received - FindMySpace",
    emailPreheader: `Your booking for ${space} expired.`,
    emailTitle: "Booking expired",
    emailBodyLines: bodyLines,
    ctaLabel: "View my bookings",
    emailFooterRole: "renter",
  };
}

// -----------------------------------------------------------------------------
// booking_expired — host receives "renter didn't pay, dates open again".
// -----------------------------------------------------------------------------

export type BookingExpiredOwnerInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
  periodLabel?: string | null;
};

export function buildBookingExpiredOwnerCopy(
  input: BookingExpiredOwnerInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "your space";
  const period = (input.periodLabel || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${ownerName},`,
    {
      html: `A booking request for ${
        emailStrong(space).html
      } expired because the renter didn’t complete payment in time. The dates are open again.`,
    },
  ];
  if (period.length > 0) {
    bodyLines.push(
      emailCallout({
        label: "Requested period",
        body: period,
        tone: "neutral",
      })
    );
  }
  bodyLines.push(
    "No action is needed unless you want to follow up with the renter directly."
  );

  return {
    notificationTitle: "Booking request expired",
    notificationMessage: `A request for ${space}${period ? ` (${period})` : ""} expired without payment; dates are open again.`,
    emailSubject: "Booking request expired - FindMySpace",
    emailPreheader: `A request for ${space} expired and the dates are open again.`,
    emailTitle: "Booking request expired",
    emailBodyLines: bodyLines,
    ctaLabel: "Open booking requests",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// listing_submitted — host receives "your listing has been submitted".
// (The admin email for the same event is rendered inline through the layout
//  in the route — admin copy isn't part of the user-facing copy module.)
// -----------------------------------------------------------------------------

export type ListingSubmittedInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
};

export function buildListingSubmittedCopy(
  input: ListingSubmittedInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "Your listing";

  return {
    notificationTitle: "Listing submitted",
    notificationMessage: `${space} has been submitted for admin review.`,
    emailSubject: "Listing submitted for review - FindMySpace",
    emailPreheader: `${space} is queued for admin review.`,
    emailTitle: "Your listing was submitted",
    emailBodyLines: [
      `Hi ${ownerName},`,
      {
        html: `${
          emailStrong(space).html
        } has been submitted to the FindMySpace admin team for review.`,
      },
      "We’ll let you know as soon as a decision has been made. You can keep editing the listing while it’s pending.",
    ],
    ctaLabel: "View my listings",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// listing_pending — host receives "still pending, please review note".
// -----------------------------------------------------------------------------

export type ListingPendingInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
  adminComment?: string | null;
};

export function buildListingPendingCopy(
  input: ListingPendingInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "Your listing";
  const note = (input.adminComment || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${ownerName},`,
    {
      html: `${
        emailStrong(space).html
      } is still pending. Please review the note below and update the listing or documents if needed.`,
    },
  ];
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({ label: "Admin note", body: note, tone: "warning" })
    );
  }

  return {
    notificationTitle: "Listing still pending",
    notificationMessage: note.length > 0
      ? `${space} is still pending. Admin note: ${truncate(note, 120)}`
      : `${space} is still pending and needs your attention.`,
    emailSubject: "Your listing needs attention - FindMySpace",
    emailPreheader: `${space} is still pending — admin note inside.`,
    emailTitle: "Your listing needs attention",
    emailBodyLines: bodyLines,
    ctaLabel: "View my listings",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// listing_rejected — host receives "your listing wasn't approved".
// -----------------------------------------------------------------------------

export type ListingRejectedInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
  adminComment?: string | null;
};

export function buildListingRejectedCopy(
  input: ListingRejectedInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "Your listing";
  const note = (input.adminComment || "").trim();

  const bodyLines: RenderEmailLayoutInput["bodyLines"] = [
    `Hi ${ownerName},`,
    {
      html: `${
        emailStrong(space).html
      } wasn’t approved. The reason and any next steps are below.`,
    },
  ];
  if (note.length > 0) {
    bodyLines.push(
      emailCallout({ label: "Admin note", body: note, tone: "warning" })
    );
  } else {
    bodyLines.push(
      "Open the listing in your dashboard to review and resubmit when you’re ready."
    );
  }

  return {
    notificationTitle: "Listing rejected",
    notificationMessage: note.length > 0
      ? `${space} was rejected. Admin note: ${truncate(note, 120)}`
      : `${space} was rejected. Open it to resubmit.`,
    emailSubject: "Your listing was not approved - FindMySpace",
    emailPreheader: `${space} wasn’t approved — review the admin note.`,
    emailTitle: "Your listing was not approved",
    emailBodyLines: bodyLines,
    ctaLabel: "View my listings",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// listing_activated — host receives "your listing is now live".
// -----------------------------------------------------------------------------

export type ListingActivatedInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
};

export function buildListingActivatedCopy(
  input: ListingActivatedInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "Your listing";

  return {
    notificationTitle: "Listing live",
    notificationMessage: `${space} is now live on FindMySpace.`,
    emailSubject: "Your listing is live - FindMySpace",
    emailPreheader: `${space} is now live and ready for bookings.`,
    emailTitle: "Your listing is live",
    emailBodyLines: [
      `Hi ${ownerName},`,
      {
        html: `Good news — ${
          emailStrong(space).html
        } has been approved and is now live on FindMySpace.`,
      },
      "Renters can browse and book it right away. You can view it from your dashboard or share the listing link directly.",
    ],
    ctaLabel: "View listing",
    emailFooterRole: "host",
  };
}

// -----------------------------------------------------------------------------
// ownership_proof_verified — host receives "ownership proof accepted".
// -----------------------------------------------------------------------------

export type OwnershipProofVerifiedInput = {
  ownerFirstName?: string | null;
  spaceTitle: string;
};

export function buildOwnershipProofVerifiedCopy(
  input: OwnershipProofVerifiedInput
): CommunicationCopy {
  const ownerName = safeName(input.ownerFirstName);
  const space = input.spaceTitle || "Your listing";

  return {
    notificationTitle: "Ownership proof verified",
    notificationMessage: `${space} ownership proof has been verified.`,
    emailSubject: "Ownership proof verified - FindMySpace",
    emailPreheader: `${space} ownership proof has been accepted.`,
    emailTitle: "Ownership proof verified",
    emailBodyLines: [
      `Hi ${ownerName},`,
      {
        html: `The ownership proof for ${
          emailStrong(space).html
        } has been verified.`,
      },
      "If all remaining checks are approved, your listing will go live automatically. You can keep an eye on the status from your dashboard.",
    ],
    ctaLabel: "View my listings",
    emailFooterRole: "host",
  };
}
