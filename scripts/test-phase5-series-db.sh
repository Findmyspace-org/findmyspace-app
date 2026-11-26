#!/usr/bin/env bash
# Disposable database for migrations 081 through 085.
# Never connect this script to the FindMySpace project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase5"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/083_20261126_recurring_availability_rules.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/084_20261126_recurring_bookings.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/085_20261126_series_administration.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase4-recurring-bookings-cases.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase5-series-management-cases.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase5-concurrency-setup.sql" >/dev/null
CHANGE_ID="$("${PSQL[@]}" -d "$DB" -tA -c "SELECT id FROM public.booking_change_requests WHERE status = 'pending_renter' ORDER BY created_at DESC LIMIT 1;")"
EXCEPTION_ID="$("${PSQL[@]}" -d "$DB" -tA -c "SELECT id FROM public.availability_rule_exceptions WHERE space_id = '10000000-0000-4000-8000-000000000088' AND removed_at IS NULL LIMIT 1;")"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.decide_booking_change_request('${CHANGE_ID}'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, true) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase5-race-accept.txt 2>&1 &
ACCEPT_PID=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.apply_host_booking_response('33333333-3333-4333-8333-333333333333'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'approve', NULL) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase5-race-approve.txt 2>&1 &
APPROVE_PID=$!
wait "$ACCEPT_PID" || true
wait "$APPROVE_PID" || true
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.restore_availability_exception('${EXCEPTION_ID}'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase5-race-restore.txt 2>&1 &
RESTORE_PID=$!
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.apply_host_booking_response('44444444-4444-4444-8444-444444444444'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'approve', NULL) FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase5-race-open-booking.txt 2>&1 &
OPEN_PID=$!
wait "$RESTORE_PID" || true
wait "$OPEN_PID" || true
if ! "${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase5-concurrency-check.sql"; then
  cat /tmp/phase5-race-accept.txt /tmp/phase5-race-approve.txt /tmp/phase5-race-restore.txt /tmp/phase5-race-open-booking.txt >&2
  exit 1
fi
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "migrations 081 through 085 passed together on ${DB}"
