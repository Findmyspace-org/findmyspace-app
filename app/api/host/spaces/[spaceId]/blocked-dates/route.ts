import { NextRequest, NextResponse } from "next/server";
import { requireManagedListingApi } from "@/lib/access/require-managed-api";
import { publicAvailabilityMessage } from "@/lib/availability/messages";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conflictResponse(message: string) {
  const text = publicAvailabilityMessage(message);
  const status = message.includes("space_unavailable") ? 409 : 400;
  return NextResponse.json({ error: text }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  const { spaceId } = await params;
  const auth = await requireManagedListingApi(req, spaceId);
  if ("response" in auth) return auth.response;

  let body: { startAt?: unknown; endAt?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const startAt = typeof body.startAt === "string" ? body.startAt : "";
  const endAt = typeof body.endAt === "string" ? body.endAt : "";
  const reason = typeof body.reason === "string" ? body.reason : null;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json(
      { error: "Choose a valid start and end." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.admin.rpc("insert_blocked_date", {
    p_space_id: spaceId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_reason: reason,
  });

  if (error) {
    return conflictResponse(error.message || "Could not block availability.");
  }

  return NextResponse.json({ blockedDate: data });
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
    return NextResponse.json({ error: "Invalid blocked period id." }, { status: 400 });
  }

  const { error } = await auth.admin.rpc("delete_blocked_date", {
    p_id: id,
    p_space_id: spaceId,
  });

  if (error) {
    const message = error.message || "Could not remove blocked availability.";
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Blocked period not found." }, { status: 404 });
    }
    return conflictResponse(message);
  }

  return NextResponse.json({ ok: true, id });
}
