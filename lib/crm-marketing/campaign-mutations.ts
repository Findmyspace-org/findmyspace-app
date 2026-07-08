import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseCampaignContent } from "./campaign-content";
import { normaliseAudienceDefinition } from "./audience-definition";
import {
  renderMarketingCampaignEmail,
  snapshotFromTemplateRow,
  type MarketingTemplateSnapshot,
} from "./campaign-render";
import { buildRecipientPreview } from "./recipient-preview";
import { validateMarketingSenderEmail } from "./sender-validation";
import { writeMarketingAudit } from "./audits";
import { sendEmail } from "@/lib/email";

export type CampaignDraftInput = {
  name: string;
  subject?: string;
  previewText?: string;
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  internalNotes?: string;
  campaignType?: string;
  templateId?: string | null;
  contentJson?: unknown;
  audienceDefinition?: unknown;
  listIds?: string[];
};

function rowToCampaign(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    subject: (row.subject as string | null) ?? null,
    previewText: (row.preview_text as string | null) ?? null,
    senderName: (row.sender_name as string | null) ?? null,
    senderEmail: (row.sender_email as string | null) ?? null,
    replyTo: (row.reply_to as string | null) ?? null,
    internalNotes: (row.internal_notes as string | null) ?? null,
    campaignType: (row.campaign_type as string) || "newsletter",
    status: row.status as string,
    templateId: (row.template_id as string | null) ?? null,
    templateSnapshotJson: row.template_snapshot_json,
    renderedHtml: (row.rendered_html as string | null) ?? null,
    renderedPlainText: (row.rendered_plain_text as string | null) ?? null,
    contentJson: row.content_json,
    audienceDefinition: row.audience_definition,
    audienceSnapshotCount: (row.audience_snapshot_count as number | null) ?? 0,
    audienceSnapshotJson: row.audience_snapshot_json,
    audiencePreviewedAt: (row.audience_previewed_at as string | null) ?? null,
    listIds: (row.list_ids as string[]) || [],
    estimatedAudience: (row.estimated_audience as number | null) ?? 0,
    eligibleRecipients: (row.eligible_recipients as number | null) ?? 0,
    excludedRecipients: (row.excluded_recipients as number | null) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function buildRenderedSnapshot(
  adminClient: SupabaseClient,
  input: CampaignDraftInput,
  existing?: Record<string, unknown> | null
) {
  const content = normaliseCampaignContent(input.contentJson ?? existing?.content_json);
  const subject = input.subject?.trim() || (existing?.subject as string) || "";
  const previewText =
    input.previewText?.trim() || (existing?.preview_text as string) || "";

  let templateSnapshot: MarketingTemplateSnapshot | null =
    (existing?.template_snapshot_json as MarketingTemplateSnapshot | null) ?? null;
  const templateId = input.templateId ?? (existing?.template_id as string | null);

  if (input.templateId) {
    const { data: templateRow, error } = await adminClient
      .from("crm_marketing_templates")
      .select("*")
      .eq("id", input.templateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!templateRow) throw new Error("Template not found.");
    templateSnapshot = snapshotFromTemplateRow(templateRow as Record<string, unknown>);
  }

  if (!templateSnapshot) return { templateSnapshot: null, renderedHtml: null, renderedPlainText: null };

  const rendered = renderMarketingCampaignEmail({
    template: templateSnapshot,
    content,
    subject,
    previewText,
    senderName: input.senderName,
    mergeContext: {
      campaignSubject: subject,
      contactFirstName: "there",
      contactFullName: "there",
      organisationName: "Sample Organisation",
      unsubscribeUrl: "{{unsubscribe_url}}",
    },
  });

  return {
    templateSnapshot,
    templateId: templateId ?? (templateSnapshot as { id?: string }).id ?? null,
    renderedHtml: rendered.html,
    renderedPlainText: rendered.plainText,
  };
}

export async function listMarketingCampaigns(adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from("crm_marketing_campaigns")
    .select(
      "id, name, subject, status, campaign_type, eligible_recipients, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getMarketingCampaign(adminClient: SupabaseClient, id: string) {
  const { data, error } = await adminClient
    .from("crm_marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToCampaign(data as Record<string, unknown>);
}

export async function saveMarketingCampaignDraft(
  adminClient: SupabaseClient,
  input: CampaignDraftInput,
  actorId: string,
  campaignId?: string
) {
  if (!input.name?.trim()) throw new Error("Campaign name is required.");
  if (!input.subject?.trim()) throw new Error("Campaign subject is required.");

  const senderCheck = validateMarketingSenderEmail(input.senderEmail);
  if (!senderCheck.ok) throw new Error(senderCheck.error);

  const audienceDefinition = normaliseAudienceDefinition(input.audienceDefinition);
  if (input.listIds?.length) {
    audienceDefinition.listIds = [
      ...new Set([...(audienceDefinition.listIds || []), ...input.listIds]),
    ];
  }

  const preview = await buildRecipientPreview(adminClient, {
    audienceDefinition,
    listIds: audienceDefinition.listIds,
    actorId,
  });

  const existing = campaignId
    ? ((await adminClient.from("crm_marketing_campaigns").select("*").eq("id", campaignId).maybeSingle()).data as Record<string, unknown> | null)
    : null;

  const rendered = await buildRenderedSnapshot(adminClient, input, existing);

  const payload = {
    name: input.name.trim(),
    subject: input.subject.trim(),
    preview_text: input.previewText?.trim() || null,
    sender_name: input.senderName?.trim() || "FindMySpace",
    sender_email: senderCheck.email,
    reply_to: input.replyTo?.trim() || null,
    internal_notes: input.internalNotes?.trim() || null,
    campaign_type: input.campaignType || "newsletter",
    status: "draft",
    template_id: rendered.templateId,
    template_snapshot_json: rendered.templateSnapshot,
    rendered_html: rendered.renderedHtml,
    rendered_plain_text: rendered.renderedPlainText,
    content_json: normaliseCampaignContent(input.contentJson ?? existing?.content_json),
    audience_definition: audienceDefinition,
    audience_snapshot_count: preview.totalMatching,
    audience_snapshot_json: preview,
    audience_previewed_at: new Date().toISOString(),
    list_ids: audienceDefinition.listIds || [],
    estimated_audience: preview.totalMatching,
    eligible_recipients: preview.eligibleRecipients,
    excluded_recipients: preview.excludedRecipients,
    updated_at: new Date().toISOString(),
  };

  if (campaignId && existing) {
    const { data, error } = await adminClient
      .from("crm_marketing_campaigns")
      .update(payload)
      .eq("id", campaignId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeMarketingAudit(adminClient, {
      action: "campaign_draft_saved",
      actorId,
      marketingCampaignId: campaignId,
      newValue: { campaignId, name: data.name },
      source: "marketing_admin",
    });

    return { campaign: rowToCampaign(data as Record<string, unknown>), preview };
  }

  const { data, error } = await adminClient
    .from("crm_marketing_campaigns")
    .insert({ ...payload, created_by: actorId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "campaign_created",
    actorId,
    marketingCampaignId: data.id as string,
    newValue: { campaignId: data.id, name: data.name },
    source: "marketing_admin",
  });

  return { campaign: rowToCampaign(data as Record<string, unknown>), preview };
}

export async function sendMarketingCampaignTestEmail(
  adminClient: SupabaseClient,
  campaignId: string,
  testEmails: string[],
  actorId: string
) {
  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("Test send is unavailable: RESEND_API_KEY is not configured.");
  }

  const campaign = await getMarketingCampaign(adminClient, campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (!campaign.renderedHtml) throw new Error("Campaign has no rendered content yet.");

  const recipients = testEmails.map((e) => e.trim()).filter(Boolean);
  if (!recipients.length) throw new Error("Enter at least one test email address.");

  const senderCheck = validateMarketingSenderEmail(campaign.senderEmail);
  if (!senderCheck.ok) throw new Error(senderCheck.error);

  const subject = `[TEST] ${campaign.subject || campaign.name}`;
  const from = campaign.senderName
    ? `${campaign.senderName} <${senderCheck.email}>`
    : senderCheck.email;

  const result = await sendEmail({
    to: recipients,
    subject,
    html: campaign.renderedHtml,
    text: campaign.renderedPlainText || undefined,
    from,
  });

  if (!result.ok) throw new Error("Test email could not be sent.");

  await writeMarketingAudit(adminClient, {
    action: "campaign_test_email_sent",
    actorId,
    marketingCampaignId: campaignId,
    newValue: { recipients: recipients.length, subject },
    source: "marketing_admin",
  });

  return { ok: true };
}

export { rowToCampaign };
