import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  LISTING_QUESTION_MAX_LENGTH,
  evaluateListingQuestionSafety,
} from "@/lib/listing-question-safety";

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
  question?: string;
  bookingId?: string | null;
};

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
    const rawQuestion = (body?.question || "").trim();
    const bookingId =
      typeof body?.bookingId === "string" && body.bookingId.trim().length > 0
        ? body.bookingId.trim()
        : null;

    if (!spaceId) {
      return NextResponse.json({ error: "Missing spaceId." }, { status: 400 });
    }
    if (!rawQuestion) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }
    const question = rawQuestion.slice(0, LISTING_QUESTION_MAX_LENGTH);

    const safety = evaluateListingQuestionSafety(question);
    if (!safety.ok) {
      return NextResponse.json(
        { kind: "blocked", reason: safety.reason },
        { status: 200 }
      );
    }

    // Listing must be active and we need owner_id + title for notifications.
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

    const normalised = question
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const { data: inserted, error: insertErr } = await (admin.from(
      "listing_yes_no_questions"
    ) as any)
      .insert({
        space_id: spaceId,
        booking_id: bookingId,
        renter_id: user.id,
        owner_id: spaceRow.owner_id,
        question,
        normalized_question: normalised,
        status: "pending",
        used_for_listing_faq: true,
      })
      .select(
        "id, space_id, booking_id, renter_id, owner_id, question, answer, status, created_at, answered_at"
      )
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: "Could not save your question. Please try again." },
        { status: 500 }
      );
    }

    // Notify the host. Mirrors the booking-event notification shape.
    try {
      await (admin.from("notifications") as any).insert({
        user_id: spaceRow.owner_id,
        role: "owner",
        type: "listing_question",
        title: "New listing question",
        message: "A renter asked a yes/no question about your space.",
        href: "/dashboard/listing-questions",
        related_entity_type: "space",
        related_entity_id: spaceId,
        is_read: false,
      });
    } catch (notifyErr) {
      console.error("listing-question notify owner failed:", notifyErr);
    }

    return NextResponse.json({ kind: "sent", question: inserted as ListingQuestionRow });
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
    else query = query.eq("owner_id", user.id);

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
      renter_first_name:
        isOwner ? renterMap.get(q.renter_id)?.first_name || null : null,
    }));

    return NextResponse.json({ questions: enriched });
  } catch (err) {
    console.error("listing-questions GET error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
