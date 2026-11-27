#!/usr/bin/env bash
# Disposable checks for the production-shaped availability_rules table.
# Never connect this script to the FindMySpace project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/disposable-psql.sh
source "$ROOT/scripts/lib/disposable-psql.sh"
PSQL=(disposable_psql -v ON_ERROR_STOP=1)

apply_base() {
  local db="$1"
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${db};" >/dev/null
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE ${db};" >/dev/null
  "${PSQL[@]}" -d "$db" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
  "${PSQL[@]}" -d "$db" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
}

apply_migrations() {
  local db="$1"
  local file
  for file in \
    081_20261124_space_availability_guard.sql \
    082_20261125_space_booking_rates.sql \
    083_20261126_recurring_availability_rules.sql \
    084_20261126_recurring_bookings.sql \
    085_20261126_series_administration.sql \
    086_20261126_approval_discounts.sql \
    087_20261126_discount_fee_recalculation.sql
  do
    "${PSQL[@]}" -d "$db" -f "$ROOT/supabase/migrations/$file" >/dev/null
  done
}

# Empty legacy table, then the full migration sequence.
apply_base availability_legacy_empty
"${PSQL[@]}" -d availability_legacy_empty -f "$ROOT/scripts/sql/legacy-availability-rules.sql" >/dev/null
"${PSQL[@]}" -d availability_legacy_empty <<'SQL' >/dev/null
INSERT INTO public.spaces (id, status, public_listing_mode)
VALUES ('10000000-0000-4000-8000-0000000000aa', 'active', 'live');
INSERT INTO public.blocked_dates (id, space_id, start_at, end_at, reason)
VALUES (
  '10000000-0000-4000-8000-0000000000ac',
  '10000000-0000-4000-8000-0000000000aa',
  '2026-07-31 00:00+02',
  '2026-12-31 00:00+02',
  'historical block'
);
INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at, total_price)
VALUES (
  '10000000-0000-4000-8000-0000000000ab',
  '10000000-0000-4000-8000-0000000000aa',
  'paid_confirmed',
  'paid',
  '2026-05-01 00:00+02',
  '2026-08-01 00:00+02',
  1250
);
SQL
apply_migrations availability_legacy_empty
"${PSQL[@]}" -d availability_legacy_empty -c "CREATE OR REPLACE FUNCTION public.test_insert_booking(p_space uuid, p_status text, p_start timestamptz, p_end timestamptz) RETURNS uuid LANGUAGE plpgsql AS \$\$ DECLARE new_id uuid := gen_random_uuid(); BEGIN INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at, total_price) VALUES (new_id, p_space, p_status, 'unpaid', p_start, p_end, 65000); RETURN new_id; END; \$\$;" >/dev/null
"${PSQL[@]}" -d availability_legacy_empty -f "$ROOT/scripts/sql/legacy-availability-history-cases.sql" >/dev/null
"${PSQL[@]}" -d availability_legacy_empty -f "$ROOT/scripts/sql/phase3-availability-rules-cases.sql" >/dev/null
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS availability_legacy_empty;" >/dev/null

# Legacy rows stop the migration and remain stored in the original columns.
apply_base availability_legacy_rows
"${PSQL[@]}" -d availability_legacy_rows -f "$ROOT/scripts/sql/legacy-availability-rules.sql" >/dev/null
"${PSQL[@]}" -d availability_legacy_rows <<'SQL' >/dev/null
INSERT INTO public.availability_rules (space_id, day_of_week, start_time, end_time, is_available)
VALUES ('10000000-0000-4000-8000-000000000010', 1, '08:00', '15:00', true);
SQL
"${PSQL[@]}" -d availability_legacy_rows -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d availability_legacy_rows -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
set +e
"${PSQL[@]}" -d availability_legacy_rows -f "$ROOT/supabase/migrations/083_20261126_recurring_availability_rules.sql" >/tmp/legacy-availability-rows.txt 2>&1
rows_code=$?
set -e
if [[ "$rows_code" -eq 0 ]]; then
  echo "migration 083 transformed a legacy availability_rules table that contains a row" >&2
  exit 1
fi
if ! grep -q "without deleting or transforming them" /tmp/legacy-availability-rows.txt; then
  echo "migration 083 did not report the legacy-row stop" >&2
  cat /tmp/legacy-availability-rows.txt >&2
  exit 1
fi
kept="$("${PSQL[@]}" -d availability_legacy_rows -tA -c "SELECT day_of_week::text || ' ' || start_time::text FROM public.availability_rules;")"
if [[ "$kept" != "1 08:00:00" ]]; then
  echo "legacy availability row was not preserved (got ${kept})" >&2
  exit 1
fi
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS availability_legacy_rows;" >/dev/null

# A table that already has the recurring columns is left in place, including its row.
apply_base availability_legacy_ready
"${PSQL[@]}" -d availability_legacy_ready <<'SQL' >/dev/null
CREATE TABLE public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces (id) ON DELETE CASCADE,
  reason text,
  weekdays smallint[] NOT NULL,
  whole_day boolean NOT NULL DEFAULT false,
  local_start time,
  local_end time,
  starts_on date NOT NULL,
  ends_on date,
  created_by uuid,
  updated_by uuid,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
INSERT INTO public.availability_rules (space_id, weekdays, whole_day, starts_on)
VALUES ('10000000-0000-4000-8000-000000000010', ARRAY[1]::smallint[], true, '2027-01-01');
SQL
apply_migrations availability_legacy_ready
ready_count="$("${PSQL[@]}" -d availability_legacy_ready -tA -c "SELECT count(*) FROM public.availability_rules;")"
legacy_count="$("${PSQL[@]}" -d availability_legacy_ready -tA -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'availability_rules_legacy_weekly_empty';")"
if [[ "$ready_count" != "1" || "$legacy_count" != "0" ]]; then
  echo "already-compatible availability_rules was rewritten (rows=${ready_count}, legacy=${legacy_count})" >&2
  exit 1
fi
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS availability_legacy_ready;" >/dev/null

echo "legacy availability_rules migration checks passed"
