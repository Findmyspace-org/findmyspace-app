import type { CampaignContentJson } from "./campaign-content";
import { applyMergeFields, type CampaignMergeContext } from "./campaign-content";
import { sanitiseMarketingHtml } from "./template-sanitize";
import { REQUIRED_UNSUBSCRIBE_PLACEHOLDER } from "./template-sanitize";

export type MarketingTemplateSnapshot = {
  id: string;
  name: string;
  templateType: string;
  headerJson: Record<string, unknown>;
  footerJson: Record<string, unknown>;
  contentStyleJson: Record<string, unknown>;
  htmlTemplate: string | null;
  plainTextTemplate: string | null;
};

export type RenderCampaignInput = {
  template: MarketingTemplateSnapshot;
  content: CampaignContentJson;
  subject: string;
  previewText?: string;
  senderName?: string;
  mergeContext?: CampaignMergeContext;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtmlParagraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.6;">${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function buildCampaignBodyHtml(
  content: CampaignContentJson,
  mergeContext: CampaignMergeContext = {}
): string {
  const parts: string[] = [];
  if (content.heroImageUrl) {
    parts.push(
      `<p style="margin:0 0 20px;"><img src="${escapeHtml(content.heroImageUrl)}" alt="" style="max-width:100%;border-radius:8px;" /></p>`
    );
  }
  if (content.heading) {
    parts.push(
      `<h1 style="margin:0 0 12px;font-size:24px;">${escapeHtml(applyMergeFields(content.heading, mergeContext))}</h1>`
    );
  }
  if (content.introText) {
    parts.push(textToHtmlParagraphs(applyMergeFields(content.introText, mergeContext)));
  }
  if (content.mainContent) {
    parts.push(textToHtmlParagraphs(applyMergeFields(content.mainContent, mergeContext)));
  }
  for (const section of content.secondarySections || []) {
    if (section.title) {
      parts.push(
        `<h2 style="margin:24px 0 8px;font-size:18px;">${escapeHtml(section.title)}</h2>`
      );
    }
    if (section.body) {
      parts.push(textToHtmlParagraphs(section.body));
    }
  }
  if (content.ctaLabel && content.ctaUrl) {
    const label = escapeHtml(applyMergeFields(content.ctaLabel, mergeContext));
    const href = escapeHtml(content.ctaUrl);
    parts.push(
      `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#c1121f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${label}</a></p>`
    );
  }
  return parts.join("\n");
}

export function renderMarketingCampaignEmail(input: RenderCampaignInput): {
  html: string;
  plainText: string;
} {
  const header = input.template.headerJson || {};
  const footer = input.template.footerJson || {};
  const style = input.template.contentStyleJson || {};
  const mergeContext: CampaignMergeContext = {
    campaignSubject: input.subject,
    unsubscribeUrl: REQUIRED_UNSUBSCRIBE_PLACEHOLDER,
    ...input.mergeContext,
  };

  const bodyInner = buildCampaignBodyHtml(input.content, mergeContext);
  const logoUrl = String(header.logoUrl || "/logo.png");
  const bg = String(header.backgroundColor || "#f5f7fb");
  const brand = String(header.brandColor || "#192a3a");
  const accent = String(header.accentColor || "#c1121f");
  const width = Number(style.contentWidth || 600);
  const font = String(style.fontFamily || "Arial, Helvetica, sans-serif");

  const companyName = String(footer.companyName || "FindMySpace");
  const contactEmail = String(footer.contactEmail || "");
  const websiteUrl = String(footer.websiteUrl || "https://findmyspace.co.za");
  const legalText = String(footer.legalText || "");
  const unsubscribe = applyMergeFields(REQUIRED_UNSUBSCRIBE_PLACEHOLDER, mergeContext);

  const html = sanitiseMarketingHtml(`
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${bg};font-family:${font};color:${brand};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.previewText || "")}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="${width}" cellpadding="0" cellspacing="0" style="max-width:${width}px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 24px 12px;text-align:center;background:${brand};">
          <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)}" height="40" style="display:inline-block;" />
        </td></tr>
        <tr><td style="padding:24px;">
          ${bodyInner}
        </td></tr>
        <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">
          <p style="margin:0 0 8px;">${escapeHtml(companyName)}${contactEmail ? ` · ${escapeHtml(contactEmail)}` : ""}</p>
          ${legalText ? `<p style="margin:0 0 8px;">${escapeHtml(legalText)}</p>` : ""}
          <p style="margin:0;"><a href="${escapeHtml(unsubscribe)}" style="color:${accent};">Unsubscribe</a> · <a href="${escapeHtml(websiteUrl)}" style="color:${accent};">Website</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`);

  const plainParts = [
    input.subject,
    "",
    contentToPlain(input.content, mergeContext),
    "",
    legalText,
    `Unsubscribe: ${unsubscribe}`,
    websiteUrl,
  ].filter(Boolean);

  const plainText = applyMergeFields(plainParts.join("\n"), mergeContext);
  return { html, plainText };
}

function contentToPlain(
  content: CampaignContentJson,
  mergeContext: CampaignMergeContext
): string {
  const lines: string[] = [];
  if (content.heading) lines.push(applyMergeFields(content.heading, mergeContext));
  if (content.introText) lines.push(applyMergeFields(content.introText, mergeContext));
  if (content.mainContent) lines.push(applyMergeFields(content.mainContent, mergeContext));
  for (const section of content.secondarySections || []) {
    if (section.title) lines.push(section.title);
    if (section.body) lines.push(section.body);
  }
  if (content.ctaLabel && content.ctaUrl) {
    lines.push(`${content.ctaLabel}: ${content.ctaUrl}`);
  }
  return lines.join("\n\n");
}

export function snapshotFromTemplateRow(row: Record<string, unknown>): MarketingTemplateSnapshot {
  return {
    id: row.id as string,
    name: row.name as string,
    templateType: (row.template_type as string) || "general",
    headerJson: (row.header_json as Record<string, unknown>) || {},
    footerJson: (row.footer_json as Record<string, unknown>) || {},
    contentStyleJson: (row.content_style_json as Record<string, unknown>) || {},
    htmlTemplate: (row.html_template as string | null) ?? null,
    plainTextTemplate: (row.plain_text_template as string | null) ?? null,
  };
}
