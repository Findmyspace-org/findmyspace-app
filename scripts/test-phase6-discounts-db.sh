#!/usr/bin/env bash
# Disposable database for migrations 081 through 086.
# Never connect this script to the FindMySpace project.
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/lib/disposable-psql.sh"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase6"
PSQL=(disposable_psql -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/083_20261126_recurring_availability_rules.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/084_20261126_recurring_bookings.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/085_20261126_series_administration.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/086_20261126_approval_discounts.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/087_20261126_discount_fee_recalculation.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase4-recurring-bookings-cases.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase5-series-management-cases.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase6-approval-discount-cases.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase7-commercial-discount-cases.sql"
disposable_psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.approve_booking_with_discount('55555555-5555-4555-8555-555555555555'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'approve', NULL, 'percent', 10, 'race a') FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase6-race-a.txt 2>&1 &
RACE_A=$!
disposable_psql -d "$DB" -v ON_ERROR_STOP=1 -c "SELECT public.approve_booking_with_discount('55555555-5555-4555-8555-555555555555'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'approve', NULL, 'percent', 25, 'race b') FROM (SELECT set_config('request.jwt.claim.role', 'service_role', true)) cfg;" >/tmp/phase6-race-b.txt 2>&1 &
RACE_B=$!
wait "$RACE_A" || true
wait "$RACE_B" || true
if ! "${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase6-concurrency-check.sql"; then
  cat /tmp/phase6-race-a.txt /tmp/phase6-race-b.txt >&2
  exit 1
fi
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "migrations 081 through 087 passed together on ${DB}"
