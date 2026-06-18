export function textByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function parseAiKnowledgeTextBody(body: Record<string, unknown>): string | null {
  const value = body.text ?? body.text_content;
  return typeof value === "string" ? value : null;
}

export function formatAiKnowledgeError(err: unknown): string {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Save failed.";

  if (
    /space_ai_documents|space_ai_document_chunks/i.test(message) &&
    /does not exist|could not find the table|schema cache|relation .* does not exist/i.test(
      message
    )
  ) {
    return "AI Information tables are not set up. Please apply migration 036.";
  }

  if (/listing-ai-knowledge|bucket not found|Bucket not found/i.test(message)) {
    return "AI Information storage bucket is missing: listing-ai-knowledge.";
  }

  if (
    /unable to extract text from pdf|DOMMatrix|pdfjs|pdf\.js|canvas/i.test(message)
  ) {
    return "Unable to extract text from PDF";
  }

  if (/unable to extract text from docx/i.test(message)) {
    return "Unable to extract text from DOCX";
  }

  return message;
}
