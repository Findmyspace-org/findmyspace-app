-- Verify AI Information Supabase setup (run in SQL editor after migrations 036 + 037).

SELECT
  to_regclass('public.space_ai_documents') IS NOT NULL AS documents_table,
  to_regclass('public.space_ai_document_chunks') IS NOT NULL AS chunks_table;

SELECT id, name, public
FROM storage.buckets
WHERE id = 'listing-ai-knowledge';

-- public must be false (private bucket).
