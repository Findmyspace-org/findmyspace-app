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

type OwnerPropertyRow = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
  address_line1: string | null;
  province: string | null;
  owner_accepted_at: string | null;
  created_at: string | null;
  archived_at?: string | null;
};

export type FetchOwnerPropertiesResult =
  | {
      ok: true;
      properties: OwnerPropertyRow[];
      migrationWarning?: string;
    }
  | { ok: false; error: string; status?: number };

export async function fetchOwnerPropertiesForUser(
  client: SupabaseClient,
  userId: string
): Promise<FetchOwnerPropertiesResult> {
  const base = () =>
    client
      .from("properties")
      .select(`${PROPERTY_LIST_SELECT}, archived_at`)
      .eq("owner_id", userId)
      .order("name", { ascending: true });

  const { data, error } = await base().is("archived_at", null);

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

  const fallback = await client
    .from("properties")
    .select(PROPERTY_LIST_SELECT)
    .eq("owner_id", userId)
    .order("name", { ascending: true });

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
