#!/usr/bin/env bash
# Disposable database for migrations 081, 082, 083 and 084.
# Never connect this script to the FindMySpace project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase4"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/083_20261126_recurring_availability_rules.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/084_20261126_recurring_bookings.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase4-recurring-bookings-cases.sql"

SPACE="10000000-0000-4000-8000-000000000014"
ACTOR="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
"${PSQL[@]}" -d "$DB" <<SQL
INSERT INTO public.spaces (id, status, public_listing_mode, recurring_bookings_enabled, price_per_hour)
VALUES ('${SPACE}', 'active', 'live', true, 250);
SQL

# Two overlapping pending series, then concurrent approval.
ID_A="$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -At <<'SQL'
WITH parent AS (
  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at, total_price, unit_price,
    pricing_mode, rate_period, reserves_via_occurrences
  ) VALUES (
    '10000000-0000-4000-8000-000000000014', 'pending_owner', 'unpaid',
    '2027-09-06 14:00+02', '2027-09-13 16:00+02', 1000, 250, 'recurring', 'hour', true
  ) RETURNING id
)
SELECT id FROM parent;
SQL
)"
ID_B="$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -At <<'SQL'
WITH parent AS (
  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at, total_price, unit_price,
    pricing_mode, rate_period, reserves_via_occurrences
  ) VALUES (
    '10000000-0000-4000-8000-000000000014', 'pending_owner', 'unpaid',
    '2027-09-06 14:00+02', '2027-09-13 16:00+02', 1000, 250, 'recurring', 'hour', true
  ) RETURNING id
)
SELECT id FROM parent;
SQL
)"

"${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.attach_recurring_series('${ID_A}'::uuid, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-09-06', '2027-09-13', ARRAY[]::date[]) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) AS config;" >/dev/null
"${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.attach_recurring_series('${ID_B}'::uuid, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-09-06', '2027-09-13', ARRAY[]::date[]) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) AS config;" >/dev/null

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${ID_A}'::uuid, '${ACTOR}'::uuid, 'approve', NULL);" >/tmp/phase4-race-a.txt 2>&1 &
pid_a=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${ID_B}'::uuid, '${ACTOR}'::uuid, 'approve', NULL);" >/tmp/phase4-race-b.txt 2>&1 &
pid_b=$!
set +e
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
if [[ "$code_a" -eq 0 && "$code_b" -eq 0 ]]; then
  echo "two overlapping recurring series were both approved" >&2
  exit 1
fi
if [[ "$code_a" -ne 0 && "$code_b" -ne 0 ]]; then
  echo "both recurring approvals failed" >&2
  cat /tmp/phase4-race-a.txt /tmp/phase4-race-b.txt >&2
  exit 1
fi

ONCE="$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -At <<'SQL'
INSERT INTO public.bookings (
  space_id, status, payment_status, start_at, end_at, total_price
) VALUES (
  '10000000-0000-4000-8000-000000000014', 'pending_owner', 'unpaid',
  '2027-09-20 14:00+02', '2027-09-20 16:00+02', 250
) RETURNING id;
SQL
)"
SERIES="$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -At <<'SQL'
WITH parent AS (
  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at, total_price, unit_price,
    pricing_mode, rate_period, reserves_via_occurrences
  ) VALUES (
    '10000000-0000-4000-8000-000000000014', 'pending_owner', 'unpaid',
    '2027-09-20 14:00+02', '2027-09-27 16:00+02', 1000, 250, 'recurring', 'hour', true
  ) RETURNING id
)
SELECT id FROM parent;
SQL
)"
"${PSQL[@]}" -d "$DB" -c "SELECT public.attach_recurring_series('${SERIES}'::uuid, 'weekly', ARRAY[1]::smallint[], '14:00', '16:00', '2027-09-20', '2027-09-27', ARRAY[]::date[]) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) AS config;" >/dev/null

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${SERIES}'::uuid, '${ACTOR}'::uuid, 'approve', NULL);" >/tmp/phase4-race-series.txt 2>&1 &
pid_a=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${ONCE}'::uuid, '${ACTOR}'::uuid, 'approve', NULL);" >/tmp/phase4-race-once.txt 2>&1 &
pid_b=$!
set +e
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
if [[ "$code_a" -eq 0 && "$code_b" -eq 0 ]]; then
  echo "a recurring series and an overlapping once-off booking were both approved" >&2
  exit 1
fi
if [[ "$code_a" -ne 0 && "$code_b" -ne 0 ]]; then
  echo "both the series and the once-off approval failed" >&2
  cat /tmp/phase4-race-series.txt /tmp/phase4-race-once.txt >&2
  exit 1
fi

RULE_SERIES="$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -At <<'SQL'
WITH parent AS (
  INSERT INTO public.bookings (
    space_id, status, payment_status, start_at, end_at, total_price, unit_price,
    pricing_mode, rate_period, reserves_via_occurrences
  ) VALUES (
    '10000000-0000-4000-8000-000000000014', 'pending_owner', 'unpaid',
    '2027-10-04 10:00+02', '2027-10-11 11:00+02', 500, 250, 'recurring', 'hour', true
  ) RETURNING id
)
SELECT id FROM parent;
SQL
)"
"${PSQL[@]}" -d "$DB" -c "SELECT public.attach_recurring_series('${RULE_SERIES}'::uuid, 'weekly', ARRAY[1]::smallint[], '10:00', '11:00', '2027-10-04', '2027-10-11', ARRAY[]::date[]) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) AS config;" >/dev/null

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${RULE_SERIES}'::uuid, '${ACTOR}'::uuid, 'approve', NULL);" >/tmp/phase4-race-approve.txt 2>&1 &
pid_a=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.save_availability_rule('${SPACE}'::uuid, '${ACTOR}'::uuid, '{\"reason\":\"race\",\"weekdays\":[1],\"wholeDay\":false,\"localStart\":\"08:00\",\"localEnd\":\"15:00\",\"startsOn\":\"2027-10-04\"}'::jsonb);" >/tmp/phase4-race-rule.txt 2>&1 &
pid_b=$!
set +e
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
if [[ "$code_a" -eq 0 && "$code_b" -eq 0 ]]; then
  echo "a recurring booking and a conflicting restriction were both saved" >&2
  exit 1
fi
if [[ "$code_a" -ne 0 && "$code_b" -ne 0 ]]; then
  echo "both the recurring approval and the restriction failed" >&2
  cat /tmp/phase4-race-approve.txt /tmp/phase4-race-rule.txt >&2
  exit 1
fi

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "migrations 081, 082, 083 and 084 passed together on ${DB}"
