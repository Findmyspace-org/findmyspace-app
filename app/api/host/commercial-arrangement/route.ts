import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";
import {
  resolveAccessForOrganisation,
  resolveAccessForProperty,
  resolveAccessForSpace,
} from "@/lib/access/resolve-access";
import { loadResolvedCommercialTerms } from "@/lib/commercial-terms-server";
import { toHostCommercialArrangementDto } from "@/lib/host-commercial-copy";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | null, label: string): string | null | NextResponse {
  if (!value) return null;
  if (!UUID_RE.test(value)) {
    return NextResponse.json({ error: `Invalid ${label}.` }, { status: 400 });
  }
  return value;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;

  const spaceIdOrErr = optionalUuid(req.nextUrl.searchParams.get("spaceId"), "space id");
  if (spaceIdOrErr instanceof NextResponse) return spaceIdOrErr;
  const propertyIdOrErr = optionalUuid(
    req.nextUrl.searchParams.get("propertyId"),
    "property id"
  );
  if (propertyIdOrErr instanceof NextResponse) return propertyIdOrErr;
  const organisationIdOrErr = optionalUuid(
    req.nextUrl.searchParams.get("organisationId"),
    "organisation id"
  );
  if (organisationIdOrErr instanceof NextResponse) return organisationIdOrErr;

  const spaceId = spaceIdOrErr;
  const propertyId = propertyIdOrErr;
  const organisationId = organisationIdOrErr;

  if (spaceId) {
    const access = await resolveAccessForSpace(auth.admin, auth.userId, spaceId);
    if (!access?.canViewBookingCommercial) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  } else if (propertyId) {
    const access = await resolveAccessForProperty(
      auth.admin,
      auth.userId,
      propertyId
    );
    if (!access?.canViewBookingCommercial) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  } else if (organisationId) {
    const access = await resolveAccessForOrganisation(
      auth.admin,
      auth.userId,
      organisationId
    );
    if (!access.isGlobalAdmin && !access.isOrganisationAdmin) {
      const { data } = await auth.admin
        .from("organisation_access")
        .select("id")
        .eq("user_id", auth.userId)
        .eq("organisation_id", organisationId)
        .eq("status", "active")
        .limit(1);
      if (!data?.length) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }
  }

  try {
    const terms = await loadResolvedCommercialTerms(auth.admin, {
      organisationId,
      propertyId,
      spaceId,
    });
    return NextResponse.json({
      arrangement: toHostCommercialArrangementDto(terms),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load commercial arrangement.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
