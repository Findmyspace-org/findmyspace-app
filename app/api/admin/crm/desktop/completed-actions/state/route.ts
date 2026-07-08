import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { getStandardActionState } from "@/lib/crm-desktop/completed-actions-mutations";
import {
  STANDARD_COMPLETED_ACTIONS,
  subjectScope,
} from "@/lib/crm-desktop/completed-actions";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const organisationId = sp.get("organisationId");
  if (!organisationId) {
    return NextResponse.json(
      { error: "organisationId is required." },
      { status: 400 }
    );
  }

  const propertyId = sp.get("propertyId");
  const spaceId = sp.get("spaceId");
  const keysParam = sp.get("keys");
  const scope = subjectScope({
    organisationId,
    propertyId,
    spaceId,
  });

  const actionKeys = keysParam
    ? keysParam.split(",").map((k) => k.trim()).filter(Boolean)
    : STANDARD_COMPLETED_ACTIONS.filter((a) => {
        if (scope === "organisation") return a.scope === "organisation";
        if (scope === "property") {
          return a.scope === "organisation" || a.scope === "property";
        }
        return true;
      }).map((a) => a.key);

  try {
    const state = await getStandardActionState(auth.adminClient, {
      organisationId,
      propertyId,
      spaceId,
      actionKeys,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load standard action state.",
      },
      { status: 500 }
    );
  }
}
