/** Admin unclaimed listings overview — status labels and filter groups. */

export type AdminListingFilterKey =
  | "all"
  | "draft"
  | "unclaimed"
  | "claimed"
  | "review"
  | "active";

export const ADMIN_LISTING_OVERVIEW_STATUSES = [
  "draft",
  "unclaimed",
  "owner_claimed",
  "pending_verification",
  "pending",
  "needs_changes",
  "rejected",
  "active",
  "paused",
] as const;

const REVIEW_STATUSES = new Set([
  "pending_verification",
  "pending",
  "needs_changes",
  "rejected",
]);

const ACTIVE_STATUSES = new Set(["active", "paused"]);

export function adminListingStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "unclaimed":
      return "Unclaimed";
    case "owner_claimed":
      return "Owner Claimed";
    case "pending_verification":
    case "pending":
      return "Pending Review";
    case "needs_changes":
      return "Needs Changes";
    case "rejected":
      return "Rejected";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "deleted":
      return "Archived";
    default:
      return status || "Unknown";
  }
}

export function adminListingStatusBadgeClass(status: string | null | undefined): string {
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (status) {
    case "unclaimed":
      return `${base} bg-amber-100 text-amber-900`;
    case "draft":
      return `${base} bg-gray-100 text-gray-700`;
    case "owner_claimed":
      return `${base} bg-blue-100 text-blue-800`;
    case "pending_verification":
    case "pending":
      return `${base} bg-violet-100 text-violet-800`;
    case "needs_changes":
      return `${base} bg-orange-100 text-orange-900`;
    case "rejected":
      return `${base} bg-red-100 text-red-800`;
    case "active":
      return `${base} bg-green-100 text-green-800`;
    case "paused":
      return `${base} bg-slate-100 text-slate-700`;
    case "deleted":
      return `${base} bg-stone-200 text-stone-800`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}

export function matchesAdminListingFilter(
  status: string | null | undefined,
  filter: AdminListingFilterKey
): boolean {
  if (filter === "all") return true;
  if (filter === "draft") return status === "draft";
  if (filter === "unclaimed") return status === "unclaimed";
  if (filter === "claimed") return status === "owner_claimed";
  if (filter === "review") return REVIEW_STATUSES.has(status || "");
  if (filter === "active") return ACTIVE_STATUSES.has(status || "");
  return true;
}

export const ADMIN_LISTING_FILTER_OPTIONS: { key: AdminListingFilterKey; label: string }[] =
  [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "unclaimed", label: "Unclaimed" },
    { key: "claimed", label: "Claimed" },
    { key: "review", label: "Review" },
    { key: "active", label: "Active" },
  ];
