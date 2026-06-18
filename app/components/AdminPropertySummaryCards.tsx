"use client";

import type { PropertyOnboardingProgress } from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
  PropertySpaceRow,
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
  matrixSpaces?: PropertySpaceRow[];
  onMatrixSpaceUpdated?: (spaceId: string, patch: Partial<PropertySpaceRow>) => void;
  onMatrixReload?: () => Promise<void>;
  propertyId: string;
  matrixArchivedCount?: number;
  matrixShowArchived?: boolean;
  onMatrixToggleArchived?: () => void;
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
      matrixSpaces={props.matrixSpaces}
      onMatrixSpaceUpdated={props.onMatrixSpaceUpdated}
      onMatrixReload={props.onMatrixReload}
      propertyId={props.propertyId}
      matrixArchivedCount={props.matrixArchivedCount}
      matrixShowArchived={props.matrixShowArchived}
      onMatrixToggleArchived={props.onMatrixToggleArchived}
    />
  );
}

export type { PropertyActivitySummary };

/** @deprecated Use AdminPropertySummaryCards */
export const AdminPropertyReadinessDashboard = AdminPropertySummaryCards;
