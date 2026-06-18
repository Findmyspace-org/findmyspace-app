/** AI Information documents — stored and indexed in full; gating is applied at chat time only. */

import { redactRestrictedAssistantContent } from "@/lib/space-assistant-contact-gating";

export type SpaceAiDocumentRow = {
  id: string;
  space_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  extracted_text: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SpaceAiDocumentChunkRow = {
  id: string;
  document_id: string;
  space_id: string;
  chunk_index: number;
  content: string;
  created_at: string;
};

export const SPACE_AI_KNOWLEDGE_BUCKET = "listing-ai-knowledge";

export const SPACE_AI_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const SPACE_AI_MAX_BYTES = 15 * 1024 * 1024;

const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 120;

export function chunkAiKnowledgeText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const piece = buffer.trim();
    if (piece) chunks.push(piece);
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    if (!buffer) {
      if (paragraph.length <= CHUNK_SIZE) {
        buffer = paragraph;
        continue;
      }
      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE).trim());
      }
      continue;
    }

    const candidate = `${buffer}\n\n${paragraph}`;
    if (candidate.length <= CHUNK_SIZE) {
      buffer = candidate;
    } else {
      flush();
      if (paragraph.length <= CHUNK_SIZE) {
        buffer = paragraph;
      } else {
        for (let i = 0; i < paragraph.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
          chunks.push(paragraph.slice(i, i + CHUNK_SIZE).trim());
        }
      }
    }
  }

  flush();
  return chunks.filter(Boolean);
}

export function searchAiKnowledgeChunks(
  chunks: SpaceAiDocumentChunkRow[],
  question: string,
  limit = 3
): SpaceAiDocumentChunkRow[] {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);

  if (tokens.length === 0) return chunks.slice(0, limit);

  const scored = chunks
    .map((chunk) => {
      const hay = chunk.content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += 1;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.chunk);
}

export function formatAiKnowledgeExcerpt(
  chunks: SpaceAiDocumentChunkRow[],
  canRevealRestricted: boolean
): string | null {
  if (chunks.length === 0) return null;

  const body = chunks.map((c) => c.content.trim()).join("\n\n");
  if (canRevealRestricted) return body;
  return redactRestrictedAssistantContent(body);
}
