/**
 * Contact and operational-info gating for the Space Assistant.
 * Upload/indexing stores full content — restrictions apply at response time only.
 */

export const ASSISTANT_PHONE_BLOCKED_REPLY =
  "Please use the FindMySpace enquiry process to communicate with the space owner.";

export const ASSISTANT_EMAIL_BLOCKED_REPLY =
  "Contact details become available after a confirmed booking.";

export const ASSISTANT_OPERATIONAL_BLOCKED_REPLY =
  "Access details and operational information become available after a confirmed booking is paid.";

export const ASSISTANT_GENERAL_CONTACT_BLOCKED_REPLY =
  "Contact details and exact access information are shared only after a booking is approved and payment is completed.";

export type ContactRequestKind =
  | "phone"
  | "email"
  | "whatsapp"
  | "website"
  | "social"
  | "access"
  | "general";

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const EMAIL_RE = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RE = /(?:\+?\d[\s().-]*){7,}\d/;

export function classifyContactRequest(question: string): ContactRequestKind | null {
  const lower = question.toLowerCase();

  if (
    /\b(gate code|access code|entry code|pin code|security code|door code|alarm code|wifi password|wi-fi password|network password|ssid password)\b/.test(
      lower
    )
  ) {
    return "access";
  }

  if (/\b(whats ?app|whatsapp)\b/.test(lower)) return "whatsapp";

  if (
    /\b(phone|cell|cellphone|mobile|telephone|call (the )?owner|owner'?s number)\b/.test(
      lower
    )
  ) {
    return "phone";
  }

  if (/\b(email|e-?mail|inbox)\b/.test(lower)) return "email";

  if (
    /\b(website|web site|url|facebook|instagram|linkedin|twitter|tiktok|social media|@\w{2,})\b/.test(
      lower
    )
  ) {
    return lower.includes("email") ? "email" : "website";
  }

  if (URL_RE.test(question)) return "website";
  if (EMAIL_RE.test(question)) return "email";
  if (PHONE_RE.test(question)) return "phone";

  if (/\b(number|contact details?|contact info|reach (the )?host|owner contact)\b/.test(lower)) {
    return "general";
  }

  if (
    /\b(off[ -]?platform|outside( the)? (app|platform|site)|direct(ly)?|in person|meet up|meet in person)\b/.test(
      lower
    )
  ) {
    return "general";
  }

  if (
    /\b(home address|exact address|street address|full address|directions|where exactly|gps|coordinates)\b/.test(
      lower
    )
  ) {
    return "general";
  }

  return null;
}

export function contactRequestBlockedReply(kind: ContactRequestKind): string {
  switch (kind) {
    case "phone":
    case "whatsapp":
      return ASSISTANT_PHONE_BLOCKED_REPLY;
    case "email":
      return ASSISTANT_EMAIL_BLOCKED_REPLY;
    case "website":
    case "social":
      return ASSISTANT_EMAIL_BLOCKED_REPLY;
    case "access":
      return ASSISTANT_OPERATIONAL_BLOCKED_REPLY;
    case "general":
    default:
      return ASSISTANT_GENERAL_CONTACT_BLOCKED_REPLY;
  }
}

/** @deprecated Use classifyContactRequest — kept for compatibility. */
export function detectContactRequest(question: string): boolean {
  return classifyContactRequest(question) !== null;
}

const RESTRICTED_INLINE_PATTERNS: RegExp[] = [
  URL_RE,
  EMAIL_RE,
  PHONE_RE,
  /\b(?:gate|access|entry|door|alarm|security)\s*(?:code|pin)\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi,
  /\bwifi(?:\s+password)?\s*[:#]?\s*\S{4,}\b/gi,
];

/** Redact restricted inline content from assistant output (pre-confirmation only). */
export function redactRestrictedAssistantContent(text: string): string {
  let out = text;
  for (const pattern of RESTRICTED_INLINE_PATTERNS) {
    out = out.replace(pattern, "[available after confirmed booking]");
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsRestrictedInlineContent(text: string): boolean {
  return RESTRICTED_INLINE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function sanitizeAssistantAnswerForAccess(
  answer: string,
  canRevealRestricted: boolean
): string {
  if (canRevealRestricted) return answer;
  if (!containsRestrictedInlineContent(answer)) return answer;
  return redactRestrictedAssistantContent(answer);
}
