import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";
import { adminCanonicalSpaceEditHref } from "@/lib/admin-listing-routing";

const LISTING_STATUSES = [
  "draft",
  "unclaimed",
  "owner_claimed",
  "pending_verification",
  "needs_changes",
  "approved",
  "pending",
  "active",
  "paused",
  "rejected",
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  const { id: organisationId } = await params;
  const { adminClient } = auth;

  const { data: org, error: orgErr } = await adminClient
    .from("crm_organisations")
    .select("id, name")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  const { data, error } = await adminClient
    .from("spaces")
    .select(
      "id, title, status, city, suburb, space_type, created_at, crm_organisation_id, crm_contact_id"
    )
    .eq("crm_organisation_id", organisationId)
    .in("status", [...LISTING_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const listings = ((data || []) as {
    id: string;
    title: string | null;
    status: string | null;
    city: string | null;
    suburb: string | null;
    space_type: string | null;
    created_at: string;
  }[]).map((row) => ({
    ...row,
    status_label: adminListingStatusLabel(row.status),
    admin_edit_url: adminCanonicalSpaceEditHref(row.id, {
      returnTo: "/admin/unclaimed-listings",
    }),
    public_url:
      row.status === "unclaimed" || row.status === "active"
        ? `/spaces/${row.id}`
        : null,
  }));

  const { data: properties, error: propertiesErr } = await adminClient
    .from("properties")
    .select("id, name, city, suburb, owner_email, owner_accepted_at, created_at")
    .eq("crm_organisation_id", organisationId)
    .order("name", { ascending: true });

  if (propertiesErr) {
    return NextResponse.json({ error: propertiesErr.message }, { status: 500 });
  }

  const propertyRows = ((properties || []) as {
    id: string;
    name: string;
    city: string | null;
    suburb: string | null;
    owner_email: string | null;
    owner_accepted_at: string | null;
    created_at: string;
  }[]).map((row) => ({
    ...row,
    admin_url: `/admin/properties/${row.id}`,
    owner_status: row.owner_accepted_at ? "Owner accepted" : row.owner_email ? "Invited" : "No owner",
  }));

  return NextResponse.json({ organisation: org, listings, properties: propertyRows });
}
