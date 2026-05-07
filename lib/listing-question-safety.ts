/**
 * Safety filters for renter-authored yes/no questions.
 *
 * Blocks the same off-platform contact patterns as the Space Assistant API,
 * plus phone numbers, emails, and URLs which renters might paste here.
 *
 * Returns a tuple [ok, reason]: when not ok, `reason` is the user-facing copy
 * to surface verbatim.
 */

const BLOCKED_REPLY =
  "Contact details and exact access information are shared only after a booking is approved and payment is completed.";

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
// 7+ digits in a row (allowing common separators) catches most phone numbers
// without too many false positives.
const PHONE_RE =
  /(?:\+?\d[\s().-]*){7,}\d/;

export type ListingQuestionSafetyResult =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluateListingQuestionSafety(
  question: string
): ListingQuestionSafetyResult {
  const lower = question.toLowerCase();

  if (URL_RE.test(question)) return { ok: false, reason: BLOCKED_REPLY };
  if (EMAIL_RE.test(question)) return { ok: false, reason: BLOCKED_REPLY };
  if (PHONE_RE.test(question)) return { ok: false, reason: BLOCKED_REPLY };

  if (
    /\b(phone|cell|cellphone|mobile|whats ?app|whatsapp|email|e-?mail|telegram|signal|imessage|sms|text message)\b/.test(
      lower
    )
  )
    return { ok: false, reason: BLOCKED_REPLY };

  if (/\b(number|contact details?|contact info|reach (the )?host)\b/.test(lower))
    return { ok: false, reason: BLOCKED_REPLY };

  if (
    /\b(off[ -]?platform|outside( the)? (app|platform|site)|direct(ly)?|in person|meet up|meet in person)\b/.test(
      lower
    )
  )
    return { ok: false, reason: BLOCKED_REPLY };

  if (
    /\b(home address|exact address|street address|full address|directions|where exactly|gps|coordinates)\b/.test(
      lower
    )
  )
    return { ok: false, reason: BLOCKED_REPLY };

  return { ok: true };
}

export const LISTING_QUESTION_BLOCKED_REPLY = BLOCKED_REPLY;
export const LISTING_QUESTION_MAX_LENGTH = 280;
