import { isUuid } from "@/lib/access/organisation-access-policy";

/**
 * Shared Organisation workspace selection.
 *
 * People & Access is organisation-scoped. Later host pages can reuse the same
 * query param and resolver so the current Organisation stays explicit without
 * a second permission model.
 *
 * Authorisation still happens server-side. This helper only chooses among
 * organisations the existing GET /api/organisations endpoint already returned.
 */

export const ORGANISATION_QUERY_PARAM = "organisation";

export type ManageableOrganisation = {
  id: string;
  name: string;
  status: string;
};

export type OrganisationWorkspaceSelection =
  | { kind: "empty" }
  | {
      kind: "ready";
      organisation: ManageableOrganisation;
      selectable: ManageableOrganisation[];
    }
  | {
      kind: "archived";
      organisation: ManageableOrganisation;
      selectable: ManageableOrganisation[];
    }
  | {
      kind: "unavailable";
      requestedId: string;
      selectable: ManageableOrganisation[];
    };

export function organisationWorkspaceHref(
  pathname: string,
  organisationId: string
): string {
  const params = new URLSearchParams();
  params.set(ORGANISATION_QUERY_PARAM, organisationId);
  return `${pathname}?${params.toString()}`;
}

export function readRequestedOrganisationId(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function selectableOrganisations(
  organisations: ManageableOrganisation[]
): ManageableOrganisation[] {
  return organisations.filter((organisation) => organisation.status === "active");
}

export function resolveOrganisationWorkspaceSelection(input: {
  organisations: ManageableOrganisation[];
  requestedId: string | null;
}): OrganisationWorkspaceSelection {
  const selectable = selectableOrganisations(input.organisations);
  const requestedId = readRequestedOrganisationId(input.requestedId);

  if (requestedId) {
    const match = input.organisations.find(
      (organisation) => organisation.id === requestedId
    );
    if (!match || !isUuid(requestedId)) {
      return { kind: "unavailable", requestedId, selectable };
    }
    if (match.status !== "active") {
      return { kind: "archived", organisation: match, selectable };
    }
    return { kind: "ready", organisation: match, selectable };
  }

  if (selectable.length === 0) {
    return { kind: "empty" };
  }

  return {
    kind: "ready",
    organisation: selectable[0],
    selectable,
  };
}

export function shouldShowOrganisationSelector(
  selectableCount: number
): boolean {
  return selectableCount > 1;
}
