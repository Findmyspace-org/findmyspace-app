import { NextRequest, NextResponse } from "next/server";
import { requireOwnerListingApi } from "@/lib/require-owner-listing-api";
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireOwnerListingApi(req, id);
    if ("response" in auth) return auth.response;

    const documents = await listAiKnowledgeDocumentsForSpace(auth.admin, id);
    const document = await getActiveAiKnowledgeDocument(auth.admin, id);
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
    const { id } = await params;
    const auth = await requireOwnerListingApi(req, id);
    if ("response" in auth) return auth.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const result = await storeAiKnowledgeDocument({
      admin: auth.admin,
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
    const { id } = await params;
    const auth = await requireOwnerListingApi(req, id);
    if ("response" in auth) return auth.response;

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
      admin: auth.admin,
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
