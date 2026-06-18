import { NextRequest, NextResponse } from "next/server";
import { requireOwnerListingApi } from "@/lib/require-owner-listing-api";
import {
  listAiKnowledgeDocumentsForSpace,
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
    return NextResponse.json({ documents });
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
