-- Detect duplicate CRM profiles by display name (multiple auth users seeded as "Schalk van der Merwe")

-- ---------------------------------------------------------------------------
-- Find duplicate names (run in SQL editor)
-- ---------------------------------------------------------------------------
-- select lower(btrim(full_name)) as name, count(*)
-- from public.crm_profiles
-- where full_name is not null and btrim(full_name) <> ''
-- group by lower(btrim(full_name))
-- having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Suggested manual cleanup by name (review first; does NOT auto-run)
-- ---------------------------------------------------------------------------
-- WITH ranked AS (
--   SELECT
--     id,
--     row_number() OVER (
--       PARTITION BY lower(btrim(full_name))
--       ORDER BY
--         CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
--         CASE WHEN email IS NOT NULL AND btrim(email) <> '' THEN 0 ELSE 1 END,
--         created_at ASC,
--         id ASC
--     ) AS rn
--   FROM public.crm_profiles
--   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
-- )
-- UPDATE public.crm_profiles p
-- SET active = false, updated_at = now()
-- FROM ranked r
-- WHERE p.id = r.id AND r.rn > 1;

CREATE OR REPLACE VIEW public.crm_profiles_duplicate_names_v AS
SELECT
  lower(btrim(full_name)) AS name_normalized,
  count(*)::int AS profile_count,
  array_agg(id ORDER BY created_at) AS profile_ids,
  array_agg(email ORDER BY created_at) AS emails
FROM public.crm_profiles
WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
GROUP BY lower(btrim(full_name))
HAVING count(*) > 1;

COMMENT ON VIEW public.crm_profiles_duplicate_names_v IS
  'Lists display names shared by more than one crm_profiles row.';

GRANT SELECT ON public.crm_profiles_duplicate_names_v TO authenticated;
