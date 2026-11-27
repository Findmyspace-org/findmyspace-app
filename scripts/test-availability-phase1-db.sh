#!/bin/bash
# Isolated PostgreSQL checks for migration 081. Does not touch production.
set -euo pipefail
source "$(cd "$(dirname "$0")/.." && pwd)/scripts/lib/disposable-psql.sh"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="availability_phase1"
PSQL=(disposable_psql -v ON_ERROR_STOP=1 -d "$DB")

disposable_psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
disposable_psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB};" >/dev/null
"${PSQL[@]}" -f "$ROOT/scripts/sql/availability-phase1-setup.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/migrations/081_20261124_space_availability_guard.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/scripts/sql/availability-phase1-cases.sql" >/dev/null

ACTOR="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SPACE_REJECT="20000000-0000-4000-8000-000000000001"
SPACE_PENDING="20000000-0000-4000-8000-000000000002"
SPACE_HOLD="20000000-0000-4000-8000-000000000003"
SPACE_RACE="20000000-0000-4000-8000-000000000004"
SPACE_APPROVE="20000000-0000-4000-8000-000000000005"

"${PSQL[@]}" -c "SELECT public.test_insert_booking('${SPACE_REJECT}'::uuid, 'confirmed', '2026-09-01 08:00+02', '2026-09-01 12:00+02');" >/dev/null

run_pending() {
  disposable_psql -d "$DB" -v ON_ERROR_STOP=1 -c \
    "SELECT public.test_insert_booking('${1}'::uuid, 'pending_owner', '${2}', '${3}');" \
    >"$4" 2>&1
}

run_pending "$SPACE_REJECT" "2026-09-01 09:00+02" "2026-09-01 10:00+02" /tmp/avail-reject-a.txt &
pid_a=$!
run_pending "$SPACE_REJECT" "2026-09-01 09:30+02" "2026-09-01 11:00+02" /tmp/avail-reject-b.txt &
pid_b=$!
set +e
wait "$pid_a"
code_a=$?
wait "$pid_b"
code_b=$?
set -e
if [[ "$code_a" -eq 0 || "$code_b" -eq 0 ]]; then
  echo "concurrent requests over a confirmed booking were not both rejected" >&2
  cat /tmp/avail-reject-a.txt /tmp/avail-reject-b.txt >&2
  exit 1
fi
if ! grep -q "space_unavailable" /tmp/avail-reject-a.txt /tmp/avail-reject-b.txt; then
  echo "concurrent rejection did not report space_unavailable" >&2
  exit 1
fi

run_pending "$SPACE_PENDING" "2026-09-02 09:00+02" "2026-09-02 11:00+02" /tmp/avail-pending-a.txt &
pid_a=$!
run_pending "$SPACE_PENDING" "2026-09-02 10:00+02" "2026-09-02 12:00+02" /tmp/avail-pending-b.txt &
pid_b=$!
wait "$pid_a"
wait "$pid_b"
pending_count="$("${PSQL[@]}" -tA -c "SELECT count(*) FROM public.bookings WHERE space_id = '${SPACE_PENDING}' AND status = 'pending_owner';")"
if [[ "$pending_count" != "2" ]]; then
  echo "competing pending requests were not both stored (count=${pending_count})" >&2
  exit 1
fi

"${PSQL[@]}" -c "INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at) VALUES ('${SPACE_APPROVE}', '${SPACE_APPROVE}', 'pending_owner', 'unpaid', '2026-09-04 14:00+02', '2026-09-04 16:00+02');" >/dev/null
# The id above reused the space uuid as the booking id. Insert a second pending with its own id.
SECOND="30000000-0000-4000-8000-000000000005"
"${PSQL[@]}" -c "INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at) VALUES ('${SECOND}', '${SPACE_APPROVE}', 'pending', 'unpaid', '2026-09-04 15:00+02', '2026-09-04 17:00+02');" >/dev/null

disposable_psql -d "$DB" -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${SPACE_APPROVE}', '${ACTOR}', 'approve', NULL);" >/tmp/avail-approve-a.txt 2>&1 &
pid_a=$!
disposable_psql -d "$DB" -c "SELECT set_config('request.jwt.claim.role', 'service_role', false); SELECT public.apply_host_booking_response('${SECOND}', '${ACTOR}', 'approve', NULL);" >/tmp/avail-approve-b.txt 2>&1 &
pid_b=$!
set +e
wait "$pid_a"
wait "$pid_b"
set -e
accepted="$("${PSQL[@]}" -tA -c "SELECT count(*) FROM public.bookings WHERE space_id = '${SPACE_APPROVE}' AND status = 'accepted_awaiting_payment';")"
if [[ "$accepted" != "1" ]]; then
  echo "concurrent approval reserved ${accepted} bookings" >&2
  cat /tmp/avail-approve-a.txt /tmp/avail-approve-b.txt >&2
  exit 1
fi

disposable_psql -d "$DB" -c "SELECT public.test_hold_then_confirm('${SPACE_HOLD}'::uuid, '2026-09-03 08:00+02', '2026-09-03 12:00+02', 'hold-confirm');" >/tmp/avail-hold.txt 2>&1 &
hold_pid=$!
for _ in $(seq 1 50); do
  ready="$("${PSQL[@]}" -tA -c "SELECT COALESCE((SELECT ready FROM public.test_gate WHERE name = 'hold-confirm'), false);")"
  if [[ "$ready" == "t" ]]; then
    break
  fi
  sleep 0.1
done
if [[ "${ready:-}" != "t" ]]; then
  echo "availability lock was not signalled" >&2
  wait "$hold_pid" || true
  cat /tmp/avail-hold.txt >&2
  exit 1
fi
set +e
run_pending "$SPACE_HOLD" "2026-09-03 09:00+02" "2026-09-03 10:00+02" /tmp/avail-hold-conflict.txt
conflict_code=$?
set -e
wait "$hold_pid"
if [[ "$conflict_code" -eq 0 ]]; then
  echo "request committed while a reservation was being confirmed" >&2
  exit 1
fi
if ! grep -q "space_unavailable" /tmp/avail-hold-conflict.txt; then
  echo "locked conflict did not report space_unavailable" >&2
  cat /tmp/avail-hold-conflict.txt >&2
  exit 1
fi

BOOKING_RACE="40000000-0000-4000-8000-000000000004"
"${PSQL[@]}" -c "INSERT INTO public.bookings (id, space_id, status, payment_status, start_at, end_at) VALUES ('${BOOKING_RACE}', '${SPACE_RACE}', 'pending_owner', 'unpaid', '2026-09-05 08:00+02', '2026-09-05 12:00+02');" >/dev/null
disposable_psql -d "$DB" -c "SELECT public.test_hold_then_approve('${BOOKING_RACE}', '${ACTOR}', 'hold-approve');" >/tmp/avail-approve-hold.txt 2>&1 &
approve_pid=$!
for _ in $(seq 1 50); do
  ready="$("${PSQL[@]}" -tA -c "SELECT COALESCE((SELECT ready FROM public.test_gate WHERE name = 'hold-approve'), false);")"
  if [[ "$ready" == "t" ]]; then
    break
  fi
  sleep 0.1
done
if [[ "${ready:-}" != "t" ]]; then
  echo "approval lock was not signalled" >&2
  wait "$approve_pid" || true
  cat /tmp/avail-approve-hold.txt >&2
  exit 1
fi
set +e
disposable_psql -d "$DB" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO public.blocked_dates (space_id, start_at, end_at, reason) VALUES ('${SPACE_RACE}', '2026-09-05 09:00+02', '2026-09-05 10:00+02', 'maintenance');" \
  >/tmp/avail-block-race.txt 2>&1
block_code=$?
set -e
wait "$approve_pid"
if [[ "$block_code" -eq 0 ]]; then
  echo "block was saved over a booking confirmed in the same lock" >&2
  exit 1
fi
if ! grep -q "Confirmed booking" /tmp/avail-block-race.txt; then
  echo "block race did not name the confirmed booking" >&2
  cat /tmp/avail-block-race.txt >&2
  exit 1
fi
reserved="$("${PSQL[@]}" -tA -c "SELECT status FROM public.bookings WHERE id = '${BOOKING_RACE}';")"
if [[ "$reserved" != "accepted_awaiting_payment" ]]; then
  echo "approval did not reserve the booking (status=${reserved})" >&2
  exit 1
fi

echo "availability phase 1 database checks passed"
