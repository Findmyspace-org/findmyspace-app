import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAudit } from "@/lib/admin-audit";
import { OrganisationCommercialError } from "@/lib/organisation-commercial-error";
import { organisationCommercialActorKind } from "@/lib/organisation-commercial-audit";
import {
  ORGANISATION_PROPERTY_AUDIT,
  organisationPropertyInsertRow,
  organisationPropertyNamesClash,
  organisationPropertyPatchRow,
  type OrganisationPropertyFields,
} from "@/lib/organisation-property";
import { isArchivedProperty } from "@/lib/property-archive";

type PropertyNameRow = {
  id: string;
  name: string;
  archived_at?: string | null;
};

async function listActiveOrganisationPropertyNames(
  admin: SupabaseClient,
  organisationId: string,
  excludePropertyId?: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("properties")
    .select("id, name, archived_at")
    .eq("organisation_id", organisationId);
  if (error) {
    throw new OrganisationCommercialError(500, error.message, "load_failed");
  }
  return ((data || []) as PropertyNameRow[])
    .filter((row) => !isArchivedProperty(row))
    .filter((row) => row.id !== excludePropertyId)
    .map((row) => row.name);
}

export async function createOrganisationProperty(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
    fields: Partial<OrganisationPropertyFields> & { name: string };
  }
): Promise<{ id: string; name: string; organisation_id: string; owner_id: null }> {
  const name = input.fields.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new OrganisationCommercialError(
      400,
      "Property name is required.",
      "name_required"
    );
  }

  const existing = await listActiveOrganisationPropertyNames(
    admin,
    input.organisationId
  );
  if (organisationPropertyNamesClash(name, existing)) {
    throw new OrganisationCommercialError(
      409,
      "A property with this name already exists in this organisation.",
      "duplicate_name"
    );
  }

  const row = organisationPropertyInsertRow(input.organisationId, {
    ...input.fields,
    name,
  });
  const { data, error } = await admin
    .from("properties")
    .insert(row)
    .select("id, name, organisation_id, owner_id")
    .single();

  if (error || !data) {
    throw new OrganisationCommercialError(
      400,
      error?.message || "Could not create property.",
      "property_create_failed"
    );
  }

  const created = data as {
    id: string;
    name: string;
    organisation_id: string;
    owner_id: string | null;
  };

  await adminAudit({
    action: ORGANISATION_PROPERTY_AUDIT.created,
    actorUserId: input.actorUserId,
    targetType: "property",
    targetId: created.id,
    meta: {
      organisation_id: input.organisationId,
      property_id: created.id,
      name: created.name,
      actor_kind: organisationCommercialActorKind(input.isGlobalAdmin),
    },
  });

  return {
    id: created.id,
    name: created.name,
    organisation_id: created.organisation_id,
    owner_id: null,
  };
}

export async function updateOrganisationProperty(
  admin: SupabaseClient,
  input: {
    organisationId: string;
    propertyId: string;
    actorUserId: string;
    isGlobalAdmin: boolean;
    actorKind?: string;
    fields: Partial<OrganisationPropertyFields>;
  }
): Promise<{ id: string; organisation_id: string; owner_id: string | null }> {
  const patch = organisationPropertyPatchRow(input.fields);
  if (Object.keys(patch).length === 0) {
    throw new OrganisationCommercialError(
      400,
      "No fields to update.",
      "empty_patch"
    );
  }

  if (typeof patch.name === "string") {
    const existing = await listActiveOrganisationPropertyNames(
      admin,
      input.organisationId,
      input.propertyId
    );
    if (organisationPropertyNamesClash(patch.name, existing)) {
      throw new OrganisationCommercialError(
        409,
        "A property with this name already exists in this organisation.",
        "duplicate_name"
      );
    }
  }

  delete patch.owner_id;
  delete patch.organisation_id;

  const { data, error } = await admin
    .from("properties")
    .update(patch)
    .eq("id", input.propertyId)
    .eq("organisation_id", input.organisationId)
    .select("id, organisation_id, owner_id")
    .maybeSingle();

  if (error) {
    throw new OrganisationCommercialError(500, error.message, "update_failed");
  }
  if (!data) {
    throw new OrganisationCommercialError(404, "Property not found.", "not_found");
  }

  const updated = data as {
    id: string;
    organisation_id: string;
    owner_id: string | null;
  };

  await adminAudit({
    action: ORGANISATION_PROPERTY_AUDIT.updated,
    actorUserId: input.actorUserId,
    targetType: "property",
    targetId: updated.id,
    meta: {
      organisation_id: input.organisationId,
      property_id: updated.id,
      fields: Object.keys(patch),
      actor_kind:
        input.actorKind ||
        organisationCommercialActorKind(input.isGlobalAdmin),
    },
  });

  return updated;
}

export async function listOrganisationProperties(
  admin: SupabaseClient,
  organisationId: string
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await admin
    .from("properties")
    .select("id, name, archived_at")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });
  if (error) {
    throw new OrganisationCommercialError(500, error.message, "load_failed");
  }
  return ((data || []) as PropertyNameRow[])
    .filter((row) => !isArchivedProperty(row))
    .map((row) => ({ id: row.id, name: row.name }));
}
