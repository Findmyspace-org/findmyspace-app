"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMarketingTemplates } from "@/lib/crm-marketing/api-client";
import type { CrmMarketingTemplateRow } from "@/lib/crm-marketing/types";

export default function MarketingTemplatesPage() {
  const [templates, setTemplates] = useState<CrmMarketingTemplateRow[]>([]);

  useEffect(() => {
    void fetchMarketingTemplates().then(setTemplates);
  }, []);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#192a3a]">Email templates</h2>
        <Link href="/admin/crm/marketing/templates/new" className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
          New template
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {templates.map((template) => (
          <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <Link href={`/admin/crm/marketing/templates/${template.id}`} className="font-medium hover:text-[#c1121f]">
                {template.name}
              </Link>
              <p className="text-sm text-gray-600">{template.description}</p>
              <p className="text-xs text-gray-500">
                {template.templateType}
                {template.isDefault ? " · Default" : ""}
                {!template.isActive ? " · Archived" : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
