import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { linkPropertyToOrganisation } from "@/lib/crm-desktop/organisation-property-link";
import { loadOrganisationMarketplaceCountsForRow } from "@/lib/crm-desktop/patch-organisation-row-marketplace";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      organisationId?: string;
      propertyId?: string;
      note?: string | null;
    };

    if (!body.organisationId || !body.propertyId) {
      return NextResponse.json(
        { error: "organisationId and propertyId are required." },
        { status: 400 }
      );
    }

    const result = await linkPropertyToOrganisation(auth.adminClient, {
      organisationId: body.organisationId,
      propertyId: body.propertyId,
      profileId: auth.userId,
      linkSource: "crm_desktop_link",
      note: body.note,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const counts = await loadOrganisationMarketplaceCountsForRow(
      auth.adminClient,
      body.organisationId
    );

    return NextResponse.json({
      ok: true,
      propertyId: result.propertyId,
      organisationId: result.organisationId,
      counts,
    });
  } catch (error) {
    console.error("[crm/organisation-properties/link]", error);
    return NextResponse.json(
      { error: "Failed to link property." },
      { status: 500 }
    );
  }
}
