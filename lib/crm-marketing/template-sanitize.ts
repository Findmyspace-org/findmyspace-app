const FORBIDDEN_TAG = /<\s*\/?\s*(script|iframe|object|embed|form|input|link|meta|base)\b[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL = /\s+(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi;

export const REQUIRED_UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";

export function sanitiseMarketingHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = html.replace(FORBIDDEN_TAG, "");
  out = out.replace(EVENT_ATTR, "");
  out = out.replace(JS_URL, "");
  return out.trim();
}

export function assertTemplateHasUnsubscribePlaceholder(
  html: string | null | undefined,
  plainText: string | null | undefined,
  footerJson: Record<string, unknown> | null | undefined
): void {
  const require =
    footerJson?.requireUnsubscribe !== false && footerJson?.requireUnsubscribe !== "false";
  if (!require) return;
  const combined = `${html || ""}\n${plainText || ""}`;
  if (!combined.includes(REQUIRED_UNSUBSCRIBE_PLACEHOLDER)) {
    throw new Error(
      `Templates must include the ${REQUIRED_UNSUBSCRIBE_PLACEHOLDER} placeholder.`
    );
  }
}

export function rejectUnsafeTemplateHtml(html: string | null | undefined): void {
  const value = html || "";
  if (FORBIDDEN_TAG.test(value)) {
    throw new Error("Unsafe HTML tags are not allowed in templates.");
  }
  if (EVENT_ATTR.test(value)) {
    throw new Error("Inline event handlers are not allowed in templates.");
  }
  if (JS_URL.test(value)) {
    throw new Error("javascript: URLs are not allowed in templates.");
  }
}
