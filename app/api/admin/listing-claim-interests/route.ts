import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { enrichSpacesWithCrmSummaries } from "@/lib/space-crm-link";
import { adminCanonicalSpaceEditHref } from "@/lib/admin-listing-routing";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const statusFilter = req.nextUrl.searchParams.get("status")?.trim();
  const allowed = ["new", "contacted", "claim_link_sent", "closed"] as const;

  let query = admin
    .from("listing_claim_interests")
    .select(
      `
      id,
      listing_id,
      name,
      email,
      phone,
      role,
      message,
      status,
      created_at,
      spaces (
        id,
        title,
        status,
        city,
        suburb,
        crm_organisation_id,
        crm_contact_id
      )
    `
    )
    .order("created_at", { ascending: false });

  if (
    statusFilter &&
    statusFilter !== "all" &&
    (allowed as readonly string[]).includes(statusFilter)
  ) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type SpaceJoin = {
    id: string;
    title: string | null;
    status: string | null;
    city: string | null;
    suburb: string | null;
    crm_organisation_id: string | null;
    crm_contact_id: string | null;
  };

  type RawRow = {
    id: string;
    listing_id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string | null;
    message: string | null;
    status: string;
    created_at: string;
    spaces: SpaceJoin | SpaceJoin[] | null;
  };

  const rows = ((data as unknown as RawRow[]) || []).map((row) => ({
    ...row,
    spaces: Array.isArray(row.spaces) ? row.spaces[0] ?? null : row.spaces,
  }));
  const spacesForCrm = rows
    .map((row) => row.spaces)
    .filter(Boolean)
    .map((space) => ({
      id: space!.id,
      crm_organisation_id: space!.crm_organisation_id,
      crm_contact_id: space!.crm_contact_id,
    }));

  const crmBySpaceId = new Map(
    (await enrichSpacesWithCrmSummaries(admin, spacesForCrm)).map((s) => [s.id, s])
  );

  const interests = rows.map((row) => {
    const space = row.spaces;
    const crm = space ? crmBySpaceId.get(space.id) : null;
    return {
      id: row.id,
      listing_id: row.listing_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      message: row.message,
      status: row.status,
      created_at: row.created_at,
      listing: space
        ? {
            id: space.id,
            title: space.title,
            status: space.status,
            city: space.city,
            suburb: space.suburb,
            public_url:
              space.status === "unclaimed" ? `/spaces/${space.id}` : null,
            admin_edit_url: adminCanonicalSpaceEditHref(space.id, {
              returnTo: "/admin/listing-claim-interests",
            }),
          }
        : null,
      crm: crm?.crm_linked
        ? {
            crm_organisation_id: crm.crm_organisation_id,
            crm_contact_id: crm.crm_contact_id,
            organisation_name: crm.crm_organisation_name,
            contact_name: crm.crm_contact_name,
          }
        : null,
    };
  });

  return NextResponse.json({ interests });
}
