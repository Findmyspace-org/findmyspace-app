"use client";

import type { PropertyOnboardingProgress } from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
} from "@/lib/property-space-ops";
import {
  PropertyReadinessDashboard,
  type PropertyActivitySummary,
} from "@/app/components/PropertyReadinessDashboard";

type AdminPropertySummaryCardsProps = {
  summary: PropertySpacesSummary;
  health: PropertySpacesHealth;
  healthFilter: PropertySpaceHealthFilter;
  onHealthFilterChange: (filter: PropertySpaceHealthFilter) => void;
  progress: PropertyOnboardingProgress;
  activity?: PropertyActivitySummary;
};

export function AdminPropertySummaryCards(props: AdminPropertySummaryCardsProps) {
  return (
    <PropertyReadinessDashboard
      variant="admin"
      summary={props.summary}
      health={props.health}
      progress={props.progress}
      healthFilter={props.healthFilter}
      onHealthFilterChange={props.onHealthFilterChange}
      activity={props.activity}
    />
  );
}

export type { PropertyActivitySummary };

/** @deprecated Use AdminPropertySummaryCards */
export const AdminPropertyReadinessDashboard = AdminPropertySummaryCards;
