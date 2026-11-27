#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/lib/disposable-psql.sh"
cd "$(dirname "$0")/.."

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for the flexible booking database checks" >&2
  exit 1
fi

disposable_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS flexible_phase2;" >/dev/null
disposable_psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE flexible_phase2;" >/dev/null
disposable_psql -v ON_ERROR_STOP=1 -d flexible_phase2 -f scripts/sql/flexible-booking-setup.sql
disposable_psql -v ON_ERROR_STOP=1 -d flexible_phase2 -f supabase/migrations/082_20261125_space_booking_rates.sql
disposable_psql -v ON_ERROR_STOP=1 -d flexible_phase2 -f scripts/sql/flexible-booking-cases.sql
disposable_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS flexible_phase2;" >/dev/null
echo "flexible booking database checks passed"
