import { CrmMarketingNav } from "@/app/components/crm-desktop/CrmMarketingNav";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <CrmMarketingNav />
      {children}
    </div>
  );
}
