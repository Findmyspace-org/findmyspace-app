import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { adminListingStatusLabel } from "@/lib/admin-listing-status-display";
import { contactDisplayName } from "@/lib/space-crm-link";

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

  const { id: contactId } = await params;
  const { adminClient } = auth;

  const { data: contact, error: contactErr } = await adminClient
    .from("crm_contacts")
    .select("id, organisation_id, full_name, first_name, last_name")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr || !contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const row = contact as {
    id: string;
    organisation_id: string;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };

  const { data, error } = await adminClient
    .from("spaces")
    .select(
      "id, title, status, city, suburb, space_type, created_at, crm_organisation_id, crm_contact_id"
    )
    .or(
      `crm_contact_id.eq.${contactId},and(crm_organisation_id.eq.${row.organisation_id},crm_contact_id.is.null)`
    )
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
    crm_contact_id: string | null;
  }[]).map((listing) => ({
    ...listing,
    status_label: adminListingStatusLabel(listing.status),
    linked_via:
      listing.crm_contact_id === contactId ? "contact" : "organisation",
    admin_edit_url: `/admin/unclaimed-listings/${listing.id}/edit`,
    public_url:
      listing.status === "unclaimed" || listing.status === "active"
        ? `/spaces/${listing.id}`
        : null,
  }));

  return NextResponse.json({
    contact: {
      id: row.id,
      display_name: contactDisplayName(row),
      organisation_id: row.organisation_id,
    },
    listings,
  });
}
