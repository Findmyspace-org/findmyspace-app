-- Private Supabase Storage bucket for AI Information document uploads (PDF/DOCX).
-- Extracted text is stored in space_ai_documents; the bucket holds source files only.
-- Manual text entry does not use this bucket (file_path = manual/{space_id}).

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-ai-knowledge', 'listing-ai-knowledge', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
