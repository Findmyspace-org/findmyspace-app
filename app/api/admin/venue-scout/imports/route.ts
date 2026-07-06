import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createServiceAdminClient } from "@/lib/admin-unclaimed-space";
import { adminAudit } from "@/lib/admin-audit";
import {
  crawlVenueWebsite,
  extractVenueCandidates,
  normalizeVenueImportUrl,
  storeVenueImportResults,
  VENUE_IMPORT_DEFAULT_CRAWL_DEPTH,
  VENUE_IMPORT_DEFAULT_MAX_PAGES,
  VENUE_IMPORT_MAX_DEPTH,
  VENUE_IMPORT_MAX_PAGES,
} from "@/lib/venue-import";

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("venue_import_jobs")
    .select(
      "id, source_url, normalized_domain, status, crawl_depth, max_pages, include_images, created_at, updated_at, error_message, extraction_summary, confidence_score, converted_property_id"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const rawUrl = typeof body.source_url === "string" ? body.source_url : "";
  if (!rawUrl.trim()) {
    return NextResponse.json({ error: "Website URL is required." }, { status: 400 });
  }

  let normalized: { url: string; normalizedDomain: string };
  try {
    normalized = normalizeVenueImportUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  const maxPages = clampNumber(
    body.max_pages,
    VENUE_IMPORT_DEFAULT_MAX_PAGES,
    1,
    VENUE_IMPORT_MAX_PAGES
  );
  const crawlDepth = clampNumber(
    body.crawl_depth,
    VENUE_IMPORT_DEFAULT_CRAWL_DEPTH,
    0,
    VENUE_IMPORT_MAX_DEPTH
  );
  const includeImages = body.include_images !== false;

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const { data: job, error: insertErr } = await admin
    .from("venue_import_jobs")
    .insert({
      source_url: normalized.url,
      normalized_domain: normalized.normalizedDomain,
      status: "crawling",
      crawl_depth: crawlDepth,
      max_pages: maxPages,
      include_images: includeImages,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    return NextResponse.json(
      { error: insertErr?.message || "Could not create import job." },
      { status: 500 }
    );
  }

  const jobId = (job as { id: string }).id;

  try {
    const crawl = await crawlVenueWebsite({
      sourceUrl: normalized.url,
      maxPages,
      crawlDepth,
      includeImages,
    });
    const extraction = extractVenueCandidates({
      sourceUrl: normalized.url,
      pages: crawl.pages,
      images: crawl.images,
    });
    await storeVenueImportResults({
      admin,
      jobId,
      pages: crawl.pages,
      extraction,
    });

    const { error: updateErr } = await admin
      .from("venue_import_jobs")
      .update({
        status: "needs_review",
        updated_at: new Date().toISOString(),
        extraction_summary: extraction.summary,
        confidence_score: extraction.confidence,
        raw_payload: {
          crawler: "same-domain-heuristic",
          limits: { max_pages: maxPages, crawl_depth: crawlDepth },
        },
      })
      .eq("id", jobId);
    if (updateErr) throw new Error(updateErr.message);

    await adminAudit({
      action: "venue_import_created",
      actorUserId: auth.userId,
      targetType: "venue_import_job",
      targetId: jobId,
      meta: {
        source_url: normalized.url,
        pages: crawl.pages.length,
        spaces: extraction.spaces.length,
      },
    });

    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    await admin
      .from("venue_import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", jobId);
    return NextResponse.json({ error: message, job_id: jobId }, { status: 500 });
  }
}
