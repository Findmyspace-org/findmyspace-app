import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  formatAiKnowledgeError,
  parseAiKnowledgeTextBody,
} from "@/lib/space-ai-knowledge-errors";
import {
  getActiveAiKnowledgeDocument,
  listAiKnowledgeDocumentsForSpace,
  saveAiKnowledgeText,
  storeAiKnowledgeDocument,
} from "@/lib/space-ai-knowledge-server";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const documents = await listAiKnowledgeDocumentsForSpace(admin, id);
    const document = await getActiveAiKnowledgeDocument(admin, id);
    return NextResponse.json({ documents, document });
  } catch (err) {
    return NextResponse.json(
      { error: formatAiKnowledgeError(err) },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const result = await storeAiKnowledgeDocument({
      admin,
      spaceId: id,
      uploadedBy: auth.userId,
      file,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: formatAiKnowledgeError(err) },
      { status: 400 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const text = parseAiKnowledgeTextBody(body);
    if (text === null) {
      return NextResponse.json(
        { error: "text or text_content is required." },
        { status: 400 }
      );
    }

    const result = await saveAiKnowledgeText({
      admin,
      spaceId: id,
      uploadedBy: auth.userId,
      text,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = formatAiKnowledgeError(err);
    const status = /cannot be empty|is required/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
