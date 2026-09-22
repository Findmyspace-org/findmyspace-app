import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveHostingOrganisationId,
  type HostingAccessSummary,
} from "@/lib/access/hosting-access";
import { loadHostingAccessSummary } from "@/lib/access/load-hosting-access";
import { listManagedPropertyIds } from "@/lib/access/list-managed-properties";
import { listManagedSpaceIds } from "@/lib/access/list-managed-spaces";
import { isUuid } from "@/lib/access/organisation-access-policy";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";

/**
 * Resolved Hosting workspace context.
 *
 * Organisation: inventory whose property.organisation_id matches.
 * Personal: inventory whose property.organisation_id is null.
 * Unavailable: explicit unauthorised organisation query — empty, no fallback.
 * None: no organisation and no personal-host authority.
 */
export type HostingContextKind =
  | "organisation"
  | "personal"
  | "unavailable"
  | "none";

export type HostingContext = {
  kind: HostingContextKind;
  organisationId: string | null;
};

export type ResolveHostingContextInput = {
  requestedId: string | null | undefined;
  organisationIds: string[];
  primaryOrganisationId: string | null;
  isLegacyHost: boolean;
  isGlobalAdmin?: boolean;
};

export function requestedOrganisationIsAuthorised(input: {
  requestedId: string;
  organisationIds: string[];
  isGlobalAdmin?: boolean;
}): boolean {
  if (input.organisationIds.includes(input.requestedId)) return true;
  return Boolean(input.isGlobalAdmin) && isUuid(input.requestedId);
}

export function resolveHostingContext(
  input: ResolveHostingContextInput
): HostingContext {
  const requested = input.requestedId?.trim() || "";
  if (requested) {
    if (
      requestedOrganisationIsAuthorised({
        requestedId: requested,
        organisationIds: input.organisationIds,
        isGlobalAdmin: input.isGlobalAdmin,
      })
    ) {
      return { kind: "organisation", organisationId: requested };
    }
    return { kind: "unavailable", organisationId: null };
  }

  if (input.primaryOrganisationId) {
    return {
      kind: "organisation",
      organisationId: input.primaryOrganisationId,
    };
  }

  if (input.isLegacyHost) {
    return { kind: "personal", organisationId: null };
  }

  return { kind: "none", organisationId: null };
}

export function hostingContextFromSummary(
  summary: HostingAccessSummary,
  requestedId: string | null | undefined
): HostingContext {
  return resolveHostingContext({
    requestedId,
    organisationIds: summary.organisationIds,
    primaryOrganisationId: summary.primaryOrganisationId,
    isLegacyHost: summary.isLegacyHost,
    isGlobalAdmin: summary.isGlobalAdmin,
  });
}

/**
 * Organisation membership is properties.organisation_id.
 * A populated properties.owner_id never makes an organisation property personal.
 */
export function propertyMatchesHostingContext(
  propertyOrganisationId: string | null | undefined,
  context: HostingContext
): boolean {
  if (context.kind === "unavailable" || context.kind === "none") return false;
  const organisationId = propertyOrganisationId?.trim() || null;
  if (context.kind === "organisation") {
    return organisationId === context.organisationId;
  }
  return organisationId === null;
}

export function filterRowsForHostingContext<T>(
  rows: T[],
  context: HostingContext,
  organisationIdOf: (row: T) => string | null | undefined
): T[] {
  return rows.filter((row) =>
    propertyMatchesHostingContext(organisationIdOf(row), context)
  );
}

export function requestedOrganisationFromSearchParams(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string | null {
  const value = searchParams.get(ORGANISATION_QUERY_PARAM)?.trim() || "";
  return value || null;
}

export async function resolveRequestHostingContext(
  admin: SupabaseClient,
  userId: string,
  requestedId: string | null | undefined
): Promise<{ summary: HostingAccessSummary; context: HostingContext }> {
  const summary = await loadHostingAccessSummary(admin, userId);
  return {
    summary,
    context: hostingContextFromSummary(summary, requestedId),
  };
}

export async function listManagedSpaceIdsForHostingContext(
  admin: SupabaseClient,
  userId: string,
  context: HostingContext,
  options?: { isGlobalAdmin?: boolean }
): Promise<string[]> {
  if (context.kind === "unavailable" || context.kind === "none") return [];

  const ids = new Set(await listManagedSpaceIds(admin, userId));

  if (
    options?.isGlobalAdmin &&
    context.kind === "organisation" &&
    context.organisationId
  ) {
    const { data: orgProperties } = await admin
      .from("properties")
      .select("id")
      .eq("organisation_id", context.organisationId);
    const propertyIds = (
      (orgProperties || []) as Array<{ id: string }>
    ).map((row) => row.id);
    if (propertyIds.length > 0) {
      const { data: orgSpaces } = await admin
        .from("spaces")
        .select("id")
        .in("property_id", propertyIds);
      for (const row of (orgSpaces || []) as Array<{ id: string }>) {
        ids.add(row.id);
      }
    }
  }

  if (ids.size === 0) return [];

  const { data: spaces } = await admin
    .from("spaces")
    .select("id, property_id")
    .in("id", Array.from(ids));

  const propertyIds = Array.from(
    new Set(
      ((spaces || []) as Array<{ property_id: string | null }>)
        .map((row) => row.property_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const organisationIdByProperty = new Map<string, string | null>();
  if (propertyIds.length > 0) {
    const { data: properties } = await admin
      .from("properties")
      .select("id, organisation_id")
      .in("id", propertyIds);
    for (const row of (properties || []) as Array<{
      id: string;
      organisation_id: string | null;
    }>) {
      organisationIdByProperty.set(row.id, row.organisation_id);
    }
  }

  return ((spaces || []) as Array<{ id: string; property_id: string | null }>)
    .filter((space) =>
      propertyMatchesHostingContext(
        space.property_id
          ? organisationIdByProperty.get(space.property_id) ?? null
          : null,
        context
      )
    )
    .map((space) => space.id);
}

export async function listManagedPropertyIdsForHostingContext(
  admin: SupabaseClient,
  userId: string,
  context: HostingContext,
  options?: { isGlobalAdmin?: boolean }
): Promise<string[]> {
  if (context.kind === "unavailable" || context.kind === "none") return [];

  const ids = new Set(await listManagedPropertyIds(admin, userId));

  if (
    options?.isGlobalAdmin &&
    context.kind === "organisation" &&
    context.organisationId
  ) {
    const { data: orgProperties } = await admin
      .from("properties")
      .select("id")
      .eq("organisation_id", context.organisationId);
    for (const row of (orgProperties || []) as Array<{ id: string }>) {
      ids.add(row.id);
    }
  }

  if (ids.size === 0) return [];

  const { data: properties } = await admin
    .from("properties")
    .select("id, organisation_id")
    .in("id", Array.from(ids));

  return filterRowsForHostingContext(
    (properties || []) as Array<{ id: string; organisation_id: string | null }>,
    context,
    (row) => row.organisation_id
  ).map((row) => row.id);
}

export function hostingContextOrganisationId(
  context: HostingContext
): string | null {
  return context.kind === "organisation" ? context.organisationId : null;
}

/**
 * Query param to preserve on Hosting links.
 * Unavailable explicit requests keep the requested id so navigation cannot
 * silently fall back to another organisation's inventory.
 */
export function hostingContextHrefOrganisationId(
  context: HostingContext,
  requestedId?: string | null
): string | null {
  if (context.kind === "organisation") return context.organisationId;
  if (context.kind === "unavailable") {
    const requested = requestedId?.trim() || "";
    return requested || null;
  }
  return null;
}

/** @deprecated Prefer resolveHostingContext; kept for href/default selection. */
export function resolvedOrganisationIdFromContext(
  input: ResolveHostingContextInput
): string | null {
  return hostingContextOrganisationId(resolveHostingContext(input));
}

export { resolveHostingOrganisationId, ORGANISATION_QUERY_PARAM };
