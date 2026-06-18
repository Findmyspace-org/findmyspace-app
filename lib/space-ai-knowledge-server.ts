import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTextFromAiDocument } from "@/lib/space-ai-document-extract";
import {
  chunkAiKnowledgeText,
  SPACE_AI_ALLOWED_MIME_TYPES,
  SPACE_AI_KNOWLEDGE_BUCKET,
  SPACE_AI_MAX_BYTES,
} from "@/lib/space-ai-knowledge";

export function validateAiKnowledgeUploadFile(file: File): string | null {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const mimeOk =
    SPACE_AI_ALLOWED_MIME_TYPES.has(file.type) ||
    ext === "pdf" ||
    ext === "docx";

  if (!mimeOk) {
    return "Invalid file type. Upload PDF or DOCX only.";
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > SPACE_AI_MAX_BYTES) {
    return `File is too large. Maximum size is ${Math.floor(SPACE_AI_MAX_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}

export async function storeAiKnowledgeDocument(params: {
  admin: SupabaseClient;
  spaceId: string;
  uploadedBy: string;
  file: File;
}): Promise<{ documentId: string; chunkCount: number }> {
  const validationError = validateAiKnowledgeUploadFile(params.file);
  if (validationError) {
    throw new Error(validationError);
  }

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const extractedText = await extractTextFromAiDocument(
    buffer,
    params.file.type,
    params.file.name
  );

  if (!extractedText.trim()) {
    throw new Error("Could not extract text from this document.");
  }

  const ext = (params.file.name.split(".").pop() || "bin").toLowerCase();
  const filePath = `${params.spaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const contentType =
    params.file.type ||
    (ext === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const { error: uploadErr } = await params.admin.storage
    .from(SPACE_AI_KNOWLEDGE_BUCKET)
    .upload(filePath, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
  }

  const { data: docRow, error: docErr } = await params.admin
    .from("space_ai_documents")
    .insert({
      space_id: params.spaceId,
      file_name: params.file.name,
      file_path: filePath,
      mime_type: contentType,
      file_size: params.file.size,
      extracted_text: extractedText,
      uploaded_by: params.uploadedBy,
    })
    .select("id")
    .single();

  if (docErr || !docRow) {
    await params.admin.storage.from(SPACE_AI_KNOWLEDGE_BUCKET).remove([filePath]);
    throw new Error(docErr?.message || "Could not save document record.");
  }

  const documentId = (docRow as { id: string }).id;
  const chunks = chunkAiKnowledgeText(extractedText);

  if (chunks.length > 0) {
    const { error: chunkErr } = await params.admin
      .from("space_ai_document_chunks")
      .insert(
        chunks.map((content, chunk_index) => ({
          document_id: documentId,
          space_id: params.spaceId,
          chunk_index,
          content,
        }))
      );

    if (chunkErr) {
      await params.admin.from("space_ai_documents").delete().eq("id", documentId);
      await params.admin.storage.from(SPACE_AI_KNOWLEDGE_BUCKET).remove([filePath]);
      throw new Error(chunkErr.message);
    }
  }

  return { documentId, chunkCount: chunks.length };
}

export async function loadAiKnowledgeChunksForSpace(
  admin: SupabaseClient,
  spaceId: string
) {
  const { data, error } = await admin
    .from("space_ai_document_chunks")
    .select("id, document_id, space_id, chunk_index, content, created_at")
    .eq("space_id", spaceId)
    .order("document_id", { ascending: true })
    .order("chunk_index", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as import("@/lib/space-ai-knowledge").SpaceAiDocumentChunkRow[];
}

export async function listAiKnowledgeDocumentsForSpace(
  admin: SupabaseClient,
  spaceId: string
) {
  const { data, error } = await admin
    .from("space_ai_documents")
    .select(
      "id, space_id, file_name, file_path, mime_type, file_size, extracted_text, uploaded_by, created_at, updated_at"
    )
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as import("@/lib/space-ai-knowledge").SpaceAiDocumentRow[];
}
