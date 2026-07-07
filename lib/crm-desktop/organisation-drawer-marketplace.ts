import { getBrowserAccessToken } from "@/lib/supabase-browser-session";

export type DrawerMarketplaceListing = {
  id: string;
  title: string | null;
  status: string | null;
  status_label: string;
  city: string | null;
  suburb: string | null;
  property_id?: string | null;
  property_name?: string | null;
  is_bookable?: boolean | null;
  admin_edit_url: string;
  public_url: string | null;
  linked_via?: string;
};

export type DrawerMarketplaceProperty = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
  address?: string;
  owner_name?: string;
  owner_status: string;
  space_count?: number;
  admin_url: string;
};

export type DrawerMarketplaceCounts = {
  linkedPropertyCount: number;
  linkedSpaceCount: number;
  hasLinkedProperties: boolean;
  hasLinkedSpaces: boolean;
};

export type DrawerMarketplaceData = {
  listings: DrawerMarketplaceListing[];
  properties: DrawerMarketplaceProperty[];
  counts: DrawerMarketplaceCounts;
  error: string | null;
};

const EMPTY_COUNTS: DrawerMarketplaceCounts = {
  linkedPropertyCount: 0,
  linkedSpaceCount: 0,
  hasLinkedProperties: false,
  hasLinkedSpaces: false,
};

export async function fetchOrganisationDrawerMarketplace(
  organisationId: string,
  signal?: AbortSignal
): Promise<DrawerMarketplaceData> {
  try {
    const token = await getBrowserAccessToken();
    if (!token) {
      return {
        listings: [],
        properties: [],
        counts: EMPTY_COUNTS,
        error: "Please sign in again.",
      };
    }

    const res = await fetch(
      `/api/space-place/crm/organisations/${organisationId}/listings`,
      { headers: { Authorization: `Bearer ${token}` }, signal }
    );
    const json = (await res.json()) as {
      listings?: DrawerMarketplaceListing[];
      properties?: DrawerMarketplaceProperty[];
      counts?: DrawerMarketplaceCounts;
      error?: string;
    };

    if (!res.ok) {
      return {
        listings: [],
        properties: [],
        counts: EMPTY_COUNTS,
        error: json.error || "Could not load marketplace listings.",
      };
    }

    const counts = json.counts ?? {
      linkedPropertyCount: json.properties?.length || 0,
      linkedSpaceCount: json.listings?.length || 0,
      hasLinkedProperties: (json.properties?.length || 0) > 0,
      hasLinkedSpaces: (json.listings?.length || 0) > 0,
    };

    return {
      listings: json.listings || [],
      properties: json.properties || [],
      counts,
      error: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      listings: [],
      properties: [],
      counts: EMPTY_COUNTS,
      error: "Could not load marketplace listings.",
    };
  }
}

export async function reloadOrganisationDrawerMarketplace(
  organisationId: string
): Promise<DrawerMarketplaceData> {
  return fetchOrganisationDrawerMarketplace(organisationId);
}

export function marketplaceCountsEqual(
  a: DrawerMarketplaceCounts,
  b: DrawerMarketplaceCounts
): boolean {
  return (
    a.linkedPropertyCount === b.linkedPropertyCount &&
    a.linkedSpaceCount === b.linkedSpaceCount &&
    a.hasLinkedProperties === b.hasLinkedProperties &&
    a.hasLinkedSpaces === b.hasLinkedSpaces
  );
}
