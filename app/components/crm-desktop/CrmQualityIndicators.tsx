"use client";

import { AlertCircle } from "lucide-react";
import type { CrmOrganisationListRow } from "@/lib/crm-desktop/types";
import type { CrmQuickActionType } from "./CrmQuickActionProvider";

type Indicator = {
  key: string;
  label: string;
  action?: CrmQuickActionType;
};

export function CrmQualityIndicators({
  items,
  onIndicatorClick,
}: {
  items: Indicator[];
  onIndicatorClick?: (action: CrmQuickActionType) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => item.action && onIndicatorClick?.(item.action)}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
          title={item.label}
        >
          <AlertCircle className="h-3 w-3" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function buildOrganisationQualityIndicators(
  row: CrmOrganisationListRow
): Indicator[] {
  const items: Indicator[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (!row.primary_contact_name) {
    items.push({ key: "no_contact", label: "No contact", action: "add_task" });
  }
  if (row.primary_contact_name && !row.primary_contact_email) {
    items.push({ key: "no_email", label: "No email", action: "add_note" });
  }
  if (
    row.primary_contact_name &&
    !row.primary_contact_phone
  ) {
    items.push({ key: "no_phone", label: "No phone", action: "add_note" });
  }
  if (!row.next_task_title) {
    items.push({
      key: "no_next",
      label: "No next step",
      action: "schedule_followup",
    });
  }
  if (!row.next_task_due && row.next_task_title) {
    items.push({
      key: "no_follow_up",
      label: "No follow-up date",
      action: "schedule_followup",
    });
  }
  if (row.next_task_due && row.next_task_due < today) {
    items.push({ key: "overdue", label: "Overdue", action: "complete_task" });
  }
  if (row.space_count === 0 && row.property_count === 0) {
    items.push({ key: "no_spaces", label: "No spaces", action: "add_note" });
  }
  if (!row.last_interaction_at) {
    items.push({
      key: "no_interaction",
      label: "No interaction",
      action: "log_call",
    });
  }

  return items;
}
