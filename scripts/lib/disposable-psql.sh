# Resolve psql for disposable migration tests.
# FMS_DISPOSABLE_LOCAL=1 uses the current user and PGHOST/PGPORT.
# An operating-system postgres account keeps the original sudo path.
# This helper never selects a remote database.

disposable_psql() {
  if [[ "${FMS_DISPOSABLE_LOCAL:-}" == "1" ]]; then
    command psql "$@"
    return
  fi
  if id postgres >/dev/null 2>&1; then
    sudo -u postgres psql "$@"
    return
  fi
  command psql "$@"
}

export -f disposable_psql
