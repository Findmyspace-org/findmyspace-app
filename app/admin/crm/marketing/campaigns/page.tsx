"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMarketingCampaigns } from "@/lib/crm-marketing/api-client";

export default function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<
    Array<{
      id: string;
      name: string;
      subject: string | null;
      status: string;
      eligible_recipients: number | null;
      updated_at: string;
    }>
  >([]);

  useEffect(() => {
    void fetchMarketingCampaigns().then(setCampaigns);
  }, []);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#192a3a]">Campaigns</h2>
          <p className="text-sm text-gray-600">
            Draft campaigns with templates and flexible audiences. Production bulk sending remains disabled.
          </p>
        </div>
        <Link href="/admin/crm/marketing/campaigns/new" className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
          New campaign
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <Link href={`/admin/crm/marketing/campaigns/${campaign.id}`} className="font-medium hover:text-[#c1121f]">
                {campaign.name}
              </Link>
              <p className="text-sm text-gray-600">{campaign.subject || "No subject"}</p>
              <p className="text-xs text-gray-500">
                {campaign.status} · {campaign.eligible_recipients ?? 0} eligible
              </p>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" disabled className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-500">
        Send / Schedule (disabled)
      </button>
    </div>
  );
}
