import {
  ASSISTANT_GENERAL_CONTACT_BLOCKED_REPLY,
  classifyContactRequest,
  contactRequestBlockedReply,
} from "@/lib/space-assistant-contact-gating";

/**
 * Safety filters for renter-authored yes/no questions.
 *
 * Blocks the same off-platform contact patterns as the Space Assistant API.
 * Returns a tuple [ok, reason]: when not ok, `reason` is the user-facing copy
 * to surface verbatim.
 */

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RE = /(?:\+?\d[\s().-]*){7,}\d/;

export type ListingQuestionSafetyResult =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluateListingQuestionSafety(
  question: string
): ListingQuestionSafetyResult {
  const kind = classifyContactRequest(question);
  if (kind) {
    return { ok: false, reason: contactRequestBlockedReply(kind) };
  }

  if (URL_RE.test(question)) {
    return { ok: false, reason: ASSISTANT_GENERAL_CONTACT_BLOCKED_REPLY };
  }
  if (EMAIL_RE.test(question)) {
    return { ok: false, reason: contactRequestBlockedReply("email") };
  }
  if (PHONE_RE.test(question)) {
    return { ok: false, reason: contactRequestBlockedReply("phone") };
  }

  return { ok: true };
}

export const LISTING_QUESTION_BLOCKED_REPLY = ASSISTANT_GENERAL_CONTACT_BLOCKED_REPLY;
export const LISTING_QUESTION_MAX_LENGTH = 280;
