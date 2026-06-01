"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  GitBranch,
  MoreHorizontal,
  Plus,
} from "lucide-react";

const LEFT = [
  { href: "/space-place/today", label: "Today", icon: CalendarDays },
  { href: "/space-place/pipeline", label: "Pipeline", icon: GitBranch },
] as const;

const RIGHT = [
  { href: "/space-place/spaces", label: "Spaces", icon: Building2 },
  { href: "/space-place/more", label: "More", icon: MoreHorizontal },
] as const;

function SideNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition ${
        active
          ? "bg-[#c1121f]/10 text-[#c1121f]"
          : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <Icon className="h-6 w-6 shrink-0" strokeWidth={active ? 2.5 : 2} />
      <span className="max-w-full truncate text-[10px] font-semibold sm:text-xs">
        {label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const addActive =
    pathname === "/space-place/add" || pathname.startsWith("/space-place/add/");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-end justify-between gap-1 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-1 justify-center gap-0.5">
          {LEFT.map((item) => (
            <SideNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`)
              }
            />
          ))}
        </div>

        <Link
          href="/space-place/add"
          className={`relative -top-4 flex shrink-0 flex-col items-center justify-center rounded-full px-3 pb-1 pt-0.5 transition ${
            addActive ? "scale-105" : ""
          }`}
          aria-current={addActive ? "page" : undefined}
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg ${
              addActive
                ? "bg-[#a10f1a] ring-4 ring-[#c1121f]/20"
                : "bg-[#c1121f]"
            }`}
          >
            <Plus className="h-7 w-7 text-white" strokeWidth={2.5} />
          </span>
          <span
            className={`mt-1 text-[10px] font-bold sm:text-xs ${
              addActive ? "text-[#c1121f]" : "text-neutral-800"
            }`}
          >
            Add
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 justify-center gap-0.5">
          {RIGHT.map((item) => (
            <SideNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`)
              }
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
