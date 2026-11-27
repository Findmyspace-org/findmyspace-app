#!/usr/bin/env bash
# Disposable database for migrations 081 and 082 together.
# Never connect this script to the FindMySpace project.
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/lib/disposable-psql.sh"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase2"
PSQL=(disposable_psql -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-extra.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/082_20261125_space_booking_rates.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/sql/phase2-combined-cases.sql"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "migrations 081 and 082 passed together on ${DB}"
