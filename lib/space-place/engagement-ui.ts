import type { LucideIcon } from "lucide-react";
import {
  Mail,
  MessageCircle,
  Mic,
  NotebookPen,
  Phone,
  Users,
} from "lucide-react";

export type EngagementFilter =
  | "all"
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "note";

export const ENGAGEMENT_FILTERS: { value: EngagementFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "call", label: "Calls" },
  { value: "whatsapp", label: "WhatsApps" },
  { value: "email", label: "Emails" },
  { value: "meeting", label: "Meetings" },
  { value: "note", label: "Notes" },
];

export function engagementTypeLabel(type: string): string {
  const map: Record<string, string> = {
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    meeting: "Meeting",
    note: "Note",
    manual_quick_update: "Quick update",
  };
  return map[type] ?? type;
}

export function engagementTypeIcon(type: string): LucideIcon {
  const map: Record<string, LucideIcon> = {
    call: Phone,
    whatsapp: MessageCircle,
    email: Mail,
    meeting: Users,
    note: NotebookPen,
    manual_quick_update: Mic,
  };
  return map[type] ?? NotebookPen;
}

export function matchesEngagementFilter(
  type: string,
  filter: EngagementFilter
): boolean {
  if (filter === "all") return true;
  return type === filter;
}
