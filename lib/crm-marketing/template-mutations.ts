import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertTemplateHasUnsubscribePlaceholder,
  rejectUnsafeTemplateHtml,
  sanitiseMarketingHtml,
} from "./template-sanitize";
import { snapshotFromTemplateRow } from "./campaign-render";
import { writeMarketingAudit } from "./audits";

export type MarketingTemplateInput = {
  name: string;
  description?: string;
  templateType?: string;
  isDefault?: boolean;
  isActive?: boolean;
  headerJson?: Record<string, unknown>;
  footerJson?: Record<string, unknown>;
  contentStyleJson?: Record<string, unknown>;
  htmlTemplate?: string;
  plainTextTemplate?: string;
  previewImageUrl?: string;
};

function rowToTemplate(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    templateType: (row.template_type as string) || "general",
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    headerJson: (row.header_json as Record<string, unknown>) || {},
    footerJson: (row.footer_json as Record<string, unknown>) || {},
    contentStyleJson: (row.content_style_json as Record<string, unknown>) || {},
    htmlTemplate: (row.html_template as string | null) ?? null,
    plainTextTemplate: (row.plain_text_template as string | null) ?? null,
    previewImageUrl: (row.preview_image_url as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listMarketingTemplates(adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from("crm_marketing_templates")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((row) => rowToTemplate(row as Record<string, unknown>));
}

export async function getMarketingTemplate(
  adminClient: SupabaseClient,
  id: string
) {
  const { data, error } = await adminClient
    .from("crm_marketing_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToTemplate(data as Record<string, unknown>);
}

function validateTemplateInput(input: MarketingTemplateInput) {
  if (!input.name?.trim()) throw new Error("Template name is required.");
  rejectUnsafeTemplateHtml(input.htmlTemplate);
  assertTemplateHasUnsubscribePlaceholder(
    input.htmlTemplate,
    input.plainTextTemplate,
    input.footerJson || {}
  );
}

async function clearOtherDefaults(adminClient: SupabaseClient, exceptId?: string) {
  let query = adminClient
    .from("crm_marketing_templates")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function createMarketingTemplate(
  adminClient: SupabaseClient,
  input: MarketingTemplateInput,
  actorId: string
) {
  validateTemplateInput(input);
  if (input.isDefault) await clearOtherDefaults(adminClient);

  const { data, error } = await adminClient
    .from("crm_marketing_templates")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      template_type: input.templateType || "general",
      is_default: Boolean(input.isDefault),
      is_active: input.isActive !== false,
      header_json: input.headerJson || {},
      footer_json: input.footerJson || {},
      content_style_json: input.contentStyleJson || {},
      html_template: sanitiseMarketingHtml(input.htmlTemplate || "<!-- FMS_TEMPLATE -->"),
      plain_text_template: input.plainTextTemplate || "{{content}}\n\n{{unsubscribe_url}}",
      preview_image_url: input.previewImageUrl || null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "template_created",
    actorId,
    newValue: { templateId: data.id, name: data.name },
    source: "marketing_admin",
  });

  return rowToTemplate(data as Record<string, unknown>);
}

export async function updateMarketingTemplate(
  adminClient: SupabaseClient,
  id: string,
  input: MarketingTemplateInput,
  actorId: string
) {
  validateTemplateInput(input);
  const previous = await getMarketingTemplate(adminClient, id);
  if (!previous) throw new Error("Template not found.");

  if (input.isDefault) await clearOtherDefaults(adminClient, id);

  const { data, error } = await adminClient
    .from("crm_marketing_templates")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      template_type: input.templateType || "general",
      is_default: Boolean(input.isDefault),
      is_active: input.isActive !== false,
      header_json: input.headerJson || {},
      footer_json: input.footerJson || {},
      content_style_json: input.contentStyleJson || {},
      html_template: sanitiseMarketingHtml(input.htmlTemplate || "<!-- FMS_TEMPLATE -->"),
      plain_text_template: input.plainTextTemplate || "{{content}}\n\n{{unsubscribe_url}}",
      preview_image_url: input.previewImageUrl || null,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: input.isDefault ? "default_template_changed" : "template_edited",
    actorId,
    previousValue: previous,
    newValue: { templateId: id, name: data.name },
    source: "marketing_admin",
  });

  return rowToTemplate(data as Record<string, unknown>);
}

export async function duplicateMarketingTemplate(
  adminClient: SupabaseClient,
  id: string,
  actorId: string
) {
  const source = await getMarketingTemplate(adminClient, id);
  if (!source) throw new Error("Template not found.");
  const created = await createMarketingTemplate(
    adminClient,
    {
      name: `${source.name} (copy)`,
      description: source.description || undefined,
      templateType: source.templateType,
      isDefault: false,
      isActive: true,
      headerJson: source.headerJson,
      footerJson: source.footerJson,
      contentStyleJson: source.contentStyleJson,
      htmlTemplate: source.htmlTemplate || undefined,
      plainTextTemplate: source.plainTextTemplate || undefined,
      previewImageUrl: source.previewImageUrl || undefined,
    },
    actorId
  );

  await writeMarketingAudit(adminClient, {
    action: "template_duplicated",
    actorId,
    newValue: { sourceTemplateId: id, templateId: created.id },
    source: "marketing_admin",
  });

  return created;
}

export async function archiveMarketingTemplate(
  adminClient: SupabaseClient,
  id: string,
  actorId: string
) {
  const { data, error } = await adminClient
    .from("crm_marketing_templates")
    .update({
      is_active: false,
      is_default: false,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);

  await writeMarketingAudit(adminClient, {
    action: "template_archived",
    actorId,
    newValue: { templateId: id, name: data.name },
    source: "marketing_admin",
  });

  return getMarketingTemplate(adminClient, id);
}

export function templateSnapshotFromRow(row: Record<string, unknown>) {
  return snapshotFromTemplateRow(row);
}
