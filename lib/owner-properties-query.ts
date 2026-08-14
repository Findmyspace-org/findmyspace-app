import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isArchivedProperty,
  mapPropertyArchiveMigrationError,
} from "@/lib/property-archive";

const PROPERTY_LIST_SELECT =
  "id, name, city, suburb, address_line1, province, owner_accepted_at, created_at";

export function isPropertyArchiveColumnMissingError(message: string): boolean {
  return /column .*archived_at.* does not exist|could not find the .*archived_at/i.test(
    message
  );
}

export type OwnerPropertyAccessRole = "owner" | "manager";

export type OwnerPropertyRow = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
  address_line1: string | null;
  province: string | null;
  owner_accepted_at: string | null;
  created_at: string | null;
  archived_at?: string | null;
  access_role?: OwnerPropertyAccessRole;
};

export type FetchOwnerPropertiesResult =
  | {
      ok: true;
      properties: OwnerPropertyRow[];
      migrationWarning?: string;
    }
  | { ok: false; error: string; status?: number };

async function fetchPropertyList(
  client: SupabaseClient,
  filter: { ownerId?: string; ids?: string[] }
): Promise<FetchOwnerPropertiesResult> {
  if (filter.ids && filter.ids.length === 0) {
    return { ok: true, properties: [] };
  }

  let query = client
    .from("properties")
    .select(`${PROPERTY_LIST_SELECT}, archived_at`)
    .order("name", { ascending: true });
  if (filter.ownerId) query = query.eq("owner_id", filter.ownerId);
  if (filter.ids) query = query.in("id", filter.ids);

  const { data, error } = await query.is("archived_at", null);
  if (!error) {
    return { ok: true, properties: (data || []) as OwnerPropertyRow[] };
  }

  if (!isPropertyArchiveColumnMissingError(error.message)) {
    return { ok: false, error: error.message, status: 500 };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error: mapPropertyArchiveMigrationError(error.message),
      status: 503,
    };
  }

  let fallbackQuery = client
    .from("properties")
    .select(PROPERTY_LIST_SELECT)
    .order("name", { ascending: true });
  if (filter.ownerId) fallbackQuery = fallbackQuery.eq("owner_id", filter.ownerId);
  if (filter.ids) fallbackQuery = fallbackQuery.in("id", filter.ids);

  const fallback = await fallbackQuery;
  if (fallback.error) {
    return { ok: false, error: fallback.error.message, status: 500 };
  }

  return {
    ok: true,
    properties: (fallback.data || []) as OwnerPropertyRow[],
    migrationWarning:
      "Property archive migration (049) is not applied locally. Run supabase db push. Archived properties are not filtered until then.",
  };
}

export async function fetchOwnerPropertiesForUser(
  client: SupabaseClient,
  userId: string
): Promise<FetchOwnerPropertiesResult> {
  const ownedResult = await fetchPropertyList(client, { ownerId: userId });
  if (!ownedResult.ok) return ownedResult;

  let managedPropertyIds: string[] = [];
  try {
    const { data: assignments } = await client
      .from("space_manager_assignments")
      .select("space_id")
      .eq("user_id", userId);
    const assignedSpaceIds = [
      ...new Set(
        ((assignments as { space_id: string }[]) || []).map((row) => row.space_id)
      ),
    ];
    if (assignedSpaceIds.length > 0) {
      const { data: spaces } = await client
        .from("spaces")
        .select("property_id")
        .in("id", assignedSpaceIds);
      managedPropertyIds = [
        ...new Set(
          ((spaces as { property_id: string | null }[]) || [])
            .map((row) => row.property_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
    }
  } catch {
    managedPropertyIds = [];
  }

  const ownedIds = new Set(ownedResult.properties.map((row) => row.id));
  const extraIds = managedPropertyIds.filter((id) => !ownedIds.has(id));
  const extra = extraIds.length
    ? await fetchPropertyList(client, { ids: extraIds })
    : { ok: true as const, properties: [] as OwnerPropertyRow[] };
  if (!extra.ok) return extra;

  return {
    ok: true,
    properties: [
      ...ownedResult.properties.map((row) => ({ ...row, access_role: "owner" as const })),
      ...extra.properties.map((row) => ({ ...row, access_role: "manager" as const })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    migrationWarning: ownedResult.migrationWarning || extra.migrationWarning,
  };
}

export async function fetchOwnerPropertyById(
  client: SupabaseClient,
  propertyId: string
): Promise<
  | { ok: true; property: Record<string, unknown> }
  | { ok: false; error: string; status: number }
> {
  const withArchive = await client
    .from("properties")
    .select(
      "id, name, description, address_line1, suburb, city, province, postal_code, country, owner_accepted_at, owner_id, archived_at, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (!withArchive.error && withArchive.data) {
    if (isArchivedProperty(withArchive.data as { archived_at?: string | null })) {
      return { ok: false, error: "Property not found.", status: 404 };
    }
    return { ok: true, property: withArchive.data as Record<string, unknown> };
  }

  if (
    withArchive.error &&
    !isPropertyArchiveColumnMissingError(withArchive.error.message)
  ) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error: mapPropertyArchiveMigrationError(
        withArchive.error?.message || "Property archive schema missing."
      ),
      status: 503,
    };
  }

  const fallback = await client
    .from("properties")
    .select(
      "id, name, description, address_line1, suburb, city, province, postal_code, country, owner_accepted_at, owner_id, terms_title, terms_text, terms_document_url, require_terms_acceptance, terms_acceptance_label, terms_updated_at"
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (fallback.error || !fallback.data) {
    return { ok: false, error: "Property not found.", status: 404 };
  }

  return { ok: true, property: fallback.data as Record<string, unknown> };
}
