import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  buildUnclaimedSpaceRow,
  syncSpaceAttributes,
} from "@/lib/admin-unclaimed-space";
import { validateSpaceCrmLink } from "@/lib/space-crm-link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  const { id: organisationId } = await params;
  const { adminClient, userId } = auth;

  const { data: org, error: orgErr } = await adminClient
    .from("crm_organisations")
    .select("id, name, website, address")
    .eq("id", organisationId)
    .maybeSingle();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Organisation not found." }, { status: 404 });
  }

  const orgRow = org as {
    id: string;
    name: string;
    website?: string | null;
    address?: string | null;
  };

  let body: { contact_id?: string | null; space_type?: string | null } = {};
  try {
    body = ((await req.json()) as typeof body) || {};
  } catch {
    // empty body ok
  }

  const contactId = body.contact_id?.trim() || null;
  if (contactId) {
    const { data: contact } = await adminClient
      .from("crm_contacts")
      .select("id, organisation_id")
      .eq("id", contactId)
      .maybeSingle();
    if (
      !contact ||
      (contact as { organisation_id: string }).organisation_id !== organisationId
    ) {
      return NextResponse.json(
        { error: "Contact does not belong to this organisation." },
        { status: 400 }
      );
    }
  }

  const crmLink = {
    crm_organisation_id: organisationId,
    crm_contact_id: contactId,
  };
  const validated = await validateSpaceCrmLink(adminClient, crmLink);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const insertRow = buildUnclaimedSpaceRow(
    {
      title: orgRow.name,
      description: orgRow.website
        ? `Website: ${orgRow.website}`
        : null,
      street_address: orgRow.address ?? null,
      address_line_1: orgRow.address ?? null,
      space_type: body.space_type ?? "event_space",
      booking_unit: "day",
      ...crmLink,
    },
    userId,
    "draft"
  );

  const { data: inserted, error: insertErr } = await adminClient
    .from("spaces")
    .insert(insertRow)
    .select("id, title, status")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not create listing." },
      { status: 500 }
    );
  }

  const spaceId = (inserted as { id: string }).id;
  await syncSpaceAttributes(adminClient, spaceId, {});

  await adminAudit({
    action: "unclaimed_listing_created_from_crm_org",
    actorUserId: userId,
    targetType: "space",
    targetId: spaceId,
    meta: { crm_organisation_id: organisationId, crm_contact_id: contactId },
  });

  return NextResponse.json({
    ok: true,
    id: spaceId,
    admin_edit_url: `/admin/unclaimed-listings/${spaceId}/edit`,
    space: inserted,
  });
}
