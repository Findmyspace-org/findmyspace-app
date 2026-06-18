import type {
  PropertyOnboardingChecklistItem,
  PropertyOnboardingProgress,
} from "@/lib/property-onboarding-progress";
import type {
  PropertySpacesHealth,
  PropertySpacesSummary,
  PropertySpaceHealthFilter,
} from "@/lib/property-space-ops";

export type ReadinessAttentionItem = {
  id: string;
  label: string;
  filter?: PropertySpaceHealthFilter;
  href?: string;
};

const HEALTH_FILTER_BY_ITEM_ID: Partial<
  Record<string, PropertySpaceHealthFilter>
> = {
  "space-photos": "missing_photos",
  "space-pricing": "missing_pricing",
  "space-location": "missing_location",
  "space-ai-info": "missing_ai_info",
};

const ADMIN_ONLY_ITEM_IDS = new Set([
  "crm",
  "invite-sent",
  "invite-accepted",
]);

export function flattenReadinessChecklist(
  progress: PropertyOnboardingProgress,
  variant: "admin" | "owner"
): PropertyOnboardingChecklistItem[] {
  const items = [
    ...progress.checklist.property.filter((item) => item.id !== "created"),
    ...progress.checklist.spaces,
    ...progress.checklist.ownership,
    ...progress.checklist.review,
  ];

  if (variant === "owner") {
    return items.filter((item) => !ADMIN_ONLY_ITEM_IDS.has(item.id));
  }

  return items;
}

export function readinessAttentionLabel(
  item: PropertyOnboardingChecklistItem
): string {
  if (item.id === "space-pricing" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add pricing to ${count} spaces` : "Add pricing to spaces";
  }
  if (item.id === "space-photos" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add photos to ${count} spaces` : "Add photos to spaces";
  }
  if (item.id === "space-location" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count ? `Add location to ${count} spaces` : "Add location to spaces";
  }
  if (item.id === "space-ai-info" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count
      ? `Add AI information to ${count} spaces`
      : "Add AI information to spaces";
  }
  if (item.id === "invite-accepted" && item.warning) {
    return "Owner invitation not accepted";
  }
  if (item.id === "invite-sent" && item.warning) {
    return "Send owner invite";
  }
  if (item.id === "gallery" && item.warning) {
    return "Add property photos";
  }
  if (item.id === "crm" && !item.done) {
    return "Link CRM organisation";
  }
  if (item.id === "spaces-created" && item.warning) {
    return "Add the first space";
  }
  if (item.id === "approved" && !item.done) {
    return "No spaces approved yet";
  }
  if (item.id === "owner-claimed" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count
      ? `Complete claim on ${count} spaces`
      : "Complete claim on your spaces";
  }
  if (item.id === "awaiting-review" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count
      ? `${count} spaces awaiting admin review`
      : "Spaces awaiting admin review";
  }
  if (item.id === "claim-submit" && item.warning) {
    const match = item.label.match(/^(\d+)/);
    const count = match ? match[1] : "";
    return count
      ? `Submit ${count} spaces for review`
      : "Submit spaces for review";
  }
  if (item.id === "property-linked" && item.done) {
    return item.label;
  }
  return item.label;
}

export function buildReadinessAttentionItems(
  progress: PropertyOnboardingProgress,
  variant: "admin" | "owner",
  hrefById: Record<string, string> = {}
): ReadinessAttentionItem[] {
  return flattenReadinessChecklist(progress, variant)
    .filter((item) => !item.done || item.warning)
    .map((item) => ({
      id: item.id,
      label: readinessAttentionLabel(item),
      filter: HEALTH_FILTER_BY_ITEM_ID[item.id],
      href: hrefById[item.id],
    }));
}

export function buildReadinessCompletedItems(
  progress: PropertyOnboardingProgress,
  variant: "admin" | "owner"
): PropertyOnboardingChecklistItem[] {
  const created = progress.checklist.property.find((item) => item.id === "created");
  const linked = progress.checklist.property.find(
    (item) => item.id === "property-linked"
  );
  const done = flattenReadinessChecklist(progress, variant).filter(
    (item) => item.done && !item.warning
  );

  const prefix: PropertyOnboardingChecklistItem[] = [];
  if (variant === "admin" && created) prefix.push(created);
  if (variant === "owner" && linked) prefix.push(linked);

  return [...prefix, ...done];
}

export type ReadinessBreakdownRow = {
  label: string;
  value: string;
  complete: boolean;
};

export function buildReadinessBreakdown(
  progress: PropertyOnboardingProgress,
  summary: PropertySpacesSummary,
  health: PropertySpacesHealth,
  variant: "admin" | "owner"
): ReadinessBreakdownRow[] {
  const spaceCount = summary.total - summary.archived;
  const pricingItem = progress.checklist.spaces.find((i) => i.id === "space-pricing");
  const photosItem = progress.checklist.spaces.find((i) => i.id === "space-photos");
  const locationItem = progress.checklist.spaces.find((i) => i.id === "space-location");
  const aiItem = progress.checklist.spaces.find((i) => i.id === "space-ai-info");
  const approvedItem = progress.checklist.review.find((i) => i.id === "approved");
  const claimItem = progress.checklist.ownership.find((i) => i.id === "owner-claimed");

  const pricingDone = spaceCount - health.missingPricing;
  const photosDone = spaceCount - health.missingPhotos;
  const locationDone = spaceCount - health.missingLocation;
  const aiDone = spaceCount - health.missingAiInformation;
  const approvedMatch = approvedItem?.label.match(/^(\d+)/);
  const approvedCount = approvedMatch ? Number(approvedMatch[1]) : 0;

  const rows: ReadinessBreakdownRow[] = [
    {
      label: "Pricing",
      value: `${pricingDone}/${spaceCount}`,
      complete: Boolean(pricingItem?.done && !pricingItem.warning),
    },
    {
      label: "Photos",
      value: `${photosDone}/${spaceCount}`,
      complete: Boolean(photosItem?.done && !photosItem.warning),
    },
    {
      label: "Location",
      value: `${locationDone}/${spaceCount}`,
      complete: Boolean(locationItem?.done && !locationItem.warning),
    },
    {
      label: "AI info",
      value: `${aiDone}/${spaceCount}`,
      complete: Boolean(aiItem?.done && !aiItem.warning),
    },
  ];

  if (variant === "admin") {
    const ownerItem = progress.checklist.ownership.find(
      (i) => i.id === "invite-accepted"
    );
    rows.splice(1, 0, {
      label: "Owner accepted",
      value: ownerItem?.done ? "1/1" : "0/1",
      complete: Boolean(ownerItem?.done),
    });
    rows.push({
      label: "Approved spaces",
      value: `${approvedCount}/${spaceCount}`,
      complete: Boolean(approvedItem?.done),
    });
  } else {
    rows.push(
      {
        label: "Claim complete",
        value: claimItem?.done ? `${spaceCount}/${spaceCount}` : `0/${spaceCount}`,
        complete: Boolean(claimItem?.done && !claimItem.warning),
      },
      {
        label: "Approved spaces",
        value: `${approvedCount}/${spaceCount}`,
        complete: Boolean(approvedItem?.done),
      }
    );
  }

  return rows;
}
