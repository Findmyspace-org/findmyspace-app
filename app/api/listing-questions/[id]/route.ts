import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Listing yes/no questions — single-row endpoints.
 *
 * PATCH /api/listing-questions/:id
 *   body: { action: 'answer' | 'dismiss', answer?: 'yes'|'no'|'not_applicable' }
 *
 *   Owner-only. Updates answer/status and notifies the renter.
 */

export const runtime = "nodejs";

type PatchBody =
  | { action: "answer"; answer: "yes" | "no" | "not_applicable" }
  | { action: "dismiss" };

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const accessToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing question id." }, { status: 400 });
    }

    let body: PatchBody | null = null;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (!body || (body.action !== "answer" && body.action !== "dismiss")) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }
    if (
      body.action === "answer" &&
      !["yes", "no", "not_applicable"].includes(body.answer)
    ) {
      return NextResponse.json({ error: "Invalid answer." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: row, error: fetchErr } = await (admin.from(
      "listing_yes_no_questions"
    ) as any)
      .select("id, owner_id, renter_id, space_id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }
    if (row.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (row.status !== "pending") {
      return NextResponse.json(
        { error: "This question has already been resolved." },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const update =
      body.action === "answer"
        ? {
            answer: body.answer,
            status: "answered",
            answered_at: nowIso,
          }
        : {
            status: "dismissed",
            answered_at: nowIso,
          };

    const { data: updated, error: updateErr } = await (admin.from(
      "listing_yes_no_questions"
    ) as any)
      .update(update)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select(
        "id, space_id, booking_id, renter_id, owner_id, question, answer, status, created_at, answered_at"
      )
      .single();

    if (updateErr || !updated) {
      console.error("listing-question PATCH update failed:", updateErr);
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }

    // Only notify the renter for "answer" actions; dismissed questions are silent.
    if (body.action === "answer") {
      try {
        await (admin.from("notifications") as any).insert({
          user_id: row.renter_id,
          role: "renter",
          type: "listing_question_answered",
          title: "Your listing question was answered",
          message: "The host answered your question.",
          href: "/dashboard/listing-questions",
          related_entity_type: "space",
          related_entity_id: row.space_id,
          is_read: false,
        });
      } catch (notifyErr) {
        console.error("listing-question notify renter failed:", notifyErr);
      }
    }

    return NextResponse.json({ question: updated });
  } catch (err) {
    console.error("listing-questions PATCH error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
