/**
 * Safe HTML sanitisation for CRM email body display.
 * Blocks scripts, forms, iframes, event handlers, javascript: URLs.
 * External images are rewritten to about:blank by default (blocked).
 */

const FORBIDDEN_TAG =
  /<\s*\/?\s*(script|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base|frame|frameset|applet|style)\b[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL = /\s+(href|src|xlink:href|action|formaction)\s*=\s*("|')\s*javascript:[^"']*\2/gi;
const DATA_URL = /\s+src\s*=\s*("|')\s*data:(?!image\/(png|jpe?g|gif|webp))[^"']*\1/gi;
const REMOTE_IMG_SRC =
  /\s+src\s*=\s*("|')\s*(https?:)?\/\/[^"']*\1/gi;
const IMG_SRCSET = /\s+srcset\s*=\s*("[^"]*"|'[^']*')/gi;

export type SanitizeEmailHtmlOptions = {
  /** When true (default), remote http(s) image URLs are stripped. */
  blockExternalImages?: boolean;
};

export function sanitizeCrmEmailHtml(
  html: string | null | undefined,
  options: SanitizeEmailHtmlOptions = {}
): string {
  if (!html?.trim()) return "";
  const blockImages = options.blockExternalImages !== false;

  let out = html;
  out = out.replace(FORBIDDEN_TAG, "");
  out = out.replace(EVENT_ATTR, "");
  out = out.replace(JS_URL, ' $1=""');
  out = out.replace(DATA_URL, ' src=""');
  if (blockImages) {
    out = out.replace(REMOTE_IMG_SRC, ' src="" data-blocked-remote-image="1"');
    out = out.replace(IMG_SRCSET, "");
  }
  // Collapse leftover empty script-like content between removed tags
  out = out.replace(/<\/?(script|iframe)[^>]*>/gi, "");
  return out.trim();
}

export function hasUnsafeEmailHtml(html: string | null | undefined): boolean {
  if (!html) return false;
  // Rebuild regexes without global sticky state for .test()
  return (
    /<\s*\/?\s*(script|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base|frame|frameset|applet|style)\b/i.test(
      html
    ) ||
    /\s+on[a-z]+\s*=/i.test(html) ||
    /\s+(href|src|xlink:href|action|formaction)\s*=\s*("|')\s*javascript:/i.test(
      html
    )
  );
}

export function crmEmailBodyKind(
  bodyHtml: string | null | undefined,
  bodyText: string | null | undefined
): "html" | "text" | "empty" {
  if (bodyHtml?.trim()) return "html";
  if (bodyText?.trim()) return "text";
  return "empty";
}

export const CRM_EMAIL_MISSING_BODY_MESSAGE =
  "No message content was captured for this email.";
