import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { closeOrganisationPipelineLost } from "@/lib/crm-marketing/close-pipeline";
import type { ClosePipelineLostInput } from "@/lib/crm-marketing/close-pipeline";
import { fetchMarketingContactsForOrganisation } from "@/lib/crm-marketing/queries";

export async function GET(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const organisationId = req.nextUrl.searchParams.get("organisationId");
  if (!organisationId) {
    return NextResponse.json({ error: "organisationId required" }, { status: 400 });
  }

  try {
    const contacts = await fetchMarketingContactsForOrganisation(
      auth.adminClient,
      organisationId
    );
    return NextResponse.json({ ok: true, contacts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load contacts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as ClosePipelineLostInput;
    if (!body.organisationId || !body.idempotencyKey || !body.lostReason) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const result = await closeOrganisationPipelineLost(auth.adminClient, {
      ...body,
      profileId: auth.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Close pipeline failed." },
      { status: 500 }
    );
  }
}
