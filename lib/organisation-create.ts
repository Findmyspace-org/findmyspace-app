import type { SupabaseClient } from "@supabase/supabase-js";
import { OrganisationCommercialError } from "@/lib/organisation-commercial-error";
import { normalizeOrganisationAccessEmail } from "@/lib/access/organisation-access-email";
import { adminAudit } from "@/lib/admin-audit";
import {
  ORGANISATION_COMMERCIAL_AUDIT,
  organisationCommercialActorKind,
  organisationCommercialAuditEvent,
} from "@/lib/organisation-commercial-audit";
import type { OrganisationType } from "@/lib/organisation-commercial-dto";
import { ORGANISATION_TYPES } from "@/lib/organisation-commercial-dto";

export function normalizeOrganisationName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function slugifyOrganisationName(name: string): string {
  const slug = normalizeOrganisationName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "organisation";
}

export async function findLikelyOrganisationDuplicate(
  admin: SupabaseClient,
  input: { name: string; registrationNumber?: string | null }
): Promise<{ id: string; name: string; slug: string | null } | null> {
  const normalized = normalizeOrganisationName(input.name);
  const slug = slugifyOrganisationName(input.name);
  const { data: organisations, error } = await admin
    .from("organisations")
    .select("id, name, slug, status")
    .eq("status", "active");
  if (error) {
    throw new OrganisationCommercialError(500, error.message, "load_failed");
  }
  const nameMatch = (
    (organisations || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      status: string;
    }>
  ).find(
    (row) =>
      normalizeOrganisationName(row.name) === normalized ||
      (row.slug && row.slug === slug)
  );
  if (nameMatch) return nameMatch;

  const registration = input.registrationNumber?.trim();
  if (!registration) return null;
  const { data: profile } = await admin
    .from("organisation_commercial_profiles")
    .select("organisation_id, registration_number")
    .eq("registration_number", registration)
    .maybeSingle();
  if (!profile) return null;
  const { data: org } = await admin
    .from("organisations")
    .select("id, name, slug")
    .eq("id", (profile as { organisation_id: string }).organisation_id)
    .maybeSingle();
  return (org as { id: string; name: string; slug: string | null } | null) ?? null;
}

export async function createOrganisationWithCommercialProfile(
  admin: SupabaseClient,
  input: {
    actorUserId: string;
    actorEmail: string | null;
    name: string;
    organisationType?: string | null;
    registrationNumber?: string | null;
    isGlobalAdmin: boolean;
  }
): Promise<{ id: string; name: string; slug: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new OrganisationCommercialError(
      400,
      "Organisation name is required.",
      "name_required"
    );
  }

  const organisationType = input.organisationType?.trim() || null;
  if (
    organisationType &&
    !ORGANISATION_TYPES.includes(organisationType as OrganisationType)
  ) {
    throw new OrganisationCommercialError(
      400,
      "Invalid organisation type.",
      "invalid_type"
    );
  }

  const duplicate = await findLikelyOrganisationDuplicate(admin, {
    name,
    registrationNumber: input.registrationNumber,
  });
  if (duplicate) {
    throw new OrganisationCommercialError(
      409,
      "An organisation with this name may already exist on FindMySpace. Request access instead of creating a duplicate.",
      input.isGlobalAdmin ? `duplicate:${duplicate.id}` : "duplicate"
    );
  }

  let slug = slugifyOrganisationName(name);
  const { data: slugRow } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugRow) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const { data: organisation, error: orgError } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      status: "active",
      created_by: input.actorUserId,
    })
    .select("id, name, slug")
    .single();

  if (orgError || !organisation) {
    throw new OrganisationCommercialError(
      400,
      orgError?.message || "Could not create organisation.",
      "create_failed"
    );
  }

  const org = organisation as { id: string; name: string; slug: string };

  const { error: profileError } = await admin
    .from("organisation_commercial_profiles")
    .insert({
      organisation_id: org.id,
      legal_name: name,
      organisation_type: organisationType,
      registration_number: input.registrationNumber?.trim() || null,
      verification_status: "pending",
    });

  if (profileError) {
    await admin.from("organisations").delete().eq("id", org.id);
    throw new OrganisationCommercialError(
      400,
      profileError.message,
      "profile_create_failed"
    );
  }

  const email =
    normalizeOrganisationAccessEmail(input.actorEmail) ||
    `user-${input.actorUserId.slice(0, 8)}@users.findmyspace.invalid`;

  const { error: grantError } = await admin.from("organisation_access").insert({
    organisation_id: org.id,
    role: "org_admin",
    property_id: null,
    space_id: null,
    user_id: input.actorUserId,
    email,
    email_normalized: email,
    status: "active",
    is_primary: false,
    notify_all_bookings: true,
    invited_by: input.actorUserId,
    activated_at: new Date().toISOString(),
  });

  if (grantError) {
    await admin.from("organisations").delete().eq("id", org.id);
    throw new OrganisationCommercialError(
      400,
      grantError.message,
      "access_create_failed"
    );
  }

  await adminAudit(
    organisationCommercialAuditEvent({
      action: ORGANISATION_COMMERCIAL_AUDIT.created,
      actorUserId: input.actorUserId,
      actorKind: organisationCommercialActorKind(input.isGlobalAdmin),
      organisationId: org.id,
      next: { name: org.name, slug: org.slug, verification_status: "pending" },
    })
  );

  return org;
}
