import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/space-place/constants";
import {
  defaultPipelineStage,
  splitContactName,
} from "@/lib/space-place/smart-capture-build";
import type { SmartCaptureConfirmPayload } from "@/lib/space-place/smart-capture-types";

export const runtime = "nodejs";

function isPipelineStage(value: string | null): value is PipelineStage {
  return value !== null && (PIPELINE_STAGES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  let body: SmartCaptureConfirmPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orgName = body.organisation?.name?.trim();
  if (!orgName) {
    return NextResponse.json(
      { error: "organisation.name is required." },
      { status: 400 }
    );
  }

  const db = auth.adminClient;
  let organisationId = body.organisation.id;

  if (body.organisation.create || !organisationId) {
    const stage = isPipelineStage(body.organisation.pipeline_stage)
      ? body.organisation.pipeline_stage
      : defaultPipelineStage(null);

    const { data: createdOrg, error: orgErr } = await (db.from(
      "crm_organisations"
    ) as ReturnType<typeof db.from>)
      .insert({
        name: orgName,
        pipeline_stage: stage,
        notes: body.organisation.notes?.trim() || null,
        assigned_to: auth.crmRole === "spacer" ? auth.userId : null,
        status: "new",
      })
      .select("id")
      .single();

    if (orgErr || !createdOrg) {
      return NextResponse.json(
        { error: orgErr?.message || "Failed to create organisation." },
        { status: 500 }
      );
    }
    organisationId = (createdOrg as { id: string }).id;
  } else {
    const patch: Record<string, unknown> = {};
    if (isPipelineStage(body.organisation.pipeline_stage)) {
      patch.pipeline_stage = body.organisation.pipeline_stage;
    }
    if (body.organisation.notes?.trim()) {
      patch.notes = body.organisation.notes.trim();
    }
    if (Object.keys(patch).length > 0) {
      await (db.from("crm_organisations") as ReturnType<typeof db.from>)
        .update(patch)
        .eq("id", organisationId);
    }
  }

  let contactId = body.contact.id;

  if (body.contact.create || !contactId) {
    const names = splitContactName(body.contact.full_name || "Unnamed");
    const { data: createdContact, error: contactErr } = await (db.from(
      "crm_contacts"
    ) as ReturnType<typeof db.from>)
      .insert({
        organisation_id: organisationId,
        first_name: names.first_name,
        last_name: names.last_name,
        full_name: names.full_name,
        email: body.contact.email?.trim() || null,
        phone: body.contact.phone?.trim() || null,
        assigned_to: auth.crmRole === "spacer" ? auth.userId : null,
        status: "active",
      })
      .select("id")
      .single();

    if (contactErr || !createdContact) {
      return NextResponse.json(
        { error: contactErr?.message || "Failed to create contact." },
        { status: 500 }
      );
    }
    contactId = (createdContact as { id: string }).id;
  } else {
    const contactPatch: Record<string, unknown> = {};
    if (body.contact.email?.trim()) contactPatch.email = body.contact.email.trim();
    if (body.contact.phone?.trim()) contactPatch.phone = body.contact.phone.trim();
    if (Object.keys(contactPatch).length > 0) {
      await (db.from("crm_contacts") as ReturnType<typeof db.from>)
        .update(contactPatch)
        .eq("id", contactId);
    }
  }

  const engagementType = body.engagement?.type || "note";
  const { error: engErr } = await (db.from("crm_engagements") as ReturnType<
    typeof db.from
  >).insert({
    organisation_id: organisationId,
    contact_id: contactId,
    type: engagementType,
    summary: body.engagement?.summary?.trim() || body.rawText?.trim() || null,
    outcome: body.engagement?.outcome?.trim() || null,
    created_by: auth.userId,
    occurred_at: new Date().toISOString(),
  });

  if (engErr) {
    return NextResponse.json(
      { error: engErr.message || "Failed to create engagement." },
      { status: 500 }
    );
  }

  if (
    body.followUp?.create &&
    body.followUp.title?.trim() &&
    body.followUp.due_date
  ) {
    await (db.from("crm_tasks") as ReturnType<typeof db.from>).insert({
      organisation_id: organisationId,
      contact_id: contactId,
      title: body.followUp.title.trim(),
      due_date: body.followUp.due_date,
      owner_id: auth.userId,
      status: "open",
      priority: "normal",
    });
  }

  if (body.rawText?.trim()) {
    await (db.from("crm_inbox") as ReturnType<typeof db.from>).insert({
      source: "smart_capture",
      raw_content: body.rawText.trim(),
      parsed_json: body,
      processed: true,
      created_by: auth.userId,
    });
  }

  return NextResponse.json({ organisationId });
}
