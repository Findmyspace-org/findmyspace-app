import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const { spaceId } = await context.params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => null)) as {
    ruleId?: string;
    date?: string;
    action?: string;
    localStart?: string | null;
    localEnd?: string | null;
    wholeDay?: boolean;
    reason?: string | null;
    fromDate?: string | null;
    weekdays?: number[] | null;
  } | null;
  if (!body?.ruleId) {
    return NextResponse.json({ error: "Choose a restriction." }, { status: 400 });
  }

  if (body.fromDate && body.weekdays) {
    const { data, error } = await auth.admin.rpc("split_availability_rule_from_date", {
      p_rule_id: body.ruleId,
      p_from: body.fromDate,
      p_weekdays: body.weekdays,
      p_whole_day: Boolean(body.wholeDay),
      p_local_start: body.localStart ?? null,
      p_local_end: body.localEnd ?? null,
      p_actor: auth.userId,
      p_reason: body.reason ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ id: data });
  }

  const { data, error } = await auth.admin.rpc("open_availability_exception", {
    p_rule_id: body.ruleId,
    p_date: body.date,
    p_action: body.action ?? "open",
    p_local_start: body.localStart ?? null,
    p_local_end: body.localEnd ?? null,
    p_whole_day: Boolean(body.wholeDay),
    p_actor: auth.userId,
    p_reason: body.reason ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ id: data });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { spaceId } = await context.params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;
  const exceptionId = req.nextUrl.searchParams.get("exceptionId");
  if (!exceptionId) {
    return NextResponse.json({ error: "Choose the exception to restore." }, { status: 400 });
  }
  const { error } = await auth.admin.rpc("restore_availability_exception", {
    p_exception_id: exceptionId,
    p_actor: auth.userId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ restored: true });
}
