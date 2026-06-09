import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { adminAudit } from "@/lib/admin-audit";
import {
  createServiceAdminClient,
  fetchAdminCreatedListing,
} from "@/lib/admin-unclaimed-space";
import {
  fetchSpaceCrmLinkSummary,
  parseSpaceCrmLinkInput,
  validateSpaceCrmLink,
} from "@/lib/space-crm-link";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await fetchAdminCreatedListing(admin, id, { allowOwnerClaimed: true });
  if (result.error || !result.space) {
    return NextResponse.json({ error: result.error || "Not found." }, { status: 404 });
  }

  const space = result.space as {
    crm_organisation_id?: string | null;
    crm_contact_id?: string | null;
  };

  const summary = await fetchSpaceCrmLinkSummary(admin, space);
  return NextResponse.json({ link: summary });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseSpaceCrmLinkInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await fetchAdminCreatedListing(admin, id, { allowOwnerClaimed: true });
  if (result.error || !result.space) {
    return NextResponse.json({ error: result.error || "Not found." }, { status: 404 });
  }
  if (result.readOnly) {
    return NextResponse.json({ error: "Listing is read-only." }, { status: 403 });
  }

  const validated = await validateSpaceCrmLink(admin, parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  if (parsed.data.crm_organisation_id !== undefined) {
    update.crm_organisation_id = parsed.data.crm_organisation_id;
  }
  if (parsed.data.crm_contact_id !== undefined) {
    update.crm_contact_id = parsed.data.crm_contact_id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No CRM link fields provided." }, { status: 400 });
  }

  const { error } = await admin.from("spaces").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await adminAudit({
    action: "space_crm_link_updated",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
    meta: update,
  });

  const summary = await fetchSpaceCrmLinkSummary(admin, {
    crm_organisation_id:
      update.crm_organisation_id ??
      (result.space as { crm_organisation_id?: string | null }).crm_organisation_id ??
      null,
    crm_contact_id:
      update.crm_contact_id ??
      (result.space as { crm_contact_id?: string | null }).crm_contact_id ??
      null,
  });

  return NextResponse.json({ ok: true, link: summary });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const result = await fetchAdminCreatedListing(admin, id, { allowOwnerClaimed: true });
  if (result.error || !result.space) {
    return NextResponse.json({ error: result.error || "Not found." }, { status: 404 });
  }
  if (result.readOnly) {
    return NextResponse.json({ error: "Listing is read-only." }, { status: 403 });
  }

  const { error } = await admin
    .from("spaces")
    .update({ crm_organisation_id: null, crm_contact_id: null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await adminAudit({
    action: "space_crm_link_cleared",
    actorUserId: auth.userId,
    targetType: "space",
    targetId: id,
  });

  return NextResponse.json({ ok: true, link: null });
}
