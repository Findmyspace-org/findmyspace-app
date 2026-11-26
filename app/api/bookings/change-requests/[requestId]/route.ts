import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedApi } from "@/lib/require-authenticated-api";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedApi(req);
  if ("response" in auth) return auth.response;
  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) {
    return NextResponse.json({ error: "Invalid change." }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { accept?: boolean } | null;
  const { data, error } = await auth.admin.rpc("decide_booking_change_request", {
    p_request_id: requestId,
    p_actor: auth.userId,
    p_accept: Boolean(body?.accept),
  });
  if (error) {
    return NextResponse.json(
      { error: (error.message || "Could not decide the change.").replace(/^.*?:\s*/, "") },
      { status: 409 }
    );
  }
  return NextResponse.json(data);
}
