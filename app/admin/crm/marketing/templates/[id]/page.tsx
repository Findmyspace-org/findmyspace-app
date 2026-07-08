"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchMarketingTemplate,
  updateMarketingTemplateApi,
} from "@/lib/crm-marketing/api-client";
import type { CrmMarketingTemplateRow } from "@/lib/crm-marketing/types";
import { REQUIRED_UNSUBSCRIBE_PLACEHOLDER } from "@/lib/crm-marketing/template-sanitize";
import { renderMarketingCampaignEmail } from "@/lib/crm-marketing/campaign-render";

export default function MarketingTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<CrmMarketingTemplateRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMarketingTemplate(params.id).then(setTemplate);
  }, [params.id]);

  const previewHtml = template
    ? renderMarketingCampaignEmail({
        template: {
          id: template.id,
          name: template.name,
          templateType: template.templateType,
          headerJson: template.headerJson,
          footerJson: template.footerJson,
          contentStyleJson: template.contentStyleJson,
          htmlTemplate: template.htmlTemplate,
          plainTextTemplate: template.plainTextTemplate,
        },
        content: {
          heading: "Sample heading",
          introText: "This is a preview of your reusable FindMySpace template.",
          mainContent: "Main content area with {{contact_first_name}} merge field support.",
          ctaLabel: "Visit FindMySpace",
          ctaUrl: "https://findmyspace.co.za",
        },
        subject: "Preview",
        previewText: "Template preview",
      }).html
    : "";

  async function save(patch: Record<string, unknown>) {
    if (!template) return;
    setError(null);
    try {
      const updated = await updateMarketingTemplateApi(template.id, {
        name: template.name,
        description: template.description || "",
        templateType: template.templateType,
        isDefault: template.isDefault,
        isActive: template.isActive,
        headerJson: template.headerJson,
        footerJson: template.footerJson,
        contentStyleJson: template.contentStyleJson,
        htmlTemplate: template.htmlTemplate,
        plainTextTemplate: template.plainTextTemplate,
        ...patch,
      });
      setTemplate(updated);
      setMessage("Template saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template.");
    }
  }

  if (!template) return <p className="text-sm text-gray-500">Loading template…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">{template.name}</h2>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} className="rounded-lg border p-2 text-sm" />
          <input value={template.description || ""} onChange={(e) => setTemplate({ ...template, description: e.target.value })} className="rounded-lg border p-2 text-sm" placeholder="Description" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={template.isDefault} onChange={(e) => setTemplate({ ...template, isDefault: e.target.checked })} />
            Default template
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={template.isActive} onChange={(e) => setTemplate({ ...template, isActive: e.target.checked })} />
            Active
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">Unsubscribe placeholder required: {REQUIRED_UNSUBSCRIBE_PLACEHOLDER}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save({})} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">Save</button>
          <button type="button" onClick={() => void updateMarketingTemplateApi(template.id, { action: "duplicate" }).then((t) => setMessage(`Duplicated: ${t.name}`))} className="rounded-lg border px-4 py-2 text-sm">Duplicate</button>
          <button type="button" onClick={() => void updateMarketingTemplateApi(template.id, { action: "archive" }).then(() => setMessage("Template archived."))} className="rounded-lg border px-4 py-2 text-sm">Archive</button>
          <Link href="/admin/crm/marketing/templates" className="rounded-lg border px-4 py-2 text-sm">Back</Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Desktop preview</h3>
          <iframe title="Template desktop preview" className="mt-2 h-[480px] w-full rounded-lg border bg-white" srcDoc={previewHtml} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Mobile preview</h3>
          <div className="mx-auto mt-2 w-[375px] max-w-full">
            <iframe title="Template mobile preview" className="h-[480px] w-full rounded-lg border bg-white" srcDoc={previewHtml} />
          </div>
        </div>
      </div>
    </div>
  );
}
