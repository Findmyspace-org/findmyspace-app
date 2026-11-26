#!/usr/bin/env bash
# Disposable database for migrations 081, 082 and 083.
# Never connect this script to the FindMySpace project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase3"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/083_20261126_recurring_availability_rules.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase3-availability-rules-cases.sql"

SPACE="10000000-0000-4000-8000-000000000013"
ACTOR="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
"${PSQL[@]}" -d "$DB" -c "INSERT INTO public.spaces (id, status, public_listing_mode) VALUES ('${SPACE}', 'active', 'live');" >/dev/null

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.test_insert_booking('${SPACE}'::uuid, 'confirmed', '2027-03-01 10:00+02', '2027-03-01 11:00+02');" >/tmp/phase3-race-booking.txt 2>&1 &
pid_a=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.save_availability_rule('${SPACE}'::uuid, '${ACTOR}'::uuid, '{\"reason\":\"race\",\"weekdays\":[1],\"wholeDay\":false,\"localStart\":\"08:00\",\"localEnd\":\"15:00\",\"startsOn\":\"2027-03-01\"}'::jsonb);" >/tmp/phase3-race-rule.txt 2>&1 &
pid_b=$!
set +e
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
if [[ "$code_a" -eq 0 && "$code_b" -eq 0 ]]; then
  echo "a booking and a conflicting restriction were both saved" >&2
  cat /tmp/phase3-race-booking.txt /tmp/phase3-race-rule.txt >&2
  exit 1
fi
if [[ "$code_a" -ne 0 && "$code_b" -ne 0 ]]; then
  echo "both the booking and the restriction failed" >&2
  cat /tmp/phase3-race-booking.txt /tmp/phase3-race-rule.txt >&2
  exit 1
fi

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "migrations 081, 082 and 083 passed together on ${DB}"
