-- Atomic ordinary pipeline stage move (stage + rank + audit, idempotent)

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stage_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  organisation_id uuid NOT NULL REFERENCES public.crm_organisations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.crm_profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS crm_pipeline_stage_ops_org_idx
  ON public.crm_pipeline_stage_operations(organisation_id);

CREATE OR REPLACE FUNCTION public.crm_move_organisation_pipeline_stage(
  p_idempotency_key text,
  p_organisation_id uuid,
  p_profile_id uuid,
  p_previous_stage text,
  p_destination_stage text,
  p_pipeline_manual_rank double precision,
  p_contact_id uuid DEFAULT NULL,
  p_peer_rank_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_op record;
  v_org record;
  v_from_label text;
  v_to_label text;
  v_outcome text;
  v_updated_at timestamptz;
  v_peer record;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency key required');
  END IF;

  IF p_destination_stage = 'closed_lost' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Use the Closed / Not Now flow for this stage.');
  END IF;

  IF p_previous_stage = p_destination_stage THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Source and destination stage must differ.');
  END IF;

  SELECT status, result, error_message
  INTO v_existing_op
  FROM public.crm_pipeline_stage_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND AND v_existing_op.status = 'completed' AND v_existing_op.result IS NOT NULL THEN
    RETURN v_existing_op.result;
  END IF;

  INSERT INTO public.crm_pipeline_stage_operations (
    idempotency_key, organisation_id, profile_id, payload, status
  )
  VALUES (
    p_idempotency_key,
    p_organisation_id,
    p_profile_id,
    jsonb_build_object(
      'organisationId', p_organisation_id,
      'previousStage', p_previous_stage,
      'destinationStage', p_destination_stage,
      'pipelineManualRank', p_pipeline_manual_rank
    ),
    'pending'
  )
  ON CONFLICT (idempotency_key) DO UPDATE
    SET status = EXCLUDED.status
  WHERE public.crm_pipeline_stage_operations.status <> 'completed';

  SELECT id, pipeline_stage, status
  INTO v_org
  FROM public.crm_organisations
  WHERE id = p_organisation_id
  FOR UPDATE;

  IF NOT FOUND OR v_org.status = 'archived' THEN
    UPDATE public.crm_pipeline_stage_operations
    SET status = 'failed', error_message = 'Organisation not found.', completed_at = now()
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', 'Organisation not found.');
  END IF;

  IF v_org.pipeline_stage IS DISTINCT FROM p_previous_stage THEN
    UPDATE public.crm_pipeline_stage_operations
    SET status = 'failed',
        error_message = 'Organisation is no longer in the expected source stage.',
        completed_at = now()
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Organisation is no longer in the expected source stage.'
    );
  END IF;

  IF jsonb_typeof(p_peer_rank_updates) = 'array' THEN
    FOR v_peer IN
      SELECT *
      FROM jsonb_to_recordset(p_peer_rank_updates) AS x(
        organisation_id uuid,
        pipeline_manual_rank double precision
      )
    LOOP
      UPDATE public.crm_organisations
      SET
        pipeline_manual_rank = v_peer.pipeline_manual_rank,
        pipeline_rank_updated_at = now(),
        pipeline_rank_updated_by = p_profile_id
      WHERE id = v_peer.organisation_id
        AND pipeline_stage = p_destination_stage
        AND id <> p_organisation_id;
    END LOOP;
  END IF;

  v_updated_at := now();

  UPDATE public.crm_organisations
  SET
    pipeline_stage = p_destination_stage,
    pipeline_manual_rank = p_pipeline_manual_rank,
    pipeline_rank_updated_at = v_updated_at,
    pipeline_rank_updated_by = p_profile_id,
    updated_at = v_updated_at
  WHERE id = p_organisation_id;

  v_from_label := public.crm_pipeline_stage_label(p_previous_stage);
  v_to_label := public.crm_pipeline_stage_label(p_destination_stage);
  v_outcome := 'From ' || v_from_label || ' to ' || v_to_label;

  INSERT INTO public.crm_engagements (
    organisation_id,
    contact_id,
    type,
    summary,
    outcome,
    direction,
    occurred_at,
    created_by
  )
  VALUES (
    p_organisation_id,
    p_contact_id,
    'note',
    'Pipeline stage updated',
    v_outcome,
    'internal',
    v_updated_at,
    p_profile_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'organisation_id', p_organisation_id,
    'previous_stage', p_previous_stage,
    'new_stage', p_destination_stage,
    'pipeline_manual_rank', p_pipeline_manual_rank,
    'updated_at', v_updated_at
  );

  UPDATE public.crm_pipeline_stage_operations
  SET status = 'completed', result = v_result, completed_at = now(), error_message = NULL
  WHERE idempotency_key = p_idempotency_key;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.crm_pipeline_stage_operations
    SET status = 'failed', error_message = SQLERRM, completed_at = now()
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_move_organisation_pipeline_stage(
  text, uuid, uuid, text, text, double precision, uuid, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_move_organisation_pipeline_stage(
  text, uuid, uuid, text, text, double precision, uuid, jsonb
) TO service_role;
