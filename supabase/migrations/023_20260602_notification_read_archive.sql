-- Notification lifecycle: read_at + archived_at (unread / read / archived).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Backfill from legacy is_read boolean.
UPDATE public.notifications
SET read_at = COALESCE(read_at, created_at)
WHERE is_read = true AND read_at IS NULL;

-- Keep is_read aligned for any code paths still reading the boolean.
UPDATE public.notifications
SET is_read = (read_at IS NOT NULL)
WHERE is_read IS DISTINCT FROM (read_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_archived_idx
  ON public.notifications (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
