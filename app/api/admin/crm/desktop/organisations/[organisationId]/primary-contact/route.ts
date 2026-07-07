import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import { setOrganisationPrimaryContact } from "@/lib/crm-desktop/primary-contact";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organisationId: string }> }
) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  try {
    const { organisationId } = await params;
    const body = (await req.json()) as { contactId?: string | null };
    const contactId =
      body.contactId === null || body.contactId === undefined
        ? null
        : String(body.contactId);

    const result = await setOrganisationPrimaryContact(auth.adminClient, {
      organisationId,
      contactId,
      profileId: auth.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      primaryContactId: result.primaryContactId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update primary contact.",
      },
      { status: 500 }
    );
  }
}
