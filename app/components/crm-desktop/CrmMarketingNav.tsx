"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/crm/marketing", label: "Overview", exact: true },
  { href: "/admin/crm/marketing/contacts", label: "Contacts" },
  { href: "/admin/crm/marketing/lists", label: "Lists" },
  { href: "/admin/crm/marketing/templates", label: "Templates" },
  { href: "/admin/crm/marketing/campaigns", label: "Campaigns" },
  { href: "/admin/crm/marketing/suppressions", label: "Suppressions" },
];

export function CrmMarketingNav() {
  const pathname = usePathname() || "";

  return (
    <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-[#192a3a] text-white"
                : "text-gray-700 ring-1 ring-gray-200 hover:ring-[#c1121f]/30"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
