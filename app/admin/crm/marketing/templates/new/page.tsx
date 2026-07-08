"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMarketingTemplateApi } from "@/lib/crm-marketing/api-client";
import { REQUIRED_UNSUBSCRIBE_PLACEHOLDER } from "@/lib/crm-marketing/template-sanitize";

export default function NewMarketingTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("FindMySpace general update");
  const [description, setDescription] = useState("");
  const [templateType, setTemplateType] = useState("general");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      const template = await createMarketingTemplateApi({
        name,
        description,
        templateType,
        isDefault,
        headerJson: {
          logoUrl: "/logo.png",
          backgroundColor: "#f5f7fb",
          brandColor: "#192a3a",
          accentColor: "#c1121f",
        },
        footerJson: {
          companyName: "FindMySpace",
          contactEmail: "hello@findmyspace.co.za",
          websiteUrl: "https://findmyspace.co.za",
          legalText: "You are receiving this email because you are a CRM contact for FindMySpace.",
          requireUnsubscribe: true,
        },
        contentStyleJson: {
          contentWidth: 600,
          fontFamily: "Arial, Helvetica, sans-serif",
        },
        htmlTemplate: `<!-- FMS_TEMPLATE -->`,
        plainTextTemplate: `{{content}}\n\n${REQUIRED_UNSUBSCRIBE_PLACEHOLDER}`,
      });
      router.push(`/admin/crm/marketing/templates/${template.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create template.");
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold">New template</h2>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border p-2 text-sm" placeholder="Name" />
        <select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="rounded-lg border p-2 text-sm">
          <option value="general">General update</option>
          <option value="new_spaces">New spaces available</option>
          <option value="municipality">Municipality outreach</option>
          <option value="onboarding">Property owner onboarding</option>
          <option value="go_live">Go-live announcement</option>
          <option value="reengagement">Re-engagement</option>
          <option value="newsletter">Newsletter</option>
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-lg border p-2 text-sm sm:col-span-2" rows={3} placeholder="Description" />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Set as default template
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Templates must include {REQUIRED_UNSUBSCRIBE_PLACEHOLDER}. Header uses /logo.png.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">Create template</button>
        <Link href="/admin/crm/marketing/templates" className="rounded-lg border px-4 py-2 text-sm">Cancel</Link>
      </div>
    </div>
  );
}
