"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Home,
  Landmark,
  LayoutDashboard,
} from "lucide-react";

type OwnerTopNavProps = {
  active: "overview" | "listings" | "requests" | "calendar" | "finance";
  requestsLabel?: string;
};

export default function OwnerTopNav({
  active,
  requestsLabel = "Requests",
}: OwnerTopNavProps) {
  const itemClass =
    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-white hover:text-[#192a3a]";
  const activeClass =
    "inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[#192a3a] shadow-sm";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4">
      <Link href="/dashboard/owner" className={active === "overview" ? activeClass : itemClass}>
        <LayoutDashboard className="h-4 w-4" />
        <span>Overview</span>
      </Link>
      <Link href="/dashboard/listings" className={active === "listings" ? activeClass : itemClass}>
        <Home className="h-4 w-4" />
        <span>Listings</span>
      </Link>
      <Link href="/dashboard/requests" className={active === "requests" ? activeClass : itemClass}>
        <ClipboardList className="h-4 w-4" />
        <span>{requestsLabel}</span>
      </Link>
      <Link href="/dashboard/calendar" className={active === "calendar" ? activeClass : itemClass}>
        <CalendarDays className="h-4 w-4" />
        <span>Calendar</span>
      </Link>
      <Link href="/dashboard/finance" className={active === "finance" ? activeClass : itemClass}>
        <Landmark className="h-4 w-4" />
        <span>Finance</span>
      </Link>
    </div>
  );
}