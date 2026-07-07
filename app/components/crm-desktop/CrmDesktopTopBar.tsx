"use client";

import { useRouter } from "next/navigation";
import { Menu, Plus, Search } from "lucide-react";
import { useState } from "react";
import { adminRoleLabel } from "@/lib/admin-roles";
import { useCrmDesktop } from "./CrmDesktopContext";

export function CrmDesktopTopBar({
  title,
  subtitle,
  onOpenSidebar,
  addLabel = "Add organisation",
  onAdd,
  showSearch = true,
  filters,
}: {
  title: string;
  subtitle?: string;
  onOpenSidebar: () => void;
  addLabel?: string;
  onAdd?: () => void;
  showSearch?: boolean;
  filters?: React.ReactNode;
}) {
  const router = useRouter();
  const { profile, platformRole } = useCrmDesktop();
  const [search, setSearch] = useState("");

  function submitSearch() {
    const q = search.trim();
    if (q.length < 2) return;
    router.push(`/admin/crm/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          className="rounded-lg border border-gray-200 p-2 text-gray-700 lg:hidden"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-[#192a3a] md:text-xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        {showSearch ? (
          <div className="relative w-full sm:w-64 lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              placeholder="Search CRM…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        ) : null}

        {filters}

        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[#c1121f] px-4 py-2 text-sm font-medium text-white hover:bg-[#a10f1a]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{addLabel}</span>
          </button>
        ) : null}

        <div className="hidden text-right text-xs text-gray-500 md:block">
          <p className="font-medium text-[#192a3a]">
            {profile?.full_name || profile?.email || "User"}
          </p>
          <p>
            {profile?.role === "admin" ? "Main Admin" : profile?.role}
            {platformRole ? ` · ${adminRoleLabel(platformRole)}` : ""}
          </p>
        </div>
      </div>
    </header>
  );
}
