import { NextRequest, NextResponse } from "next/server";
import { requireOwnerListingApi } from "@/lib/require-owner-listing-api";
import {
  getActiveAiKnowledgeDocument,
  listAiKnowledgeDocumentsForSpace,
  saveAiKnowledgeText,
  storeAiKnowledgeDocument,
} from "@/lib/space-ai-knowledge-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerListingApi(req, id);
  if ("response" in auth) return auth.response;

  try {
    const documents = await listAiKnowledgeDocumentsForSpace(auth.admin, id);
    const document = await getActiveAiKnowledgeDocument(auth.admin, id);
    return NextResponse.json({ documents, document });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load AI Information." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerListingApi(req, id);
  if ("response" in auth) return auth.response;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  try {
    const result = await storeAiKnowledgeDocument({
      admin: auth.admin,
      spaceId: id,
      uploadedBy: auth.userId,
      file,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 400 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireOwnerListingApi(req, id);
  if ("response" in auth) return auth.response;

  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  try {
    const result = await saveAiKnowledgeText({
      admin: auth.admin,
      spaceId: id,
      uploadedBy: auth.userId,
      text: body.text,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 }
    );
  }
}
