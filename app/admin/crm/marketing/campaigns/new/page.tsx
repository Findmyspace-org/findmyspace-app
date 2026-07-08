"use client";

import { CrmCampaignBuilder } from "@/app/components/crm-desktop/CrmCampaignBuilder";

export default function NewMarketingCampaignPage() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-[#192a3a]">New campaign</h2>
      <CrmCampaignBuilder />
    </div>
  );
}
