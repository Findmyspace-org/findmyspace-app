import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireCrmApi,
  resolveCrmAssignedTo,
} from "@/lib/require-crm-api";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/space-place/constants";
import {
  logCrmWriteFailure,
  publicCrmDbError,
} from "@/lib/space-place/crm-api-log";
import {
  defaultPipelineStage,
  splitContactName,
} from "@/lib/space-place/smart-capture-build";
import type { CrmRole } from "@/lib/space-place/types";
import type { SmartCaptureConfirmPayload } from "@/lib/space-place/smart-capture-types";

export const runtime = "nodejs";

function isPipelineStage(value: string | null): value is PipelineStage {
  return value !== null && (PIPELINE_STAGES as readonly string[]).includes(value);
}

async function assertCanAccessOrganisation(
  db: SupabaseClient,
  auth: { crmRole: CrmRole; userId: string },
  organisationId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (auth.crmRole === "admin") {
    return { ok: true };
  }

  const { data, error } = await (db.from("crm_organisations") as ReturnType<
    typeof db.from
  >)
    .select("assigned_to")
    .eq("id", organisationId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Organisation not found or not accessible." },
        { status: 404 }
      ),
    };
  }

  const assignedTo = (data as { assigned_to: string | null }).assigned_to;
  if (assignedTo !== auth.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You can only update spaces assigned to you." },
        { status: 403 }
      ),
    };
  }

  return { ok: true };
}

function writeFailure(
  auth: {
    userId: string;
    platformRole: string | null;
    crmRole: string;
  },
  operation: string,
  table: string,
  error: { message?: string; code?: string; details?: string },
  fallback: string
) {
  logCrmWriteFailure({
    operation,
    table,
    userId: auth.userId,
    platformRole: auth.platformRole,
    crmRole: auth.crmRole,
    error,
  });
  return NextResponse.json(
    { error: publicCrmDbError(error, fallback) },
    { status: 500 }
  );
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
  const assignedTo = resolveCrmAssignedTo(auth);
  let organisationId = body.organisation.id;

  console.info("[smart-capture/confirm] start", {
    userId: auth.userId,
    platformRole: auth.platformRole,
    crmRole: auth.crmRole,
    orgCreate: body.organisation.create || !organisationId,
    orgName,
  });

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
        assigned_to: assignedTo,
        status: "new",
      })
      .select("id")
      .single();

    if (orgErr || !createdOrg) {
      return writeFailure(
        auth,
        "insert",
        "crm_organisations",
        orgErr || { message: "No row returned" },
        "Failed to create organisation."
      );
    }
    organisationId = (createdOrg as { id: string }).id;
  } else {
    const access = await assertCanAccessOrganisation(db, auth, organisationId);
    if (!access.ok) return access.response;

    const patch: Record<string, unknown> = {};
    if (isPipelineStage(body.organisation.pipeline_stage)) {
      patch.pipeline_stage = body.organisation.pipeline_stage;
    }
    if (body.organisation.notes?.trim()) {
      patch.notes = body.organisation.notes.trim();
    }
    if (Object.keys(patch).length > 0) {
      const { error: updateErr } = await (db.from(
        "crm_organisations"
      ) as ReturnType<typeof db.from>)
        .update(patch)
        .eq("id", organisationId);

      if (updateErr) {
        return writeFailure(
          auth,
          "update",
          "crm_organisations",
          updateErr,
          "Failed to update organisation."
        );
      }
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
        assigned_to: assignedTo,
        status: "active",
      })
      .select("id")
      .single();

    if (contactErr || !createdContact) {
      return writeFailure(
        auth,
        "insert",
        "crm_contacts",
        contactErr || { message: "No row returned" },
        "Failed to create contact."
      );
    }
    contactId = (createdContact as { id: string }).id;
  } else {
    const access = await assertCanAccessOrganisation(db, auth, organisationId);
    if (!access.ok) return access.response;

    const contactPatch: Record<string, unknown> = {};
    if (body.contact.email?.trim()) contactPatch.email = body.contact.email.trim();
    if (body.contact.phone?.trim()) contactPatch.phone = body.contact.phone.trim();
    if (Object.keys(contactPatch).length > 0) {
      const { error: contactUpdateErr } = await (db.from(
        "crm_contacts"
      ) as ReturnType<typeof db.from>)
        .update(contactPatch)
        .eq("id", contactId);

      if (contactUpdateErr) {
        return writeFailure(
          auth,
          "update",
          "crm_contacts",
          contactUpdateErr,
          "Failed to update contact."
        );
      }
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
    return writeFailure(
      auth,
      "insert",
      "crm_engagements",
      engErr,
      "Failed to create engagement."
    );
  }

  if (
    body.followUp?.create &&
    body.followUp.title?.trim() &&
    body.followUp.due_date
  ) {
    const { error: taskErr } = await (db.from("crm_tasks") as ReturnType<
      typeof db.from
    >).insert({
      organisation_id: organisationId,
      contact_id: contactId,
      title: body.followUp.title.trim(),
      due_date: body.followUp.due_date,
      owner_id: auth.userId,
      status: "open",
      priority: "normal",
    });

    if (taskErr) {
      return writeFailure(
        auth,
        "insert",
        "crm_tasks",
        taskErr,
        "Failed to create follow-up task."
      );
    }
  }

  if (body.rawText?.trim()) {
    const { error: inboxErr } = await (db.from("crm_inbox") as ReturnType<
      typeof db.from
    >).insert({
      source: "smart_capture",
      raw_content: body.rawText.trim(),
      parsed_json: body,
      processed: true,
      created_by: auth.userId,
    });

    if (inboxErr) {
      logCrmWriteFailure({
        operation: "insert",
        table: "crm_inbox",
        userId: auth.userId,
        platformRole: auth.platformRole,
        crmRole: auth.crmRole,
        error: inboxErr,
      });
    }
  }

  console.info("[smart-capture/confirm] success", {
    userId: auth.userId,
    organisationId,
    contactId,
  });

  return NextResponse.json({ organisationId });
}
