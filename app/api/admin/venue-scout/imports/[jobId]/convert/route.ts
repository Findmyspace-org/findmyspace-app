import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import {
  createPropertyFromCandidate,
  createSpaceFromCandidate,
} from "@/lib/venue-import";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConvertMode =
  | "create_new_property"
  | "add_to_existing_property"
  | "create_unclaimed_spaces"
  | "archive";

function normalizeSelectedIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
}

function propertyRowToCandidate(row: Record<string, unknown>): Record<string, unknown> {
  return {
    name: row.name,
    description: row.description,
    address: row.address_line1,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postal_code: row.postal_code,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid import job id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const mode = body.mode as ConvertMode;
  if (
    ![
      "create_new_property",
      "add_to_existing_property",
      "create_unclaimed_spaces",
      "archive",
    ].includes(mode)
  ) {
    return NextResponse.json({ error: "Invalid conversion mode." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const { data: job, error: jobErr } = await admin
      .from("venue_import_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });

    if (mode === "archive") {
      const { error } = await admin
        .from("venue_import_jobs")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
      await adminAudit({
        action: "venue_import_archived",
        actorUserId: auth.userId,
        targetType: "venue_import_job",
        targetId: jobId,
      });
      return NextResponse.json({ ok: true, archived: true });
    }

    const [propertyRes, spacesRes] = await Promise.all([
      admin
        .from("venue_import_property_candidates")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(1),
      admin
        .from("venue_import_space_candidates")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
    ]);
    if (propertyRes.error) throw new Error(propertyRes.error.message);
    if (spacesRes.error) throw new Error(spacesRes.error.message);

    const propertyCandidate =
      ((propertyRes.data || [])[0] as Record<string, unknown> | undefined) ?? null;
    const selectedIds = normalizeSelectedIds(body.selected_space_ids);
    const candidates = ((spacesRes.data || []) as Record<string, unknown>[]).filter(
      (space) =>
        selectedIds
          ? selectedIds.includes(space.id as string)
          : space.selected_for_creation === true
    );

    if (!candidates.length) {
      return NextResponse.json(
        { error: "Select at least one space candidate to create." },
        { status: 400 }
      );
    }

    let propertyId: string | null = null;
    let propertyForSpaces: Record<string, unknown> | null = propertyCandidate;
    let createdProperty: { id: string; name: string } | null = null;

    if (mode === "create_new_property") {
      if (!propertyCandidate) {
        return NextResponse.json(
          { error: "No property candidate is available." },
          { status: 400 }
        );
      }
      createdProperty = await createPropertyFromCandidate({
        admin,
        property: propertyCandidate,
        adminUserId: auth.userId,
      });
      propertyId = createdProperty.id;
    } else if (mode === "add_to_existing_property") {
      const existingPropertyId =
        typeof body.existing_property_id === "string" ? body.existing_property_id : "";
      if (!UUID_RE.test(existingPropertyId)) {
        return NextResponse.json(
          { error: "Select an existing property." },
          { status: 400 }
        );
      }
      const { data: existingProperty, error: propertyErr } = await admin
        .from("properties")
        .select(
          "id, name, description, address_line1, suburb, city, province, postal_code, country, latitude, longitude"
        )
        .eq("id", existingPropertyId)
        .maybeSingle();
      if (propertyErr) throw new Error(propertyErr.message);
      if (!existingProperty) {
        return NextResponse.json({ error: "Property not found." }, { status: 404 });
      }
      propertyId = existingPropertyId;
      propertyForSpaces = propertyRowToCandidate(existingProperty as Record<string, unknown>);
    }

    const createdSpaces = [];
    for (const candidate of candidates) {
      const created = await createSpaceFromCandidate({
        admin,
        candidate,
        property: propertyForSpaces,
        sourceUrl: (job as { source_url?: string }).source_url || "",
        adminUserId: auth.userId,
        propertyId,
        status: "draft",
      });
      createdSpaces.push(created);
    }

    const { error: updateErr } = await admin
      .from("venue_import_jobs")
      .update({
        status: "converted",
        updated_at: new Date().toISOString(),
        converted_at: new Date().toISOString(),
        converted_property_id: propertyId,
        raw_payload: {
          ...(job.raw_payload && typeof job.raw_payload === "object" ? job.raw_payload : {}),
          conversion: {
            mode,
            created_space_ids: createdSpaces.map((space) => space.id),
            created_property_id: propertyId,
            images_not_imported:
              "Website image candidates remain staged. Use existing upload/storage pipeline after permission review.",
          },
        },
      })
      .eq("id", jobId);
    if (updateErr) throw new Error(updateErr.message);

    await adminAudit({
      action: "venue_import_converted",
      actorUserId: auth.userId,
      targetType: "venue_import_job",
      targetId: jobId,
      meta: {
        mode,
        property_id: propertyId,
        created_space_ids: createdSpaces.map((space) => space.id),
      },
    });

    return NextResponse.json({
      ok: true,
      mode,
      property: createdProperty,
      property_id: propertyId,
      spaces: createdSpaces,
      warnings: [
        "Created spaces are draft admin-created listings and are not published.",
        "Image candidates were not imported automatically to avoid hotlinking/copyright issues.",
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conversion failed." },
      { status: 500 }
    );
  }
}
