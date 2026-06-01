import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi, resolveCrmAssignedTo } from "@/lib/require-crm-api";
import {
  logCrmWriteFailure,
  publicCrmDbError,
} from "@/lib/space-place/crm-api-log";
import { buildOrganisationNotes } from "@/lib/space-place/build-notes";
import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/space-place/constants";

export const runtime = "nodejs";

type CreateSpaceBody = {
  name?: string;
  type?: string | null;
  pipeline_stage?: string;
  assigned_to?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
  lead_source?: string | null;
  opportunity_size?: string | null;
  contact?: {
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  } | null;
};

function isPipelineStage(value: string | undefined): value is PipelineStage {
  return (
    value !== undefined &&
    (PIPELINE_STAGES as readonly string[]).includes(value)
  );
}

function hasContactData(contact: CreateSpaceBody["contact"]): boolean {
  if (!contact) return false;
  return Boolean(
    contact.first_name?.trim() ||
      contact.last_name?.trim() ||
      contact.phone?.trim() ||
      contact.email?.trim()
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  let body: CreateSpaceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Space name is required." }, { status: 400 });
  }

  const stage = isPipelineStage(body.pipeline_stage)
    ? body.pipeline_stage
    : "prospect";

  const assignedTo = resolveCrmAssignedTo(auth, body.assigned_to);

  const combinedNotes = buildOrganisationNotes({
    notes: body.notes || "",
    leadSource: body.lead_source || "",
    opportunitySize: body.opportunity_size || "",
  });

  const db = auth.adminClient;

  const { data: createdOrg, error: orgErr } = await (db.from(
    "crm_organisations"
  ) as ReturnType<typeof db.from>)
    .insert({
      name,
      type: body.type?.trim() || null,
      pipeline_stage: stage,
      assigned_to: assignedTo,
      website: body.website?.trim() || null,
      address: body.address?.trim() || null,
      notes: combinedNotes,
      status: "new",
    })
    .select("id")
    .single();

  if (orgErr || !createdOrg) {
    logCrmWriteFailure({
      operation: "insert",
      table: "crm_organisations",
      userId: auth.userId,
      platformRole: auth.platformRole,
      crmRole: auth.crmRole,
      error: orgErr || { message: "No row returned" },
    });
    return NextResponse.json(
      { error: publicCrmDbError(orgErr, "Failed to create space.") },
      { status: 500 }
    );
  }

  const organisationId = (createdOrg as { id: string }).id;
  let contactId: string | null = null;

  if (hasContactData(body.contact)) {
    const contact = body.contact!;
    const first = contact.first_name?.trim() || "";
    const last = contact.last_name?.trim() || "";
    const fullName = [first, last].filter(Boolean).join(" ") || "Contact";

    const { data: createdContact, error: contactErr } = await (db.from(
      "crm_contacts"
    ) as ReturnType<typeof db.from>)
      .insert({
        organisation_id: organisationId,
        first_name: first || null,
        last_name: last || null,
        full_name: fullName,
        role: contact.role?.trim() || null,
        phone: contact.phone?.trim() || null,
        whatsapp: contact.whatsapp?.trim() || null,
        email: contact.email?.trim() || null,
        assigned_to: assignedTo,
        status: "active",
      })
      .select("id")
      .single();

    if (contactErr || !createdContact) {
      logCrmWriteFailure({
        operation: "insert",
        table: "crm_contacts",
        userId: auth.userId,
        platformRole: auth.platformRole,
        crmRole: auth.crmRole,
        error: contactErr || { message: "No row returned" },
      });
      return NextResponse.json(
        {
          error: publicCrmDbError(
            contactErr,
            "Space created but contact failed."
          ),
        },
        { status: 500 }
      );
    }
    contactId = (createdContact as { id: string }).id;
  }

  return NextResponse.json({ organisationId, contactId });
}
