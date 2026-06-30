-- Notification action lifecycle (separate from read/unread).
-- action_status: none | pending | resolved | dismissed

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_status text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

COMMENT ON COLUMN public.notifications.action_status IS
  'Workflow action state: none, pending, resolved, dismissed. Independent of read_at.';

CREATE INDEX IF NOT EXISTS notifications_action_status_pending_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE action_status = 'pending' AND archived_at IS NULL;

-- Backfill: completed outcome types are resolved actions.
UPDATE public.notifications
SET
  action_status = 'resolved',
  resolved_at = COALESCE(resolved_at, read_at, created_at)
WHERE action_status IS NULL
  AND type IN (
    'identity_verified',
    'bank_verified',
    'listing_activated',
    'ownership_proof_verified',
    'booking_confirmed',
    'booking_paid',
    'payment_received',
    'listing_question_answered'
  );

-- Backfill: archived notifications are not pending actions.
UPDATE public.notifications
SET action_status = COALESCE(action_status, 'resolved')
WHERE action_status IS NULL
  AND archived_at IS NOT NULL;

-- Backfill: old read admin queue notifications without open workflow default to resolved.
UPDATE public.notifications
SET
  action_status = 'resolved',
  resolved_at = COALESCE(resolved_at, read_at, created_at)
WHERE action_status IS NULL
  AND read_at IS NOT NULL
  AND role = 'admin'
  AND type IN (
    'identity_submitted',
    'bank_submitted',
    'listing_submitted',
    'listing_pending',
    'listing_enquiry',
    'listing_claim_interest',
    'booking_request',
    'payment_needed'
  )
  AND created_at < now() - interval '30 days';
