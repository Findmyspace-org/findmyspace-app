import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import {
  parseAvailabilityRuleDraft,
  type AvailabilityRuleDraft,
} from "@/lib/availability-rules";
import { publicAvailabilityMessage } from "@/lib/availability/messages";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conflictResponse(message: string) {
  const text = publicAvailabilityMessage(message);
  const status = message.includes("not found") ? 404 : message.includes("space_unavailable") ? 409 : 400;
  return NextResponse.json({ error: text }, { status });
}

function draftFromBody(body: Partial<AvailabilityRuleDraft> & { id?: unknown }): AvailabilityRuleDraft {
  return {
    reason: typeof body.reason === "string" ? body.reason : "",
    weekdays: Array.isArray(body.weekdays) ? body.weekdays.map((day) => Number(day)) : [],
    wholeDay: Boolean(body.wholeDay),
    localStart: typeof body.localStart === "string" ? body.localStart : "",
    localEnd: typeof body.localEnd === "string" ? body.localEnd : "",
    startsOn: typeof body.startsOn === "string" ? body.startsOn : "",
    endsOn: typeof body.endsOn === "string" ? body.endsOn : "",
    noEnd: Boolean(body.noEnd),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.admin
    .from("availability_rules")
    .select("id, space_id, reason, weekdays, whole_day, local_start, local_end, starts_on, ends_on")
    .eq("space_id", spaceId)
    .is("removed_at", null)
    .order("starts_on", { ascending: true });

  if (error) {
    if (/availability_rules/i.test(error.message || "")) {
      return NextResponse.json({ rules: [], exceptions: [] });
    }
    return NextResponse.json({ error: "Could not load availability restrictions." }, { status: 500 });
  }

  const { data: exceptions, error: exceptionError } = await auth.admin
    .from("availability_rule_exceptions")
    .select("id, rule_id, exception_date, action, local_start, local_end, whole_day, reason")
    .eq("space_id", spaceId)
    .is("removed_at", null);
  if (exceptionError) {
    return NextResponse.json({ rules: data || [], exceptions: [] });
  }

  return NextResponse.json({ rules: data || [], exceptions: exceptions || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;

  let body: Partial<AvailabilityRuleDraft> & { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (id && !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid restriction id." }, { status: 400 });
  }
  const parsed = parseAvailabilityRuleDraft(draftFromBody(body), spaceId, id);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await auth.admin.rpc("save_availability_rule", {
    p_space_id: spaceId,
    p_actor: auth.userId,
    p_rule: {
      id: id || null,
      reason: parsed.rule.reason,
      weekdays: parsed.rule.weekdays,
      wholeDay: parsed.rule.wholeDay,
      localStart: parsed.rule.localStart,
      localEnd: parsed.rule.localEnd,
      startsOn: parsed.rule.startsOn,
      endsOn: parsed.rule.endsOn,
    },
  });

  if (error) return conflictResponse(error.message || "Could not save the restriction.");
  return NextResponse.json({ rule: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid restriction id." }, { status: 400 });
  }

  const { error } = await auth.admin.rpc("archive_availability_rule", {
    p_space_id: spaceId,
    p_id: id,
    p_actor: auth.userId,
  });

  if (error) return conflictResponse(error.message || "Could not remove the restriction.");
  return NextResponse.json({ ok: true, id });
}
