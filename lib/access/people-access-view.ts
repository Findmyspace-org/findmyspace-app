/**
 * People & Access list presentation.
 *
 * Status semantics stay in organisation_access. This helper only decides which
 * historical vs current rows belong in each tab.
 */

export const PEOPLE_STATUS_FILTERS = [
  "all",
  "active",
  "pending",
  "revoked",
] as const;

export type PeopleStatusFilter = (typeof PEOPLE_STATUS_FILTERS)[number];

export type PeopleAccessStatusView = {
  id: string;
  status: string;
};

const CURRENT_STATUSES = new Set(["active", "pending"]);

export function isHistoricalPeopleAccess(status: string): boolean {
  return status === "revoked";
}

export function peopleAccessAllowsManagement(status: string): boolean {
  return status === "active" || status === "pending";
}

export function filterPeopleAccessGrants<T extends PeopleAccessStatusView>(
  grants: T[],
  filter: PeopleStatusFilter
): T[] {
  if (filter === "all") {
    return grants.filter((grant) => CURRENT_STATUSES.has(grant.status));
  }
  return grants.filter((grant) => grant.status === filter);
}
