import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  LISTING_QUESTION_MAX_LENGTH,
  evaluateListingQuestionSafety,
} from "@/lib/listing-question-safety";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import {
  buildListingQuestionCopy,
  buildListingQuestionsBatchCopy,
} from "@/lib/communication-copy";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import { fetchHostManagedSpaces } from "@/lib/host-managed-spaces";
import { listSpaceManagerNotificationRecipients } from "@/lib/space-manager-server";

/**
 * Listing yes/no questions — collection endpoints.
 *
 * POST   /api/listing-questions  Renter creates a controlled yes/no question.
 * GET    /api/listing-questions  Authenticated user lists their own questions
 *                                (renter view + owner view, scoped via `?role=`).
 *
 * TODO: include answered_questions in /api/space-assistant context (already wired).
 * TODO: persist unanswered questions older than N days into a listing FAQ queue.
 */

export const runtime = "nodejs";

type CreateBody = {
  spaceId?: string;
  /** Single-question payload (backwards-compatible). */
  question?: string;
  /**
   * Batched payload — preferred. When provided, the route inserts one row per
   * question and sends ONE notification + ONE email to the host. Limited to
   * MAX_BATCH_QUESTIONS items.
   */
  questions?: string[];
  bookingId?: string | null;
};

const MAX_BATCH_QUESTIONS = 5;

type ListingQuestionRow = {
  id: string;
  space_id: string;
  booking_id: string | null;
  renter_id: string;
  owner_id: string;
  question: string;
  answer: "yes" | "no" | "not_applicable" | null;
  status: "pending" | "answered" | "dismissed";
  created_at: string;
  answered_at: string | null;
};

function buildClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) return null;
  return { supabaseUrl, anonKey, serviceKey };
}

async function authenticate(req: NextRequest) {
  const cfg = buildClients();
  if (!cfg) {
    return {
      error: NextResponse.json({ error: "Server configuration error." }, { status: 500 }),
    } as const;
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    } as const;
  }
  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(cfg.supabaseUrl, cfg.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    } as const;
  }
  const admin = createClient(cfg.supabaseUrl, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { user, admin } as const;
}

// ---------------------------------------------------------------------------
// POST — renter creates question
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    let body: CreateBody | null = null;
    try {
      body = (await req.json()) as CreateBody;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const spaceId = (body?.spaceId || "").trim();
    const bookingId =
      typeof body?.bookingId === "string" && body.bookingId.trim().length > 0
        ? body.bookingId.trim()
        : null;

    if (!spaceId) {
      return NextResponse.json({ error: "Missing spaceId." }, { status: 400 });
    }

    // Normalise: accept either `questions: string[]` (preferred) or a single
    // `question: string` (legacy single-question callers). The renter-facing
    // SpaceAssistant uses the batched form; older callers still work.
    const rawList: string[] = Array.isArray(body?.questions)
      ? (body!.questions as unknown[]).filter(
          (q): q is string => typeof q === "string"
        )
      : typeof body?.question === "string"
        ? [body!.question as string]
        : [];

    const trimmed: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawList) {
      const text = raw.trim().slice(0, LISTING_QUESTION_MAX_LENGTH);
      if (!text) continue;
      const dupKey = text.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
      trimmed.push(text);
      if (trimmed.length >= MAX_BATCH_QUESTIONS) break;
    }

    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }

    // Safety check: every question must pass.
    for (const q of trimmed) {
      const safety = evaluateListingQuestionSafety(q);
      if (!safety.ok) {
        return NextResponse.json(
          { kind: "blocked", reason: safety.reason },
          { status: 200 }
        );
      }
    }

    // Listing must be active and we need owner_id + title for notifications/email.
    const { data: spaceRow, error: spaceErr } = await (admin.from("spaces") as any)
      .select("id, title, owner_id, status")
      .eq("id", spaceId)
      .maybeSingle();

    if (spaceErr || !spaceRow?.id) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    if (spaceRow.status !== "active") {
      return NextResponse.json({ error: "Listing not available." }, { status: 403 });
    }
    if (spaceRow.owner_id === user.id) {
      return NextResponse.json(
        { error: "You can’t ask a question about your own listing." },
        { status: 400 }
      );
    }

    const rowsToInsert = trimmed.map((q) => ({
      space_id: spaceId,
      booking_id: bookingId,
      renter_id: user.id,
      owner_id: spaceRow.owner_id as string,
      question: q,
      normalized_question: q.toLowerCase().replace(/\s+/g, " ").trim(),
      status: "pending" as const,
      used_for_listing_faq: true,
    }));

    const { data: insertedRows, error: insertErr } = await (admin.from(
      "listing_yes_no_questions"
    ) as any)
      .insert(rowsToInsert)
      .select(
        "id, space_id, booking_id, renter_id, owner_id, question, answer, status, created_at, answered_at"
      );

    if (insertErr || !Array.isArray(insertedRows) || insertedRows.length === 0) {
      console.error("listing-question insert failed:", insertErr);
      return NextResponse.json(
        { error: "Could not save your question. Please try again." },
        { status: 500 }
      );
    }

    const inserted = insertedRows as ListingQuestionRow[];
    const isBatch = inserted.length > 1;

    // Comms Center is the primary destination for listing questions.
    // Single-question flow still deep-links to the focused card; batch flow
    // links to the listing-question type filter so the host sees all the
    // new pending cards together.
    const focusHref = isBatch
      ? `/dashboard/comms?type=listing_question`
      : `/dashboard/comms?focus=${inserted[0].id}&type=listing_question`;

    // Fetch host profile once so notification + email can share copy.
    let ownerProfile: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null = null;
    try {
      const { data } = await (admin.from("profiles") as any)
        .select("first_name, last_name, email")
        .eq("id", spaceRow.owner_id)
        .maybeSingle();
      ownerProfile = data || null;
    } catch (profileErr) {
      console.error("listing-question owner profile lookup failed:", profileErr);
    }

    const copy = isBatch
      ? buildListingQuestionsBatchCopy({
          ownerFirstName: ownerProfile?.first_name ?? null,
          spaceTitle: spaceRow.title,
          questions: inserted.map((r) => r.question),
        })
      : buildListingQuestionCopy({
          ownerFirstName: ownerProfile?.first_name ?? null,
          spaceTitle: spaceRow.title,
          question: inserted[0].question,
        });

    // ONE owner notification per submit (single or batch). The individual
    // question rows still appear as separate cards in Comms.
    try {
      await (admin.from("notifications") as any).insert({
        user_id: spaceRow.owner_id,
        role: "owner",
        type: "listing_question",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        href: focusHref,
        related_entity_type: "space",
        related_entity_id: spaceId,
        is_read: false,
      });
    } catch (notifyErr) {
      console.error("listing-question notify owner failed:", notifyErr);
    }

    try {
      const managers = await listSpaceManagerNotificationRecipients(admin, spaceId);
      for (const manager of managers) {
        if (manager.user_id === spaceRow.owner_id) continue;
        await (admin.from("notifications") as any).insert({
          user_id: manager.user_id,
          role: "owner",
          type: "listing_question",
          title: copy.notificationTitle,
          message: copy.notificationMessage,
          href: focusHref,
          related_entity_type: "space",
          related_entity_id: spaceId,
          is_read: false,
        });
        if (manager.email) {
          const siteUrl = getCanonicalPublicSiteUrl();
          const rendered = renderEmailLayout({
            preheader: copy.emailPreheader,
            title: copy.emailTitle,
            bodyLines: copy.emailBodyLines,
            primaryCTA: {
              label: copy.ctaLabel,
              href: `${siteUrl}${focusHref}`,
            },
            footerRole: copy.emailFooterRole,
          });
          await sendEmail({
            to: manager.email,
            subject: copy.emailSubject,
            html: rendered.html,
            text: rendered.text,
          });
        }
      }
    } catch (managerErr) {
      console.error("listing-question notify managers failed:", managerErr);
    }

    // ONE owner email per submit, listing all questions for batch flows.
    try {
      if (ownerProfile?.email) {
        const siteUrl = getCanonicalPublicSiteUrl();
        const rendered = renderEmailLayout({
          preheader: copy.emailPreheader,
          title: copy.emailTitle,
          bodyLines: copy.emailBodyLines,
          primaryCTA: {
            label: copy.ctaLabel,
            href: `${siteUrl}${focusHref}`,
          },
          footerRole: copy.emailFooterRole,
        });
        await sendEmail({
          to: ownerProfile.email,
          subject: copy.emailSubject,
          html: rendered.html,
          text: rendered.text,
        });
      }
    } catch (emailErr) {
      console.error("listing-question owner email failed:", emailErr);
    }

    return NextResponse.json({
      kind: "sent",
      // Backwards-compatible: single-question callers still get `question`,
      // batched callers see the full list in `questions`.
      question: inserted[0],
      questions: inserted,
    });
  } catch (err) {
    console.error("listing-questions POST error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — list current user's questions (renter or owner role)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    const { searchParams } = new URL(req.url);
    const roleParam = (searchParams.get("role") || "").toLowerCase();
    const spaceIdFilter = searchParams.get("spaceId") || null;

    const isOwner = roleParam === "owner";
    const isRenter = roleParam === "renter";
    if (!isOwner && !isRenter) {
      return NextResponse.json(
        { error: "Missing or invalid `role` (must be 'renter' or 'owner')." },
        { status: 400 }
      );
    }

    let query = (admin.from("listing_yes_no_questions") as any)
      .select(
        "id, space_id, booking_id, renter_id, owner_id, question, answer, status, created_at, answered_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (isRenter) query = query.eq("renter_id", user.id);
    else {
      const managed = await fetchHostManagedSpaces(admin, user.id);
      if (managed.allIds.length === 0) query = query.eq("owner_id", user.id);
      else query = query.in("space_id", managed.allIds);
    }

    if (spaceIdFilter) query = query.eq("space_id", spaceIdFilter);

    const { data: rows, error } = await query;
    if (error) {
      console.error("listing-questions list failed:", error);
      return NextResponse.json({ error: "Could not load questions." }, { status: 500 });
    }

    const questions = (rows || []) as ListingQuestionRow[];
    const spaceIds = Array.from(new Set(questions.map((q) => q.space_id)));
    const renterIds = Array.from(new Set(questions.map((q) => q.renter_id)));

    let spaceMap = new Map<string, { title: string }>();
    if (spaceIds.length) {
      const { data: spaceRows } = await (admin.from("spaces") as any)
        .select("id, title")
        .in("id", spaceIds);
      spaceMap = new Map(
        (spaceRows || []).map((row: any) => [row.id, { title: row.title || "Listing" }])
      );
    }

    // Cover thumbnail per space — lowest sort_order wins (matches the rest
    // of the app, see `/spaces`, `/dashboard/listings`, `/admin/spaces`).
    const spaceCoverMap = new Map<string, string>();
    if (spaceIds.length) {
      const { data: imageRows } = await (admin.from("space_images") as any)
        .select("space_id, image_url, sort_order")
        .in("space_id", spaceIds)
        .order("sort_order", { ascending: true });
      for (const row of (imageRows || []) as {
        space_id: string;
        image_url: string;
      }[]) {
        if (!spaceCoverMap.has(row.space_id)) {
          spaceCoverMap.set(row.space_id, row.image_url);
        }
      }
    }

    let renterMap = new Map<string, { first_name: string | null }>();
    if (isOwner && renterIds.length) {
      const { data: profiles } = await (admin.from("profiles") as any)
        .select("id, first_name")
        .in("id", renterIds);
      renterMap = new Map(
        (profiles || []).map((row: any) => [row.id, { first_name: row.first_name }])
      );
    }

    const enriched = questions.map((q) => ({
      ...q,
      space_title: spaceMap.get(q.space_id)?.title || "Listing",
      space_cover_url: spaceCoverMap.get(q.space_id) || null,
      renter_first_name:
        isOwner ? renterMap.get(q.renter_id)?.first_name || null : null,
    }));

    return NextResponse.json({ questions: enriched });
  } catch (err) {
    console.error("listing-questions GET error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
