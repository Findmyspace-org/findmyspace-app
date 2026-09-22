-- Organisation commercial profile, verification, versioned banking, and booking
-- commercial-beneficiary snapshot. Additive and backward compatible.
--
-- Does not auto-verify any Organisation.
-- Does not change properties.owner_id or spaces.owner_id.
-- Does not expose organisation_bank_accounts to authenticated SELECT.
-- Does not create a masked bank view.
-- Mutations are service-role / SECURITY DEFINER. PayFast is unchanged.

-- ---------------------------------------------------------------------------
-- organisation_commercial_profiles (1:1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_commercial_profiles (
  organisation_id uuid PRIMARY KEY
    REFERENCES public.organisations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trading_name text,
  organisation_type text
    CHECK (
      organisation_type IS NULL
      OR organisation_type IN (
        'school',
        'municipality',
        'company',
        'npo',
        'church',
        'sports_club',
        'other'
      )
    ),
  registration_number text,
  vat_number text,
  address_line1 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  country text NOT NULL DEFAULT 'South Africa',
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  authorised_representative_name text,
  authorised_representative_title text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_method text
    CHECK (
      verification_method IS NULL
      OR verification_method IN ('document_review', 'admin_assisted')
    ),
  verification_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_commercial_profiles_verified_complete_chk CHECK (
    verification_status IS DISTINCT FROM 'verified'
    OR (
      verification_method IS NOT NULL
      AND verified_at IS NOT NULL
      AND verified_by IS NOT NULL
    )
  ),
  CONSTRAINT organisation_commercial_profiles_rejected_reason_chk CHECK (
    verification_status IS DISTINCT FROM 'rejected'
    OR (
      rejection_reason IS NOT NULL
      AND length(btrim(rejection_reason)) > 0
    )
  ),
  CONSTRAINT organisation_commercial_profiles_legal_name_nonempty_chk CHECK (
    length(btrim(legal_name)) > 0
  )
);

CREATE INDEX IF NOT EXISTS organisation_commercial_profiles_verification_queue_idx
  ON public.organisation_commercial_profiles (verification_status, submitted_at DESC)
  WHERE verification_status IN ('pending', 'rejected');

CREATE UNIQUE INDEX IF NOT EXISTS organisation_commercial_profiles_registration_uidx
  ON public.organisation_commercial_profiles (lower(btrim(registration_number)))
  WHERE registration_number IS NOT NULL AND btrim(registration_number) <> '';

DROP TRIGGER IF EXISTS organisation_commercial_profiles_updated_at
  ON public.organisation_commercial_profiles;
CREATE TRIGGER organisation_commercial_profiles_updated_at
  BEFORE UPDATE ON public.organisation_commercial_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_set_updated_at();

COMMENT ON TABLE public.organisation_commercial_profiles IS
  'Organisation entity/commercial verification. Separate from organisations.status. '
  'Organisation Admin may edit pending details through the server API; they cannot set verified.';

ALTER TABLE public.organisation_commercial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_commercial_profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_commercial_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_commercial_profiles FROM anon;
REVOKE ALL ON TABLE public.organisation_commercial_profiles FROM authenticated;
GRANT ALL ON TABLE public.organisation_commercial_profiles TO service_role;

DROP TRIGGER IF EXISTS organisation_commercial_profiles_server_only_insert
  ON public.organisation_commercial_profiles;
CREATE TRIGGER organisation_commercial_profiles_server_only_insert
  BEFORE INSERT ON public.organisation_commercial_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_commercial_profiles_server_only_update
  ON public.organisation_commercial_profiles;
CREATE TRIGGER organisation_commercial_profiles_server_only_update
  BEFORE UPDATE ON public.organisation_commercial_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_commercial_profiles_server_only_delete
  ON public.organisation_commercial_profiles;
CREATE TRIGGER organisation_commercial_profiles_server_only_delete
  BEFORE DELETE ON public.organisation_commercial_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

-- Existing Organisations get a pending commercial profile. Never auto-verify.
INSERT INTO public.organisation_commercial_profiles (
  organisation_id,
  legal_name,
  verification_status
)
SELECT o.id, o.name, 'pending'
FROM public.organisations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organisation_commercial_profiles p
  WHERE p.organisation_id = o.id
);

-- ---------------------------------------------------------------------------
-- organisation_verification_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL
    REFERENCES public.organisations(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_kind text NOT NULL
    CHECK (document_kind IN (
      'registration',
      'authority_letter',
      'mandate',
      'municipal',
      'school',
      'npo',
      'other'
    )),
  label text,
  file_path text NOT NULL,
  content_type text,
  byte_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  replaced_at timestamptz,
  replaced_by_document_id uuid
    REFERENCES public.organisation_verification_documents(id) ON DELETE SET NULL,
  CONSTRAINT organisation_verification_documents_file_path_nonempty_chk CHECK (
    length(btrim(file_path)) > 0
  )
);

CREATE INDEX IF NOT EXISTS organisation_verification_documents_org_idx
  ON public.organisation_verification_documents (organisation_id, uploaded_at DESC);

COMMENT ON TABLE public.organisation_verification_documents IS
  'Supporting evidence for Organisation entity verification. file_path only; no public URLs. '
  'The Organisation is verified, not each document.';

ALTER TABLE public.organisation_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_verification_documents FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_verification_documents FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_verification_documents FROM anon;
REVOKE ALL ON TABLE public.organisation_verification_documents FROM authenticated;
GRANT ALL ON TABLE public.organisation_verification_documents TO service_role;

DROP TRIGGER IF EXISTS organisation_verification_documents_server_only_insert
  ON public.organisation_verification_documents;
CREATE TRIGGER organisation_verification_documents_server_only_insert
  BEFORE INSERT ON public.organisation_verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_verification_documents_server_only_update
  ON public.organisation_verification_documents;
CREATE TRIGGER organisation_verification_documents_server_only_update
  BEFORE UPDATE ON public.organisation_verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_verification_documents_server_only_delete
  ON public.organisation_verification_documents;
CREATE TRIGGER organisation_verification_documents_server_only_delete
  BEFORE DELETE ON public.organisation_verification_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

-- ---------------------------------------------------------------------------
-- organisation_bank_accounts (versioned; no browser SELECT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL
    REFERENCES public.organisations(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  account_holder_name text NOT NULL,
  bank_name text NOT NULL,
  account_type text NOT NULL
    CHECK (account_type IN ('cheque', 'savings', 'transmission', 'other')),
  branch_code text NOT NULL,
  account_number text NOT NULL,
  account_number_last4 text NOT NULL,
  proof_of_bank_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  review_notes text,
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_bank_accounts_version_positive_chk CHECK (version_number >= 1),
  CONSTRAINT organisation_bank_accounts_last4_chk CHECK (length(account_number_last4) = 4),
  CONSTRAINT organisation_bank_accounts_proof_nonempty_chk CHECK (
    length(btrim(proof_of_bank_path)) > 0
  ),
  CONSTRAINT organisation_bank_accounts_holder_nonempty_chk CHECK (
    length(btrim(account_holder_name)) > 0
  ),
  CONSTRAINT organisation_bank_accounts_bank_nonempty_chk CHECK (
    length(btrim(bank_name)) > 0
  ),
  CONSTRAINT organisation_bank_accounts_number_nonempty_chk CHECK (
    length(btrim(account_number)) > 0
  ),
  CONSTRAINT organisation_bank_accounts_branch_nonempty_chk CHECK (
    length(btrim(branch_code)) > 0
  ),
  CONSTRAINT organisation_bank_accounts_verified_complete_chk CHECK (
    status IS DISTINCT FROM 'verified'
    OR (
      reviewed_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND length(btrim(proof_of_bank_path)) > 0
    )
  ),
  CONSTRAINT organisation_bank_accounts_rejected_reason_chk CHECK (
    status IS DISTINCT FROM 'rejected'
    OR (
      rejection_reason IS NOT NULL
      AND length(btrim(rejection_reason)) > 0
    )
  ),
  CONSTRAINT organisation_bank_accounts_current_or_superseded_chk CHECK (
    is_current = true
    OR superseded_at IS NOT NULL
  ),
  CONSTRAINT organisation_bank_accounts_org_version_key UNIQUE (organisation_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS organisation_bank_accounts_one_current_uidx
  ON public.organisation_bank_accounts (organisation_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS organisation_bank_accounts_review_queue_idx
  ON public.organisation_bank_accounts (status, submitted_at DESC)
  WHERE is_current = true AND status IN ('pending', 'rejected');

COMMENT ON TABLE public.organisation_bank_accounts IS
  'Versioned Organisation bank accounts. No authenticated SELECT. Organisation Admin reads go through a masked server DTO. Full account_number is Global Admin review APIs only.';

ALTER TABLE public.organisation_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_bank_accounts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organisation_bank_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.organisation_bank_accounts FROM anon;
REVOKE ALL ON TABLE public.organisation_bank_accounts FROM authenticated;
GRANT ALL ON TABLE public.organisation_bank_accounts TO service_role;

DROP TRIGGER IF EXISTS organisation_bank_accounts_server_only_insert
  ON public.organisation_bank_accounts;
CREATE TRIGGER organisation_bank_accounts_server_only_insert
  BEFORE INSERT ON public.organisation_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_bank_accounts_server_only_update
  ON public.organisation_bank_accounts;
CREATE TRIGGER organisation_bank_accounts_server_only_update
  BEFORE UPDATE ON public.organisation_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

DROP TRIGGER IF EXISTS organisation_bank_accounts_server_only_delete
  ON public.organisation_bank_accounts;
CREATE TRIGGER organisation_bank_accounts_server_only_delete
  BEFORE DELETE ON public.organisation_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_role_writes_only();

-- ---------------------------------------------------------------------------
-- Bank submission RPC (service_role only). Actor from trusted API p_actor_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_organisation_bank_account(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_account_holder_name text,
  p_bank_name text,
  p_account_type text,
  p_branch_code text,
  p_account_number text,
  p_proof_of_bank_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org public.organisations%ROWTYPE;
  v_current public.organisation_bank_accounts%ROWTYPE;
  v_next public.organisation_bank_accounts%ROWTYPE;
  v_holder text;
  v_bank text;
  v_type text;
  v_branch text;
  v_number text;
  v_proof text;
  v_last4 text;
  v_material boolean;
  v_is_oa boolean;
  v_is_ga boolean;
BEGIN
  IF p_organisation_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'organisation_bank_actor_required'
      USING HINT = 'Organisation and actor are required.';
  END IF;

  v_holder := btrim(p_account_holder_name);
  v_bank := btrim(p_bank_name);
  v_type := btrim(p_account_type);
  v_branch := btrim(p_branch_code);
  v_number := regexp_replace(btrim(p_account_number), '\s+', '', 'g');
  v_proof := btrim(p_proof_of_bank_path);

  IF v_holder IS NULL OR v_holder = ''
    OR v_bank IS NULL OR v_bank = ''
    OR v_type IS NULL OR v_type NOT IN ('cheque', 'savings', 'transmission', 'other')
    OR v_branch IS NULL OR v_branch = ''
    OR v_number IS NULL OR v_number = ''
  THEN
    RAISE EXCEPTION 'organisation_bank_fields_required'
      USING HINT = 'Account holder, bank, type, branch code, and account number are required.';
  END IF;

  IF v_proof IS NULL OR v_proof = '' THEN
    RAISE EXCEPTION 'organisation_bank_proof_required'
      USING HINT = 'Proof of bank is required before banking can be submitted for verification.';
  END IF;

  IF length(v_number) < 4 THEN
    RAISE EXCEPTION 'organisation_bank_number_invalid'
      USING HINT = 'Account number is invalid.';
  END IF;

  v_last4 := right(v_number, 4);

  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_access a
    WHERE a.organisation_id = p_organisation_id
      AND a.user_id = p_actor_id
      AND a.role = 'org_admin'
      AND a.status = 'active'
  ) INTO v_is_oa;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_actor_id
      AND p.role IN ('admin', 'super_admin')
      AND COALESCE(p.admin_access_disabled, false) = false
  ) INTO v_is_ga;

  IF NOT v_is_oa AND NOT v_is_ga THEN
    RAISE EXCEPTION 'organisation_commercial_forbidden'
      USING HINT = 'Only an active Organisation Admin or active Global Admin may submit Organisation banking.';
  END IF;

  SELECT * INTO v_org
  FROM public.organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organisation_not_found'
      USING HINT = 'Organisation not found.';
  END IF;

  IF v_org.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'organisation_archived'
      USING HINT = 'Archived organisations cannot submit banking.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('organisation-bank:' || p_organisation_id::text)
  );

  SELECT * INTO v_current
  FROM public.organisation_bank_accounts
  WHERE organisation_id = p_organisation_id
    AND is_current = true
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organisation_bank_accounts (
      organisation_id,
      version_number,
      is_current,
      account_holder_name,
      bank_name,
      account_type,
      branch_code,
      account_number,
      account_number_last4,
      proof_of_bank_path,
      status,
      submitted_at,
      submitted_by
    ) VALUES (
      p_organisation_id,
      1,
      true,
      v_holder,
      v_bank,
      v_type,
      v_branch,
      v_number,
      v_last4,
      v_proof,
      'pending',
      now(),
      p_actor_id
    )
    RETURNING * INTO v_next;
  ELSE
    v_material :=
      lower(btrim(v_current.account_holder_name)) IS DISTINCT FROM lower(v_holder)
      OR lower(btrim(v_current.bank_name)) IS DISTINCT FROM lower(v_bank)
      OR v_current.account_type IS DISTINCT FROM v_type
      OR regexp_replace(btrim(v_current.branch_code), '\s+', '', 'g')
        IS DISTINCT FROM regexp_replace(v_branch, '\s+', '', 'g')
      OR regexp_replace(btrim(v_current.account_number), '\s+', '', 'g') IS DISTINCT FROM v_number
      OR btrim(v_current.proof_of_bank_path) IS DISTINCT FROM v_proof;

    IF v_current.status IN ('pending', 'rejected') THEN
      UPDATE public.organisation_bank_accounts SET
        account_holder_name = v_holder,
        bank_name = v_bank,
        account_type = v_type,
        branch_code = v_branch,
        account_number = v_number,
        account_number_last4 = v_last4,
        proof_of_bank_path = v_proof,
        status = 'pending',
        review_notes = NULL,
        rejection_reason = NULL,
        submitted_at = now(),
        submitted_by = p_actor_id,
        reviewed_at = NULL,
        reviewed_by = NULL
      WHERE id = v_current.id
      RETURNING * INTO v_next;
    ELSIF v_current.status = 'verified' THEN
      IF NOT v_material THEN
        v_next := v_current;
      ELSE
        UPDATE public.organisation_bank_accounts SET
          is_current = false,
          superseded_at = now(),
          superseded_by = p_actor_id
        WHERE id = v_current.id;

        INSERT INTO public.organisation_bank_accounts (
          organisation_id,
          version_number,
          is_current,
          account_holder_name,
          bank_name,
          account_type,
          branch_code,
          account_number,
          account_number_last4,
          proof_of_bank_path,
          status,
          submitted_at,
          submitted_by
        ) VALUES (
          p_organisation_id,
          v_current.version_number + 1,
          true,
          v_holder,
          v_bank,
          v_type,
          v_branch,
          v_number,
          v_last4,
          v_proof,
          'pending',
          now(),
          p_actor_id
        )
        RETURNING * INTO v_next;
      END IF;
    ELSE
      RAISE EXCEPTION 'organisation_bank_status_invalid'
        USING HINT = 'Current bank account cannot be updated.';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_next.id,
    'organisation_id', v_next.organisation_id,
    'version_number', v_next.version_number,
    'is_current', v_next.is_current,
    'account_holder_name', v_next.account_holder_name,
    'bank_name', v_next.bank_name,
    'account_type', v_next.account_type,
    'branch_code', v_next.branch_code,
    'account_number_last4', v_next.account_number_last4,
    'proof_of_bank_submitted', (v_next.proof_of_bank_path IS NOT NULL AND btrim(v_next.proof_of_bank_path) <> ''),
    'status', v_next.status,
    'review_notes', v_next.review_notes,
    'rejection_reason', v_next.rejection_reason,
    'submitted_at', v_next.submitted_at,
    'submitted_by', v_next.submitted_by,
    'reviewed_at', v_next.reviewed_at,
    'reviewed_by', v_next.reviewed_by,
    'superseded_at', v_next.superseded_at,
    'previous_version_number',
      CASE
        WHEN v_current.id IS NOT NULL
          AND v_next.id IS DISTINCT FROM v_current.id
        THEN v_current.version_number
        ELSE NULL
      END,
    'superseded_verified',
      (v_current.id IS NOT NULL
        AND v_next.id IS DISTINCT FROM v_current.id
        AND v_current.status = 'verified')
  );
END;
$$;

COMMENT ON FUNCTION public.submit_organisation_bank_account(
  uuid, uuid, text, text, text, text, text, text
) IS
  'Transaction-safe Organisation bank submit/change. Service-role only. Never returns account_number. Proof of bank is mandatory. Verified material changes supersede and insert the next pending version.';

REVOKE ALL ON FUNCTION public.submit_organisation_bank_account(
  uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_organisation_bank_account(
  uuid, uuid, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.submit_organisation_bank_account(
  uuid, uuid, text, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_organisation_bank_account(
  uuid, uuid, text, text, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- bookings commercial beneficiary snapshot (nullable, legacy-safe)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS commercial_beneficiary_type text,
  ADD COLUMN IF NOT EXISTS commercial_beneficiary_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_beneficiary_organisation_id uuid
    REFERENCES public.organisations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'bookings_commercial_beneficiary_legacy_chk'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_commercial_beneficiary_legacy_chk
      CHECK (
        (
          commercial_beneficiary_type IS NULL
          AND commercial_beneficiary_user_id IS NULL
          AND commercial_beneficiary_organisation_id IS NULL
        )
        OR (
          commercial_beneficiary_type = 'personal'
          AND commercial_beneficiary_user_id IS NOT NULL
          AND commercial_beneficiary_organisation_id IS NULL
        )
        OR (
          commercial_beneficiary_type = 'organisation'
          AND commercial_beneficiary_organisation_id IS NOT NULL
          AND commercial_beneficiary_user_id IS NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bookings_commercial_beneficiary_user_idx
  ON public.bookings (commercial_beneficiary_user_id)
  WHERE commercial_beneficiary_type = 'personal'
    AND commercial_beneficiary_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_commercial_beneficiary_org_idx
  ON public.bookings (commercial_beneficiary_organisation_id)
  WHERE commercial_beneficiary_type = 'organisation'
    AND commercial_beneficiary_organisation_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.commercial_beneficiary_type IS
  'Historical commercial beneficiary at booking creation. Independent of bookings.owner_id and bookings.organisation_id. Not rewritten after insert.';

-- Safe personal backfill only. Do not infer Organisation beneficiary from
-- the current property relationship. Never change status/amount/owner_id.
-- Must run before the freeze trigger.
UPDATE public.bookings
SET
  commercial_beneficiary_type = 'personal',
  commercial_beneficiary_user_id = owner_id
WHERE organisation_id IS NULL
  AND owner_id IS NOT NULL
  AND commercial_beneficiary_type IS NULL
  AND commercial_beneficiary_user_id IS NULL
  AND commercial_beneficiary_organisation_id IS NULL;

CREATE OR REPLACE FUNCTION public.bookings_freeze_commercial_beneficiary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.commercial_beneficiary_type IS NULL
    AND OLD.commercial_beneficiary_user_id IS NULL
    AND OLD.commercial_beneficiary_organisation_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.commercial_beneficiary_type IS DISTINCT FROM OLD.commercial_beneficiary_type
    OR NEW.commercial_beneficiary_user_id IS DISTINCT FROM OLD.commercial_beneficiary_user_id
    OR NEW.commercial_beneficiary_organisation_id IS DISTINCT FROM OLD.commercial_beneficiary_organisation_id
  THEN
    RAISE EXCEPTION 'booking_commercial_beneficiary_frozen'
      USING HINT = 'Booking commercial beneficiary is a historical snapshot and cannot be rewritten.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_freeze_commercial_beneficiary ON public.bookings;
CREATE TRIGGER bookings_freeze_commercial_beneficiary
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_freeze_commercial_beneficiary();

-- ---------------------------------------------------------------------------
-- Private storage buckets (no object policies = client denied)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('organisation-verification', 'organisation-verification', false, 10485760),
  ('organisation-bank-proofs', 'organisation-bank-proofs', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
