import type { SupabaseClient } from "@supabase/supabase-js";
import { SPACE_AI_KNOWLEDGE_BUCKET } from "@/lib/space-ai-knowledge";

export const AI_KNOWLEDGE_BUCKET_MISSING_MESSAGE =
  "AI Information storage bucket is missing. Create a private Supabase storage bucket named listing-ai-knowledge.";

export const AI_KNOWLEDGE_TABLES_MISSING_MESSAGE =
  "AI Information tables are not set up. Please apply migration 036.";

export type AiKnowledgeSetupHealth = {
  documentsTable: boolean;
  chunksTable: boolean;
  storageBucket: boolean;
  /** Tables exist — manual text save works without Storage. */
  manualTextSaveReady: boolean;
  /** Tables + private bucket — PDF/DOCX upload works. */
  documentUploadReady: boolean;
  ready: boolean;
  issues: string[];
};

export function isAiKnowledgeStorageBucketMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("bucket not found") ||
    lower.includes("bucket does not exist") ||
    (lower.includes("listing-ai-knowledge") && lower.includes("not found"))
  );
}

async function tableExists(
  admin: SupabaseClient,
  table: "space_ai_documents" | "space_ai_document_chunks"
): Promise<boolean> {
  const { error } = await admin.from(table).select("id").limit(1);
  if (!error) return true;

  const message = error.message.toLowerCase();
  if (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    return false;
  }

  // Unexpected error (permissions, etc.) — treat as present to avoid false negatives.
  return true;
}

async function storageBucketExists(admin: SupabaseClient): Promise<boolean> {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (!listErr && buckets?.some((bucket) => bucket.id === SPACE_AI_KNOWLEDGE_BUCKET)) {
    return true;
  }

  const { error: probeErr } = await admin.storage
    .from(SPACE_AI_KNOWLEDGE_BUCKET)
    .list("", { limit: 1 });

  if (!probeErr) return true;
  return !isAiKnowledgeStorageBucketMissingError(probeErr.message);
}

export async function checkAiKnowledgeSetup(
  admin: SupabaseClient
): Promise<AiKnowledgeSetupHealth> {
  const [documentsTable, chunksTable, storageBucket] = await Promise.all([
    tableExists(admin, "space_ai_documents"),
    tableExists(admin, "space_ai_document_chunks"),
    storageBucketExists(admin),
  ]);

  const issues: string[] = [];

  if (!documentsTable || !chunksTable) {
    issues.push(AI_KNOWLEDGE_TABLES_MISSING_MESSAGE);
  }
  if (!storageBucket) {
    issues.push(AI_KNOWLEDGE_BUCKET_MISSING_MESSAGE);
  }

  const manualTextSaveReady = documentsTable && chunksTable;
  const documentUploadReady = manualTextSaveReady && storageBucket;

  return {
    documentsTable,
    chunksTable,
    storageBucket,
    manualTextSaveReady,
    documentUploadReady,
    ready: manualTextSaveReady && storageBucket,
    issues,
  };
}
