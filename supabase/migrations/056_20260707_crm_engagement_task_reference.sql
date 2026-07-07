-- Explicit task reference on CRM engagements (completion linking + timeline dedup)

ALTER TABLE public.crm_engagements
  ADD COLUMN IF NOT EXISTS task_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'crm_engagements'
      AND constraint_name = 'crm_engagements_task_id_fkey'
  ) THEN
    ALTER TABLE public.crm_engagements
      ADD CONSTRAINT crm_engagements_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES public.crm_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_engagements_task_id_idx
  ON public.crm_engagements(task_id);

CREATE INDEX IF NOT EXISTS crm_engagements_org_task_id_idx
  ON public.crm_engagements(organisation_id, task_id)
  WHERE task_id IS NOT NULL;

-- Conservative backfill before unique completion index (idempotent)
DO $$
DECLARE
  r record;
  v_candidates uuid[];
  v_match uuid;
  v_scanned int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_ambiguous int := 0;
  v_skipped_taken int := 0;
BEGIN
  FOR r IN
    SELECT e.id, e.organisation_id, e.summary, e.occurred_at
    FROM public.crm_engagements e
    WHERE e.type = 'task'
      AND e.task_id IS NULL
    ORDER BY e.occurred_at ASC
  LOOP
    v_scanned := v_scanned + 1;
    v_match := NULL;

    SELECT array_agg(t.id ORDER BY t.completed_at)
    INTO v_candidates
    FROM public.crm_tasks t
    WHERE t.organisation_id = r.organisation_id
      AND t.status = 'done'
      AND t.title IS NOT DISTINCT FROM r.summary
      AND t.completed_at IS NOT NULL
      AND abs(extract(epoch FROM (t.completed_at - r.occurred_at))) < 60;

    IF v_candidates IS NULL OR array_length(v_candidates, 1) IS NULL THEN
      v_unmatched := v_unmatched + 1;
    ELSIF array_length(v_candidates, 1) > 1 THEN
      v_ambiguous := v_ambiguous + 1;
    ELSE
      v_match := v_candidates[1];
      IF EXISTS (
        SELECT 1
        FROM public.crm_engagements e2
        WHERE e2.task_id = v_match
          AND e2.type = 'task'
          AND e2.id <> r.id
      ) THEN
        v_skipped_taken := v_skipped_taken + 1;
      ELSE
        UPDATE public.crm_engagements
        SET task_id = v_match
        WHERE id = r.id
          AND task_id IS NULL;
        v_matched := v_matched + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'crm_engagement_task_backfill scanned=% matched=% unmatched=% ambiguous=% skipped_taken=%',
    v_scanned, v_matched, v_unmatched, v_ambiguous, v_skipped_taken;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_engagements_task_completion_unique_idx
  ON public.crm_engagements(task_id)
  WHERE type = 'task' AND task_id IS NOT NULL;

-- Atomic task completion record (task status + single completion engagement)
CREATE OR REPLACE FUNCTION public.crm_complete_task_record(
  p_task_id uuid,
  p_profile_id uuid,
  p_organisation_id uuid,
  p_contact_id uuid,
  p_task_title text,
  p_outcome text
)
RETURNS TABLE (
  completed_at timestamptz,
  engagement_created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task record;
  v_now timestamptz := now();
  v_completed timestamptz;
  v_existing_eng uuid;
  v_can_complete boolean := false;
BEGIN
  SELECT *
  INTO v_task
  FROM public.crm_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  v_can_complete := public.crm_is_admin()
    OR v_task.owner_id = auth.uid()
    OR (
      public.crm_user_role() = 'spacer'
      AND v_task.organisation_id IS NOT NULL
      AND public.crm_can_access_org(v_task.organisation_id)
    );

  IF NOT v_can_complete THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT e.id
  INTO v_existing_eng
  FROM public.crm_engagements e
  WHERE e.task_id = p_task_id
    AND e.type = 'task'
  LIMIT 1;

  IF v_task.status = 'done' THEN
    v_completed := COALESCE(v_task.completed_at, v_now);
    IF v_existing_eng IS NOT NULL THEN
      RETURN QUERY SELECT v_completed, false;
      RETURN;
    END IF;
  ELSE
    UPDATE public.crm_tasks
    SET status = 'done',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = p_task_id;
    v_completed := v_now;
  END IF;

  IF p_organisation_id IS NOT NULL THEN
    INSERT INTO public.crm_engagements (
      organisation_id,
      contact_id,
      type,
      summary,
      outcome,
      direction,
      occurred_at,
      created_by,
      task_id
    ) VALUES (
      p_organisation_id,
      p_contact_id,
      'task',
      p_task_title,
      p_outcome,
      'internal',
      v_completed,
      p_profile_id,
      p_task_id
    );
    RETURN QUERY SELECT v_completed, true;
  ELSE
    RETURN QUERY SELECT v_completed, false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_complete_task_record(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_complete_task_record(
  uuid, uuid, uuid, uuid, text, text
) TO authenticated;
