#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STACK_DB="${STACK_DB:-sqlite}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[stack] missing required command: $1" >&2
    exit 1
  fi
}

is_port_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -nP >/dev/null 2>&1
    return
  fi
  return 1
}

check_existing_next_dev() {
  local lock_file="${ROOT_DIR}/.next/dev/lock"
  if [[ ! -f "${lock_file}" ]]; then
    return
  fi

  local pid
  pid="$(grep -o '"pid":[0-9]\+' "${lock_file}" | head -n1 | cut -d: -f2 || true)"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    echo "[stack] detected existing next dev process (pid=${pid}), stop it first" >&2
    exit 1
  fi
}

cleanup() {
  local pids
  pids="$(jobs -p || true)"
  if [[ -n "${pids}" ]]; then
    kill ${pids} >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

ensure_command cargo
ensure_command bun
check_existing_next_dev

if is_port_busy "${BACKEND_PORT}"; then
  echo "[stack] backend port ${BACKEND_PORT} is already in use, set BACKEND_PORT to another value" >&2
  exit 1
fi

if is_port_busy "${FRONTEND_PORT}"; then
  echo "[stack] frontend port ${FRONTEND_PORT} is already in use, set FRONTEND_PORT to another value" >&2
  exit 1
fi

if [[ "${STACK_DB}" == "postgres" ]]; then
  ensure_command docker
  echo "[stack] starting PostgreSQL via docker compose ..."
  (
    cd "${ROOT_DIR}"
    docker compose up -d postgres
  )
  export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:${POSTGRES_PORT}/digital_twin}"
  echo "[stack] DATABASE_URL=${DATABASE_URL}"
else
  echo "[stack] using default SQLite storage (./backend-core-rs/data/digital-twin.db)"
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-${BACKEND_PORT}}"
export BACKEND_ALLOWED_ORIGIN="${BACKEND_ALLOWED_ORIGIN:-http://localhost:${FRONTEND_PORT}}"
export NEXT_PUBLIC_BACKEND_HTTP_URL="${NEXT_PUBLIC_BACKEND_HTTP_URL:-http://localhost:${BACKEND_PORT}}"
export NEXT_PUBLIC_BACKEND_WS_URL="${NEXT_PUBLIC_BACKEND_WS_URL:-ws://localhost:${BACKEND_PORT}}"

echo "[stack] starting backend-core-rs on :${BACKEND_PORT} ..."
(
  cd "${ROOT_DIR}/backend-core-rs"
  cargo run
) &

echo "[stack] starting Next.js on :${FRONTEND_PORT} ..."
(
  cd "${ROOT_DIR}"
  bun run dev --port "${FRONTEND_PORT}"
)
