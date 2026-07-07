-- Atomic Closed / Not Now pipeline close (marketing audience + optional task)

CREATE OR REPLACE FUNCTION public.crm_normalise_marketing_email(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
  addr text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  t := lower(btrim(raw));
  IF t ~ '<[^>]+>' THEN
    addr := lower((regexp_match(t, '<([^>]+)>'))[1]);
  ELSE
    addr := t;
  END IF;
  IF addr LIKE '%@%' THEN
    RETURN addr;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_pipeline_stage_label(stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE stage
    WHEN 'prospect' THEN 'Prospect'
    WHEN 'first_contact' THEN 'First Contact'
    WHEN 'follow_up' THEN 'Follow-up'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'signed_up' THEN 'Signed Up'
    WHEN 'listed' THEN 'Listed'
    WHEN 'closed_lost' THEN 'Closed / Not Now'
    ELSE COALESCE(stage, 'Unknown')
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_close_organisation_pipeline_lost(
  p_idempotency_key text,
  p_organisation_id uuid,
  p_profile_id uuid,
  p_previous_stage text,
  p_lost_reason text,
  p_outcome_category text,
  p_detail_note text DEFAULT NULL,
  p_marketing_audience_mode text DEFAULT 'store_only',
  p_selected_contact_ids uuid[] DEFAULT '{}',
  p_create_follow_up_task boolean DEFAULT false,
  p_task_title text DEFAULT NULL,
  p_task_due_date date DEFAULT NULL,
  p_task_owner_id uuid DEFAULT NULL,
  p_task_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_op record;
  v_org record;
  v_previous_stage text;
  v_lost_reason text;
  v_from_label text;
  v_outcome text;
  v_contact record;
  v_existing_mc record;
  v_email_norm text;
  v_preserved_terminal boolean;
  v_mc_id uuid;
  v_list_slugs text[];
  v_slug text;
  v_list_id uuid;
  v_task_id uuid;
  v_marketing_contact_ids uuid[] := '{}';
  v_result jsonb;
  v_status text;
  v_consent_status text;
  v_lawful_basis text;
  v_has_existing_mc boolean;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency key required');
  END IF;

  v_lost_reason := btrim(COALESCE(p_lost_reason, ''));
  IF v_lost_reason = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A reason is required for Closed / Not Now.');
  END IF;
  IF p_detail_note IS NOT NULL AND btrim(p_detail_note) <> '' THEN
    v_lost_reason := v_lost_reason || ' — ' || btrim(p_detail_note);
  END IF;

  SELECT status, result, error_message
  INTO v_existing_op
  FROM public.crm_pipeline_close_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND AND v_existing_op.status = 'completed' AND v_existing_op.result IS NOT NULL THEN
    RETURN v_existing_op.result;
  END IF;

  INSERT INTO public.crm_pipeline_close_operations (
    idempotency_key, organisation_id, profile_id, payload, status
  )
  VALUES (
    p_idempotency_key,
    p_organisation_id,
    p_profile_id,
    jsonb_build_object(
      'organisationId', p_organisation_id,
      'previousStage', p_previous_stage,
      'lostReason', p_lost_reason,
      'outcomeCategory', p_outcome_category,
      'marketingAudienceMode', p_marketing_audience_mode
    ),
    'pending'
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET
    organisation_id = EXCLUDED.organisation_id,
    profile_id = EXCLUDED.profile_id,
    payload = EXCLUDED.payload,
    status = 'pending',
    error_message = NULL;

  SELECT id, pipeline_stage, lost_reason
  INTO v_org
  FROM public.crm_organisations
  WHERE id = p_organisation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.crm_pipeline_close_operations
    SET status = 'failed', error_message = 'Organisation not found.'
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', 'Organisation not found.');
  END IF;

  IF v_org.pipeline_stage = 'closed_lost' THEN
    UPDATE public.crm_pipeline_close_operations
    SET status = 'failed', error_message = 'Organisation is already in Closed / Not Now.'
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', 'Organisation is already in Closed / Not Now.');
  END IF;

  v_previous_stage := COALESCE(NULLIF(btrim(p_previous_stage), ''), v_org.pipeline_stage);
  v_from_label := public.crm_pipeline_stage_label(v_previous_stage);
  v_outcome := 'From ' || v_from_label || ' to ' || public.crm_pipeline_stage_label('closed_lost')
    || ' · Category: ' || COALESCE(p_outcome_category, 'other');
  IF p_detail_note IS NOT NULL AND btrim(p_detail_note) <> '' THEN
    v_outcome := v_outcome || ' · ' || btrim(p_detail_note);
  END IF;

  UPDATE public.crm_organisations
  SET
    pipeline_stage = 'closed_lost',
    lost_reason = v_lost_reason,
    closed_at = now(),
    updated_at = now()
  WHERE id = p_organisation_id;

  INSERT INTO public.crm_engagements (
    organisation_id, contact_id, type, summary, outcome, occurred_at, created_by
  )
  VALUES (
    p_organisation_id,
    p_task_contact_id,
    'note',
    'Pipeline stage updated',
    v_outcome,
    now(),
    p_profile_id
  );

  IF p_marketing_audience_mode IS DISTINCT FROM 'none'
     AND COALESCE(array_length(p_selected_contact_ids, 1), 0) > 0 THEN
    v_list_slugs := ARRAY['closed-not-now'];
    IF p_marketing_audience_mode = 'general_updates' THEN
      v_list_slugs := v_list_slugs || ARRAY['general-updates'];
    ELSIF p_marketing_audience_mode = 'launch_announcements' THEN
      v_list_slugs := v_list_slugs || ARRAY['go-live-announcements'];
    END IF;

    FOR v_contact IN
      SELECT c.id, c.organisation_id, c.email
      FROM public.crm_contacts c
      WHERE c.organisation_id = p_organisation_id
        AND c.id = ANY (p_selected_contact_ids)
    LOOP
      v_email_norm := public.crm_normalise_marketing_email(v_contact.email);

      SELECT *
      INTO v_existing_mc
      FROM public.crm_marketing_contacts
      WHERE crm_contact_id = v_contact.id;

      v_has_existing_mc := FOUND;

      v_preserved_terminal := v_has_existing_mc AND (
        v_existing_mc.unsubscribe_at IS NOT NULL
        OR v_existing_mc.suppressed_at IS NOT NULL
        OR v_existing_mc.status IN ('unsubscribed', 'suppressed')
      );

      IF v_preserved_terminal THEN
        v_status := v_existing_mc.status;
        v_consent_status := v_existing_mc.consent_status;
        v_lawful_basis := v_existing_mc.lawful_basis;
      ELSIF v_email_norm IS NULL THEN
        v_status := 'invalid_email';
        v_consent_status := CASE WHEN v_has_existing_mc THEN v_existing_mc.consent_status ELSE 'unknown' END;
        v_lawful_basis := CASE WHEN v_has_existing_mc THEN v_existing_mc.lawful_basis ELSE 'review_required' END;
      ELSIF v_has_existing_mc AND v_existing_mc.status = 'subscribed'
            AND v_existing_mc.consent_status = 'granted' THEN
        v_status := 'subscribed';
        v_consent_status := 'granted';
        v_lawful_basis := COALESCE(v_existing_mc.lawful_basis, 'consent');
      ELSIF v_has_existing_mc AND v_existing_mc.status = 'eligible_customer'
            AND v_existing_mc.lawful_basis = 'existing_customer_similar_services' THEN
        v_status := 'eligible_customer';
        v_consent_status := 'not_required';
        v_lawful_basis := 'existing_customer_similar_services';
      ELSE
        v_status := 'pending_consent';
        v_consent_status := 'unknown';
        v_lawful_basis := 'review_required';
      END IF;

      INSERT INTO public.crm_marketing_contacts (
        crm_contact_id,
        crm_organisation_id,
        email,
        email_normalised,
        status,
        consent_status,
        lawful_basis,
        created_from,
        created_from_pipeline_stage,
        created_by
      )
      VALUES (
        v_contact.id,
        p_organisation_id,
        v_contact.email,
        v_email_norm,
        v_status,
        v_consent_status,
        v_lawful_basis,
        'pipeline_closed_lost',
        'closed_lost',
        p_profile_id
      )
      ON CONFLICT (crm_contact_id) DO UPDATE
      SET
        crm_organisation_id = EXCLUDED.crm_organisation_id,
        email = EXCLUDED.email,
        email_normalised = EXCLUDED.email_normalised,
        updated_at = now(),
        status = CASE WHEN v_preserved_terminal THEN public.crm_marketing_contacts.status ELSE EXCLUDED.status END,
        consent_status = CASE WHEN v_preserved_terminal THEN public.crm_marketing_contacts.consent_status ELSE EXCLUDED.consent_status END,
        lawful_basis = CASE WHEN v_preserved_terminal THEN public.crm_marketing_contacts.lawful_basis ELSE EXCLUDED.lawful_basis END
      RETURNING id INTO v_mc_id;

      v_marketing_contact_ids := array_append(v_marketing_contact_ids, v_mc_id);

      INSERT INTO public.crm_marketing_audits (
        action, actor_id, marketing_contact_id, crm_contact_id, crm_organisation_id,
        previous_value, new_value, source
      )
      VALUES (
        CASE WHEN v_has_existing_mc THEN 'marketing_contact_updated' ELSE 'marketing_contact_created' END,
        p_profile_id,
        v_mc_id,
        v_contact.id,
        p_organisation_id,
        CASE WHEN v_has_existing_mc THEN to_jsonb(v_existing_mc) ELSE NULL END,
        jsonb_build_object(
          'status', v_status,
          'email_normalised', v_email_norm,
          'marketing_audience_mode', p_marketing_audience_mode
        ),
        'pipeline_closed_lost'
      );

      FOREACH v_slug IN ARRAY v_list_slugs LOOP
        SELECT id INTO v_list_id
        FROM public.crm_marketing_lists
        WHERE slug = v_slug AND active = true;

        IF v_list_id IS NULL THEN
          RAISE EXCEPTION 'Marketing list not found: %', v_slug;
        END IF;

        INSERT INTO public.crm_marketing_list_members (
          marketing_contact_id, marketing_list_id, source, added_by
        )
        VALUES (
          v_mc_id, v_list_id, 'pipeline_closed_lost', p_profile_id
        )
        ON CONFLICT (marketing_contact_id, marketing_list_id) DO NOTHING;

        INSERT INTO public.crm_marketing_audits (
          action, actor_id, marketing_contact_id, crm_contact_id, crm_organisation_id,
          marketing_list_id, new_value, source
        )
        VALUES (
          'added_to_list',
          p_profile_id,
          v_mc_id,
          v_contact.id,
          p_organisation_id,
          v_list_id,
          jsonb_build_object('slug', v_slug),
          'pipeline_closed_lost'
        );
      END LOOP;
    END LOOP;
  END IF;

  v_task_id := NULL;
  IF p_create_follow_up_task AND p_task_title IS NOT NULL AND btrim(p_task_title) <> '' THEN
    INSERT INTO public.crm_tasks (
      organisation_id,
      contact_id,
      title,
      description,
      due_date,
      status,
      priority,
      owner_id
    )
    VALUES (
      p_organisation_id,
      p_task_contact_id,
      btrim(p_task_title),
      NULLIF(btrim(COALESCE(p_detail_note, '')), ''),
      p_task_due_date,
      'open',
      'normal',
      COALESCE(p_task_owner_id, p_profile_id)
    )
    RETURNING id INTO v_task_id;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'organisationId', p_organisation_id,
    'taskId', v_task_id,
    'marketingContactIds', to_jsonb(v_marketing_contact_ids)
  );

  UPDATE public.crm_pipeline_close_operations
  SET
    status = 'completed',
    result = v_result,
    completed_at = now(),
    error_message = NULL
  WHERE idempotency_key = p_idempotency_key;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.crm_pipeline_close_operations
    SET
      status = 'failed',
      error_message = SQLERRM
    WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_close_organisation_pipeline_lost(
  text, uuid, uuid, text, text, text, text, text, uuid[], boolean, text, date, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_close_organisation_pipeline_lost(
  text, uuid, uuid, text, text, text, text, text, uuid[], boolean, text, date, uuid, uuid
) TO service_role;

CREATE INDEX IF NOT EXISTS crm_marketing_list_members_list_idx
  ON public.crm_marketing_list_members(marketing_list_id);
