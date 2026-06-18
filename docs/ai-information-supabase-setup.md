# AI Information — Supabase setup

AI Information stores **extracted text in Postgres** and optionally **source PDF/DOCX files in Storage**.

| Feature | Requires |
|--------|----------|
| Manual paste / Save AI Information | Migration `036` (tables only) |
| PDF/DOCX upload | Migration `036` **and** private bucket `listing-ai-knowledge` |

## 1. Apply database migration

```bash
supabase db push
```

Or run manually:

- `supabase/migrations/036_20260602_space_ai_documents.sql` — creates `space_ai_documents`, `space_ai_document_chunks`
- `supabase/migrations/037_20260602_listing_ai_knowledge_bucket.sql` — creates the private storage bucket

## 2. Create the storage bucket (if not using migration 037)

In **Supabase Dashboard → Storage → New bucket**:

- **Name:** `listing-ai-knowledge`
- **Public:** off (private)
- **File size limit (optional):** 15 MB
- **Allowed MIME types (optional):** `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Or via SQL (same as migration 037):

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-ai-knowledge', 'listing-ai-knowledge', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
```

## 3. Verify setup

### Admin health check (authenticated admin)

```http
GET /api/admin/ai-knowledge/setup-health
Authorization: Bearer <admin access token>
```

Example response:

```json
{
  "documentsTable": true,
  "chunksTable": true,
  "storageBucket": true,
  "manualTextSaveReady": true,
  "documentUploadReady": true,
  "ready": true,
  "issues": []
}
```

If the bucket is missing:

```json
{
  "documentsTable": true,
  "chunksTable": true,
  "storageBucket": false,
  "manualTextSaveReady": true,
  "documentUploadReady": false,
  "ready": false,
  "issues": [
    "AI Information storage bucket is missing. Create a private Supabase storage bucket named listing-ai-knowledge."
  ]
}
```

### SQL checks

```sql
-- Tables
SELECT to_regclass('public.space_ai_documents') IS NOT NULL AS documents_table;
SELECT to_regclass('public.space_ai_document_chunks') IS NOT NULL AS chunks_table;

-- Bucket
SELECT id, name, public FROM storage.buckets WHERE id = 'listing-ai-knowledge';
```

`public` must be `false`.

## Troubleshooting

| Error | Fix |
|-------|-----|
| AI Information tables are not set up | Apply migration 036 |
| Storage bucket is missing | Create private bucket `listing-ai-knowledge` (migration 037 or Dashboard) |
| Manual save works, upload fails | Expected when bucket is missing — create the bucket for uploads |

Uploads use the **service role** on the server; no public bucket or client-side storage policies are required for the app API routes.
