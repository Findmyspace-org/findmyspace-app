"use client";

import { AlertCircle } from "lucide-react";
import type { CrmQuickActionType } from "./CrmQuickActionProvider";
import {
  buildOrganisationQualityIndicators,
  type OrganisationQualityIndicator,
} from "@/lib/crm-desktop/organisation-contact-status";

export { buildOrganisationQualityIndicators };

export function CrmQualityIndicators({
  items,
  onIndicatorClick,
}: {
  items: OrganisationQualityIndicator[];
  onIndicatorClick?: (action: CrmQuickActionType) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (item.action) onIndicatorClick?.(item.action);
          }}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            item.action
              ? "bg-amber-50 text-amber-900 hover:bg-amber-100"
              : "bg-amber-50/80 text-amber-800"
          }`}
          title={item.label}
        >
          <AlertCircle className="h-3 w-3" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
