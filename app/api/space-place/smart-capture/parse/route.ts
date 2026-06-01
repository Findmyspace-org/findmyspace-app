import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi } from "@/lib/require-crm-api";
import { parseSmartCaptureText } from "@/lib/space-place/smart-capture-build";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth.response;

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  if (text.length > 4000) {
    return NextResponse.json(
      { error: "text must be 4000 characters or less." },
      { status: 400 }
    );
  }

  try {
    const result = await parseSmartCaptureText(text, auth.userClient);
    return NextResponse.json(result);
  } catch (error) {
    console.error("smart-capture parse:", error);
    const message =
      error instanceof Error ? error.message : "Failed to parse capture.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
