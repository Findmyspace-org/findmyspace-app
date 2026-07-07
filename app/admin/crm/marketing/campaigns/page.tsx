import Link from "next/link";

export default function MarketingCampaignsPage() {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-[#192a3a]">Campaigns</h2>
      <p className="text-sm text-gray-600">
        Campaign drafting is available in this release. Bulk sending is not enabled until
        provider configuration, unsubscribe endpoints, and delivery testing are complete.
      </p>
      <p className="text-sm text-gray-600">
        Recommended provider for this architecture:{" "}
        <strong>Resend</strong> (already integrated for transactional email). Use Resend
        Audiences or batch APIs with server-side eligibility re-checks before any production
        marketing send.
      </p>
      <Link
        href="/admin/crm/marketing/campaigns/new"
        className="inline-block rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
      >
        New draft campaign (placeholder)
      </Link>
    </div>
  );
}
