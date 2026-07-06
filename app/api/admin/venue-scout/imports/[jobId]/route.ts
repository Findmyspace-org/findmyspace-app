import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROPERTY_FIELDS = [
  "name",
  "description",
  "address",
  "suburb",
  "city",
  "province",
  "postal_code",
  "country",
  "latitude",
  "longitude",
  "website_url",
  "confidence_score",
] as const;

const SPACE_FIELDS = [
  "name",
  "description",
  "space_type",
  "min_group_size",
  "max_group_size",
  "price_amount",
  "price_unit",
  "booking_unit",
  "deposit_amount",
  "amenities",
  "booking_requirements",
  "terms_notes",
  "confidence_score",
  "missing_fields",
  "selected_for_creation",
] as const;

function pickAllowed(
  input: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in input) output[field] = input[field];
  }
  if (Object.keys(output).length) output.updated_at = new Date().toISOString();
  return output;
}

async function loadImportJob(admin: ReturnType<typeof createServiceAdminClient>, jobId: string) {
  if (!admin) throw new Error("Server configuration error.");
  const { data: job, error } = await admin
    .from("venue_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return job as Record<string, unknown> | null;
}

async function buildDuplicateWarnings(
  admin: NonNullable<ReturnType<typeof createServiceAdminClient>>,
  propertyCandidates: Record<string, unknown>[],
  spaceCandidates: Record<string, unknown>[]
) {
  const warnings: string[] = [];
  const propertyName = propertyCandidates[0]?.name;
  if (typeof propertyName === "string" && propertyName.trim()) {
    const { data: props } = await admin
      .from("properties")
      .select("id, name, city, suburb")
      .ilike("name", `%${propertyName.trim().slice(0, 80)}%`)
      .limit(5);
    if (props?.length) {
      warnings.push(
        `Possible existing property match: ${props
          .map((p: { name?: string }) => p.name)
          .filter(Boolean)
          .join(", ")}`
      );
    }
  }

  const selectedNames = spaceCandidates
    .map((space) => space.name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .slice(0, 5);
  if (selectedNames.length) {
    const { data: spaces } = await admin
      .from("spaces")
      .select("id, title")
      .or(selectedNames.map((name) => `title.ilike.%${name.slice(0, 80)}%`).join(","))
      .limit(8);
    if (spaces?.length) {
      warnings.push(
        `Possible existing space match: ${spaces
          .map((s: { title?: string }) => s.title)
          .filter(Boolean)
          .join(", ")}`
      );
    }
  }

  return warnings;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid import job id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    const job = await loadImportJob(admin, jobId);
    if (!job) return NextResponse.json({ error: "Import not found." }, { status: 404 });

    const [pagesRes, propertyRes, spacesRes, imagesRes, propertiesRes] = await Promise.all([
      admin
        .from("venue_import_pages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      admin
        .from("venue_import_property_candidates")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      admin
        .from("venue_import_space_candidates")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      admin
        .from("venue_import_image_candidates")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      admin
        .from("properties")
        .select("id, name, city, suburb")
        .is("archived_at", null)
        .order("name", { ascending: true })
        .limit(200),
    ]);

    for (const result of [pagesRes, propertyRes, spacesRes, imagesRes, propertiesRes]) {
      if (result.error) throw new Error(result.error.message);
    }

    const propertyCandidates = (propertyRes.data || []) as Record<string, unknown>[];
    const spaceCandidates = (spacesRes.data || []) as Record<string, unknown>[];
    const duplicateWarnings = await buildDuplicateWarnings(
      admin,
      propertyCandidates,
      spaceCandidates
    );

    return NextResponse.json({
      job,
      pages: pagesRes.data || [],
      property_candidates: propertyCandidates,
      space_candidates: spaceCandidates,
      image_candidates: imagesRes.data || [],
      properties: propertiesRes.data || [],
      duplicate_warnings: duplicateWarnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load import." },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  try {
    if (body.status === "archived") {
      const { error } = await admin
        .from("venue_import_jobs")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) throw new Error(error.message);
    }

    if (body.property_candidate && typeof body.property_candidate === "object") {
      const row = body.property_candidate as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      if (UUID_RE.test(id)) {
        const patch = pickAllowed(row, PROPERTY_FIELDS);
        if (Object.keys(patch).length) {
          const { error } = await admin
            .from("venue_import_property_candidates")
            .update(patch)
            .eq("id", id)
            .eq("job_id", jobId);
          if (error) throw new Error(error.message);
        }
      }
    }

    if (Array.isArray(body.space_candidates)) {
      for (const item of body.space_candidates) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : "";
        if (!UUID_RE.test(id)) continue;
        const patch = pickAllowed(row, SPACE_FIELDS);
        if (!Object.keys(patch).length) continue;
        const { error } = await admin
          .from("venue_import_space_candidates")
          .update(patch)
          .eq("id", id)
          .eq("job_id", jobId);
        if (error) throw new Error(error.message);
      }
    }

    if (Array.isArray(body.image_candidates)) {
      for (const item of body.image_candidates) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : "";
        if (!UUID_RE.test(id) || typeof row.selected !== "boolean") continue;
        const { error } = await admin
          .from("venue_import_image_candidates")
          .update({ selected: row.selected })
          .eq("id", id)
          .eq("job_id", jobId);
        if (error) throw new Error(error.message);
      }
    }

    await admin
      .from("venue_import_jobs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update import." },
      { status: 500 }
    );
  }
}
