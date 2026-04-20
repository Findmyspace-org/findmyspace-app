-- Speed up admin stats / detail queries filtered by advisor_id
CREATE INDEX IF NOT EXISTS spaces_advisor_id_status_idx
  ON public.spaces (advisor_id, status)
  WHERE advisor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS spaces_advisor_id_created_at_idx
  ON public.spaces (advisor_id, created_at DESC)
  WHERE advisor_id IS NOT NULL;
