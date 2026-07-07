import type { CrmListFilters } from "./types";

export type CrmPresetViewKey =
  | "my-work-today"
  | "overdue-follow-ups"
  | "municipalities"
  | "schools"
  | "properties-without-spaces"
  | "organisations-without-contacts"
  | "no-next-step"
  | "no-follow-up-date"
  | "no-engagement-30-days"
  | "awaiting-response"
  | "ready-to-onboard"
  | "listing-opportunity"
  | "active-discussions"
  | "closed-not-interested";

export type CrmPresetView = {
  key: CrmPresetViewKey;
  label: string;
  description: string;
  scope: "organisations" | "contacts" | "pipeline" | "activities" | "spaces";
  filters: Partial<CrmListFilters>;
};

export const CRM_PRESET_VIEWS: CrmPresetView[] = [
  {
    key: "my-work-today",
    label: "My work today",
    description: "Open tasks due today",
    scope: "activities",
    filters: { bucket: "today" },
  },
  {
    key: "overdue-follow-ups",
    label: "Overdue follow-ups",
    description: "Tasks past due date",
    scope: "activities",
    filters: { bucket: "overdue" },
  },
  {
    key: "municipalities",
    label: "Municipalities",
    description: "Organisation type municipality",
    scope: "organisations",
    filters: { organisationType: "municipality" },
  },
  {
    key: "schools",
    label: "Schools",
    description: "Organisation type school",
    scope: "organisations",
    filters: { organisationType: "school" },
  },
  {
    key: "properties-without-spaces",
    label: "Properties without spaces",
    description: "No linked marketplace spaces or properties",
    scope: "organisations",
    filters: { noSpaces: true },
  },
  {
    key: "organisations-without-contacts",
    label: "Organisations without contacts",
    description: "No CRM contacts linked",
    scope: "organisations",
    filters: { noContact: true },
  },
  {
    key: "no-next-step",
    label: "No next step",
    description: "No open follow-up task",
    scope: "organisations",
    filters: { noNextStep: true },
  },
  {
    key: "no-follow-up-date",
    label: "No follow-up date",
    description: "Open task exists but no due date",
    scope: "organisations",
    filters: { noFollowUpDate: true },
  },
  {
    key: "no-engagement-30-days",
    label: "No engagement in 30 days",
    description: "No recorded interaction recently",
    scope: "organisations",
    filters: { staleInteraction: true },
  },
  {
    key: "awaiting-response",
    label: "Awaiting response",
    description: "Follow-up stage pipeline",
    scope: "pipeline",
    filters: { pipelineStage: "follow_up" },
  },
  {
    key: "ready-to-onboard",
    label: "Ready to onboard",
    description: "Signed up but not yet listed",
    scope: "pipeline",
    filters: { pipelineStage: "signed_up" },
  },
  {
    key: "listing-opportunity",
    label: "Listing opportunity",
    description: "In progress pipeline",
    scope: "pipeline",
    filters: { pipelineStage: "in_progress" },
  },
  {
    key: "active-discussions",
    label: "Active discussions",
    description: "First contact or in progress",
    scope: "pipeline",
    filters: { pipelineStage: "first_contact" },
  },
  {
    key: "closed-not-interested",
    label: "Closed / not interested",
    description: "Closed or lost pipeline stage",
    scope: "pipeline",
    filters: { pipelineStage: "closed_lost" },
  },
];

export function getCrmPresetView(
  key: string | null | undefined
): CrmPresetView | undefined {
  if (!key) return undefined;
  return CRM_PRESET_VIEWS.find((view) => view.key === key);
}

export function presetFiltersToSearchParams(
  preset: CrmPresetView
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("preset", preset.key);
  const f = preset.filters;
  if (f.q) params.set("q", f.q);
  if (f.assignedTo) params.set("assigned", f.assignedTo);
  if (f.pipelineStage) params.set("stage", f.pipelineStage);
  if (f.organisationType) params.set("type", f.organisationType);
  if (f.overdue) params.set("overdue", "1");
  if (f.noNextStep) params.set("no_next", "1");
  if (f.noContact) params.set("no_contact", "1");
  if (f.noSpaces) params.set("no_spaces", "1");
  if (f.noFollowUpDate) params.set("no_follow_up", "1");
  if (f.noEmail) params.set("no_email", "1");
  if (f.noPhone) params.set("no_phone", "1");
  if (f.staleInteraction) params.set("stale", "1");
  if (f.bucket) params.set("bucket", f.bucket);
  if (f.sort) params.set("sort", f.sort);
  if (f.sortDir) params.set("dir", f.sortDir);
  return params;
}

/** URL search-param keys owned by a preset's filters (including `preset`). */
export function presetSearchParamKeys(preset: CrmPresetView): string[] {
  const keys = ["preset"];
  const f = preset.filters;
  if (f.q) keys.push("q");
  if (f.assignedTo) keys.push("assigned");
  if (f.pipelineStage) keys.push("stage");
  if (f.organisationType) keys.push("type");
  if (f.overdue) keys.push("overdue");
  if (f.noNextStep) keys.push("no_next");
  if (f.noContact) keys.push("no_contact");
  if (f.noSpaces) keys.push("no_spaces");
  if (f.noFollowUpDate) keys.push("no_follow_up");
  if (f.noEmail) keys.push("no_email");
  if (f.noPhone) keys.push("no_phone");
  if (f.staleInteraction) keys.push("stale");
  if (f.bucket) keys.push("bucket");
  if (f.sort) keys.push("sort");
  if (f.sortDir) keys.push("dir");
  return keys;
}

/**
 * Remove the active preset and only the filter params it introduced.
 * Preserves `view`, user search, and other unrelated query params.
 */
export function clearActivePresetSearchParams(
  current: URLSearchParams,
  presetKey: string | null | undefined
): URLSearchParams {
  const preset = getCrmPresetView(presetKey);
  const next = new URLSearchParams(current.toString());

  if (!preset) {
    next.delete("preset");
    return next;
  }

  for (const key of presetSearchParamKeys(preset)) {
    next.delete(key);
  }

  next.delete("page");
  next.delete("boardPage");

  return next;
}
