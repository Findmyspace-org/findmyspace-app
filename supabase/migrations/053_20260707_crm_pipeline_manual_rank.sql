-- Manual pipeline card ordering within a stage (shared across CRM desktop admins).

ALTER TABLE public.crm_organisations
  ADD COLUMN IF NOT EXISTS pipeline_manual_rank double precision,
  ADD COLUMN IF NOT EXISTS pipeline_rank_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_rank_updated_by uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_organisations_pipeline_stage_rank_idx
  ON public.crm_organisations (pipeline_stage, pipeline_manual_rank);

COMMENT ON COLUMN public.crm_organisations.pipeline_manual_rank IS
  'Fractional rank for manual ordering within pipeline_stage; lower values appear first when manual sort is active.';
