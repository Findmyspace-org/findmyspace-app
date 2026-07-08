export const COMPLETED_ACTIONS_HELPER_TEXT =
  "Record important things that have already been done. These actions are optional and do not form a required workflow.";

export type CompletedActionScope = "organisation" | "property" | "space";

export type StandardCompletedActionDef = {
  key: string;
  label: string;
  scope: CompletedActionScope;
  quick?: boolean;
};

export const STANDARD_COMPLETED_ACTIONS: StandardCompletedActionDef[] = [
  // Organisation-level
  { key: "initial_email_sent", label: "Initial email sent", scope: "organisation", quick: true },
  { key: "first_contact_made", label: "First contact made", scope: "organisation", quick: true },
  { key: "one_on_one_completed", label: "One-on-one meeting completed", scope: "organisation", quick: true },
  { key: "information_pack_sent", label: "Information pack sent", scope: "organisation" },
  { key: "follow_up_completed", label: "Follow-up completed", scope: "organisation" },
  { key: "pricing_discussed", label: "Pricing discussed", scope: "organisation" },
  { key: "claim_link_sent", label: "Claim link sent", scope: "organisation", quick: true },
  { key: "owner_registered", label: "Owner registered", scope: "organisation" },
  // Property-level
  { key: "unclaimed_property_created", label: "Unclaimed property created", scope: "property", quick: true },
  { key: "property_shared", label: "Property shared", scope: "property", quick: true },
  { key: "property_claimed", label: "Property claimed", scope: "property" },
  { key: "property_information_completed", label: "Property information completed", scope: "property" },
  { key: "property_published", label: "Property published", scope: "property", quick: true },
  // Space-level
  { key: "unclaimed_space_created", label: "Unclaimed space created", scope: "space", quick: true },
  { key: "space_shared", label: "Space shared", scope: "space", quick: true },
  { key: "photos_received", label: "Photos received", scope: "space", quick: true },
  { key: "pricing_confirmed", label: "Pricing confirmed", scope: "space" },
  { key: "capacity_confirmed", label: "Capacity confirmed", scope: "space" },
  { key: "amenities_confirmed", label: "Amenities confirmed", scope: "space" },
  { key: "space_claimed", label: "Space claimed", scope: "space" },
  { key: "space_approved", label: "Space approved", scope: "space" },
  { key: "space_published", label: "Space published", scope: "space", quick: true },
];

const STANDARD_BY_KEY = new Map(
  STANDARD_COMPLETED_ACTIONS.map((action) => [action.key, action])
);

export function getStandardCompletedAction(key: string | null | undefined) {
  if (!key) return null;
  return STANDARD_BY_KEY.get(key) ?? null;
}

export function standardActionsForScope(scope: CompletedActionScope) {
  return STANDARD_COMPLETED_ACTIONS.filter((a) => a.scope === scope);
}

export function quickStandardActionsForScope(scope: CompletedActionScope) {
  return standardActionsForScope(scope).filter((a) => a.quick);
}

export function sanitizeCompletedActionLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function isFutureCompletedAt(iso: string, now = new Date()): boolean {
  const completed = new Date(iso);
  if (Number.isNaN(completed.getTime())) return true;
  // Allow a small clock skew window (2 minutes).
  return completed.getTime() > now.getTime() + 2 * 60_000;
}

export type CompletedActionSubject = {
  organisationId: string;
  propertyId?: string | null;
  spaceId?: string | null;
};

export function subjectScope(subject: CompletedActionSubject): CompletedActionScope {
  if (subject.spaceId) return "space";
  if (subject.propertyId) return "property";
  return "organisation";
}

export function formatCompletedActionTimelineSummary(input: {
  actorName: string;
  actionLabel: string;
}): string {
  return `${input.actorName} marked '${input.actionLabel}' as completed.`;
}

export const COMPLETED_ACTION_AUDIT_ACTIONS = [
  "completed_action_added",
  "standard_action_marked_done",
  "completed_action_edited",
  "completed_action_removed",
  "completed_action_property_changed",
  "completed_action_space_changed",
  "completed_action_date_changed",
] as const;

export type CompletedActionAuditAction =
  (typeof COMPLETED_ACTION_AUDIT_ACTIONS)[number];
