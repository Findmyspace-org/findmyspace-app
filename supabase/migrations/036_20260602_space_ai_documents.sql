-- AI Information / knowledge base for spaces (full-text storage; chat gating is app-layer).

CREATE TABLE IF NOT EXISTS public.space_ai_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  extracted_text text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_ai_documents_space_id_idx
  ON public.space_ai_documents (space_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.space_ai_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.space_ai_documents(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS space_ai_document_chunks_space_id_idx
  ON public.space_ai_document_chunks (space_id, document_id, chunk_index);

COMMENT ON TABLE public.space_ai_documents IS
  'Owner/admin AI Information uploads. extracted_text is stored in full — never redacted at rest.';
COMMENT ON TABLE public.space_ai_document_chunks IS
  'Search/RAG chunks derived from space_ai_documents.extracted_text.';

ALTER TABLE public.space_ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_ai_document_chunks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_ai_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_ai_document_chunks TO service_role;

-- Source PDF/DOCX files: private bucket listing-ai-knowledge (migration 037).
-- Manual text entry uses file_path manual/{space_id} and does not require Storage.
