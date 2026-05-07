/**
 * Shared FindMySpace email layout.
 *
 * Every outbound transactional email should be rendered through
 * `renderEmailLayout` so we get one consistent visual language, predictable
 * preheaders for inbox previews, and a sensible plain-text fallback.
 *
 * Brand:
 * - Background:  #f5f7fb (subtle light gray)
 * - Card:        #ffffff with #e5e7eb border, 16px radius
 * - Body text:   #192a3a (navy)
 * - Muted text:  #6b7280 / #64748b
 * - Primary CTA: #c1121f (FindMySpace red), white label
 * - Secondary:   plain navy text link
 *
 * The layout is intentionally pure: no env reads, no I/O. Callers compose the
 * subject/preheader/body lines (typically from `lib/communication-copy.ts`)
 * and pass them in.
 */

export type EmailFooterRole = "renter" | "host" | "admin" | "general";

export type EmailCTA = {
  label: string;
  href: string;
};

export type RenderEmailLayoutInput = {
  /**
   * Short text shown by inbox clients as a preview after the subject. Aim
   * for ~80 characters max. Will be hidden inside the email body.
   */
  preheader: string;
  /** H1 shown at the top of the email card. */
  title: string;
  /**
   * Each entry becomes a paragraph. Strings are rendered as text (HTML-escaped).
   * To embed safe HTML (e.g. a `<strong>`), wrap with `{ html: "..." }`.
   */
  bodyLines: Array<string | { html: string }>;
  primaryCTA?: EmailCTA;
  secondaryCTA?: EmailCTA;
  footerRole: EmailFooterRole;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

const COLOR = {
  bg: "#f5f7fb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#192a3a",
  muted: "#6b7280",
  subtle: "#94a3b8",
  primary: "#c1121f",
  primaryDark: "#9a0f19",
} as const;

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function bodyToHtml(line: string | { html: string }): string {
  if (typeof line === "string") {
    return escapeHtml(line).replace(/\n/g, "<br/>");
  }
  return line.html;
}

function bodyToText(line: string | { html: string }): string {
  if (typeof line === "string") return line;
  return String(line.html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function footerLineFor(role: EmailFooterRole): string {
  switch (role) {
    case "renter":
      return "You’re receiving this because you have an active booking conversation on FindMySpace.";
    case "host":
      return "You’re receiving this because you host a space on FindMySpace.";
    case "admin":
      return "Sent to the FindMySpace admin team for review.";
    case "general":
    default:
      return "You’re receiving this because you have a FindMySpace account.";
  }
}

/**
 * Render a transactional FindMySpace email and matching plain-text alternative.
 */
export function renderEmailLayout(input: RenderEmailLayoutInput): RenderedEmail {
  const {
    preheader,
    title,
    bodyLines,
    primaryCTA,
    secondaryCTA,
    footerRole,
  } = input;

  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const footerNote = footerLineFor(footerRole);

  const paragraphs = bodyLines
    .filter((l) => (typeof l === "string" ? l.trim().length > 0 : Boolean(l.html)))
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${COLOR.text};">${bodyToHtml(
          line
        )}</p>`
    )
    .join("");

  const primaryButtonHtml = primaryCTA
    ? `
      <p style="margin:24px 0 8px;">
        <a href="${escapeAttr(primaryCTA.href)}"
           style="display:inline-block;padding:14px 22px;background:${COLOR.primary};color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;">
          ${escapeHtml(primaryCTA.label)}
        </a>
      </p>`
    : "";

  const secondaryButtonHtml = secondaryCTA
    ? `
      <p style="margin:0 0 24px;font-size:14px;color:${COLOR.muted};">
        Or
        <a href="${escapeAttr(secondaryCTA.href)}"
           style="color:${COLOR.text};text-decoration:underline;font-weight:600;">
          ${escapeHtml(secondaryCTA.label)}
        </a>.
      </p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLOR.text};">
    <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${safePreheader}
    </span>
    <div style="margin:0;padding:24px;background:${COLOR.bg};">
      <div style="max-width:600px;margin:0 auto;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:16px;overflow:hidden;">
        <div style="padding:22px 28px;border-bottom:1px solid ${COLOR.border};">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;color:${COLOR.text};">
            FindMySpace
          </div>
        </div>
        <div style="padding:28px;">
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:${COLOR.text};">
            ${safeTitle}
          </h1>
          ${paragraphs}
          ${primaryButtonHtml}
          ${secondaryButtonHtml}
        </div>
        <div style="padding:18px 28px;border-top:1px solid ${COLOR.border};background:${COLOR.bg};">
          <p style="margin:0 0 6px;font-size:12px;color:${COLOR.muted};">
            ${escapeHtml(footerNote)}
          </p>
          <p style="margin:0;font-size:12px;color:${COLOR.subtle};">
            FindMySpace · Rent spaces easily and securely
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  // Plain-text alternative — keep aligned with the HTML so the message reads
  // sensibly in clients that suppress HTML.
  const textParts: string[] = [];
  textParts.push(title);
  textParts.push("");
  for (const line of bodyLines) {
    const t = bodyToText(line).trim();
    if (t.length > 0) textParts.push(t);
  }
  if (primaryCTA) {
    textParts.push("");
    textParts.push(`${primaryCTA.label}: ${primaryCTA.href}`);
  }
  if (secondaryCTA) {
    textParts.push(`${secondaryCTA.label}: ${secondaryCTA.href}`);
  }
  textParts.push("");
  textParts.push("—");
  textParts.push(footerNote);
  textParts.push("FindMySpace · Rent spaces easily and securely");

  const text = textParts.join("\n").replace(/\n{3,}/g, "\n\n");

  return { html, text };
}

/**
 * Inline-safe `<strong>` helper for use inside `bodyLines`.
 * Lets callers emphasise a value without hand-writing HTML.
 */
export function emailStrong(text: string): { html: string } {
  return {
    html: `<strong style="color:${COLOR.text};">${escapeHtml(text)}</strong>`,
  };
}

/**
 * Emit a simple bordered "callout" block (e.g. quoted question, host answer).
 * Returns a `bodyLines`-compatible HTML chunk.
 */
export function emailCallout(input: {
  label?: string;
  body: string;
  tone?: "neutral" | "success" | "warning";
}): { html: string } {
  const tone = input.tone || "neutral";
  const palette =
    tone === "success"
      ? { bg: "#f0fdf4", border: "#bbf7d0", label: "#166534", text: "#14532d" }
      : tone === "warning"
      ? { bg: "#fffbeb", border: "#fde68a", label: "#92400e", text: "#78350f" }
      : { bg: "#f8fafc", border: COLOR.border, label: "#64748b", text: "#0f172a" };

  const labelHtml = input.label
    ? `<p style="margin:0 0 6px;font-size:12px;color:${palette.label};font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">
         ${escapeHtml(input.label)}
       </p>`
    : "";

  return {
    html: `<div style="margin:8px 0 8px;padding:16px 18px;background:${palette.bg};border:1px solid ${palette.border};border-radius:12px;">
      ${labelHtml}
      <p style="margin:0;font-size:15px;line-height:1.55;color:${palette.text};white-space:pre-wrap;">${escapeHtml(
      input.body
    )}</p>
    </div>`,
  };
}
