import type { Metadata } from "next";
import { CrmDesktopShell } from "@/app/components/crm-desktop/CrmDesktopShell";

export const metadata: Metadata = {
  title: "CRM | Admin | FindMySpace",
  robots: { index: false, follow: false },
};

export default function CrmDesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CrmDesktopShell>{children}</CrmDesktopShell>;
}
