-- The Space Place: duplicate profile detection + unique email (when safe)

-- ---------------------------------------------------------------------------
-- Find duplicate CRM profiles by email (run in SQL editor)
-- ---------------------------------------------------------------------------
-- select email, count(*)
-- from public.crm_profiles
-- where email is not null and btrim(email) <> ''
-- group by lower(btrim(email))
-- having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Suggested manual cleanup (review before running; does NOT auto-run)
-- ---------------------------------------------------------------------------
-- Keep the oldest active profile per email; deactivate extras:
--
-- WITH ranked AS (
--   SELECT
--     id,
--     row_number() OVER (
--       PARTITION BY lower(btrim(email))
--       ORDER BY created_at ASC, id ASC
--     ) AS rn
--   FROM public.crm_profiles
--   WHERE email IS NOT NULL AND btrim(email) <> ''
-- )
-- UPDATE public.crm_profiles p
-- SET active = false, updated_at = now()
-- FROM ranked r
-- WHERE p.id = r.id AND r.rn > 1;
--
-- Or merge assignments then delete duplicates only after confirming IDs:
-- UPDATE public.crm_organisations SET assigned_to = '<keep_id>' WHERE assigned_to IN (...);

-- ---------------------------------------------------------------------------
-- Helper view: duplicate emails
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.crm_profiles_duplicate_emails_v AS
SELECT
  lower(btrim(email)) AS email_normalized,
  count(*)::int AS profile_count,
  array_agg(id ORDER BY created_at) AS profile_ids,
  array_agg(full_name ORDER BY created_at) AS full_names
FROM public.crm_profiles
WHERE email IS NOT NULL AND btrim(email) <> ''
GROUP BY lower(btrim(email))
HAVING count(*) > 1;

COMMENT ON VIEW public.crm_profiles_duplicate_emails_v IS
  'Lists emails with more than one crm_profiles row. Review before cleanup.';

GRANT SELECT ON public.crm_profiles_duplicate_emails_v TO authenticated;

-- ---------------------------------------------------------------------------
-- Unique email (partial index) — only when no duplicates remain
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_profiles_duplicate_emails_v
    LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS crm_profiles_email_lower_unique_idx
      ON public.crm_profiles (lower(btrim(email)))
      WHERE email IS NOT NULL AND btrim(email) <> '';
  END IF;
END $$;
