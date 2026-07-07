import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { reassignPropertyOrganisation } from "@/lib/crm-desktop/organisation-property-link";
import { loadOrganisationMarketplaceCountsForRow } from "@/lib/crm-desktop/patch-organisation-row-marketplace";

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      propertyId?: string;
      newOrganisationId?: string;
      note?: string | null;
    };

    if (!body.propertyId || !body.newOrganisationId) {
      return NextResponse.json(
        { error: "propertyId and newOrganisationId are required." },
        { status: 400 }
      );
    }

    const result = await reassignPropertyOrganisation(auth.adminClient, {
      propertyId: body.propertyId,
      newOrganisationId: body.newOrganisationId,
      profileId: auth.userId,
      note: body.note,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const [previousCounts, newCounts] = await Promise.all([
      loadOrganisationMarketplaceCountsForRow(
        auth.adminClient,
        result.previousOrganisationId
      ),
      loadOrganisationMarketplaceCountsForRow(
        auth.adminClient,
        result.newOrganisationId
      ),
    ]);

    return NextResponse.json({
      ok: true,
      propertyId: result.propertyId,
      previousOrganisationId: result.previousOrganisationId,
      newOrganisationId: result.newOrganisationId,
      previousCounts,
      newCounts,
    });
  } catch (error) {
    console.error("[crm/organisation-properties/reassign]", error);
    return NextResponse.json(
      { error: "Failed to reassign property." },
      { status: 500 }
    );
  }
}
