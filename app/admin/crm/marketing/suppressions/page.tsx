import Link from "next/link";
import { MARKETING_COMPLIANCE_NOTICE } from "@/lib/crm-marketing/constants";

export default function MarketingSuppressionsPage() {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-[#192a3a]">Suppressions</h2>
      <p className="text-sm text-gray-600">{MARKETING_COMPLIANCE_NOTICE}</p>
      <p className="text-sm text-gray-600">
        Suppression status is stored on marketing contacts. Unsubscribe and suppression
        endpoints will be added before campaign sending is enabled.
      </p>
      <Link
        href="/admin/crm/marketing/contacts?status=suppressed"
        className="text-sm text-[#c1121f] hover:underline"
      >
        View suppressed contacts
      </Link>
    </div>
  );
}
