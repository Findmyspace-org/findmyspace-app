"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CrmCampaignBuilder } from "@/app/components/crm-desktop/CrmCampaignBuilder";
import { fetchMarketingCampaign } from "@/lib/crm-marketing/api-client";
import type { CrmMarketingCampaignRow } from "@/lib/crm-marketing/types";

export default function MarketingCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<CrmMarketingCampaignRow | null>(null);

  useEffect(() => {
    void fetchMarketingCampaign(params.id).then((value) =>
      setCampaign(value as CrmMarketingCampaignRow)
    );
  }, [params.id]);

  if (!campaign) return <p className="text-sm text-gray-500">Loading campaign…</p>;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-[#192a3a]">{campaign.name}</h2>
      <CrmCampaignBuilder initialCampaign={campaign} />
    </div>
  );
}
