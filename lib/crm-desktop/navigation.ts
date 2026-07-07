import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Contact,
  Kanban,
  LayoutDashboard,
  ListTodo,
  MapPin,
  MessageSquare,
  Megaphone,
  Search,
  Mail,
} from "lucide-react";

export type CrmDesktopNavKey =
  | "overview"
  | "today"
  | "activities"
  | "pipeline"
  | "organisations"
  | "spaces"
  | "contacts"
  | "tasks"
  | "communication"
  | "marketing"
  | "search";

export type CrmDesktopNavItem = {
  key: CrmDesktopNavKey;
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: string;
};

export const CRM_DESKTOP_NAV: CrmDesktopNavItem[] = [
  {
    key: "overview",
    href: "/admin/crm",
    label: "Overview",
    icon: LayoutDashboard,
    matchPrefix: "/admin/crm",
  },
  {
    key: "today",
    href: "/admin/crm/today",
    label: "Today",
    icon: CalendarDays,
  },
  {
    key: "activities",
    href: "/admin/crm/activities",
    label: "Activities",
    icon: ListTodo,
  },
  {
    key: "pipeline",
    href: "/admin/crm/pipeline",
    label: "Pipeline",
    icon: Kanban,
  },
  {
    key: "organisations",
    href: "/admin/crm/organisations",
    label: "Organisations",
    icon: Building2,
  },
  {
    key: "spaces",
    href: "/admin/crm/spaces",
    label: "Spaces",
    icon: MapPin,
  },
  {
    key: "contacts",
    href: "/admin/crm/contacts",
    label: "Contacts",
    icon: Contact,
  },
  {
    key: "tasks",
    href: "/admin/crm/tasks",
    label: "Tasks",
    icon: ClipboardList,
  },
  {
    key: "communication",
    href: "/admin/crm/communication",
    label: "Communication",
    icon: Mail,
  },
  {
    key: "marketing",
    href: "/admin/crm/marketing",
    label: "Marketing",
    icon: Megaphone,
    matchPrefix: "/admin/crm/marketing",
  },
  {
    key: "search",
    href: "/admin/crm/search",
    label: "Search",
    icon: Search,
  },
];

export const CRM_MOBILE_LINK = {
  href: "/space-place/today",
  label: "Mobile CRM",
  icon: MessageSquare,
};

export function isCrmDesktopNavActive(
  pathname: string,
  item: CrmDesktopNavItem
): boolean {
  if (item.key === "overview") {
    return pathname === "/admin/crm";
  }
  if (item.key === "marketing") {
    return pathname === "/admin/crm/marketing" || pathname.startsWith("/admin/crm/marketing/");
  }
  const base = item.matchPrefix ?? item.href;
  return pathname === base || pathname.startsWith(`${base}/`);
}
