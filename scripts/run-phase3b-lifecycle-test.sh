#!/usr/bin/env bash

# Runs the final Phase 3B lifecycle proof against an isolated local database.
# The Anthropic credential is read from the terminal without echo and is passed
# only to the child Signal process. It is never written to disk by this helper.

set +x
set -Eeuo pipefail

DB_PORT=55432
APP_PORT=3001
DB_NAME=signal_audit_p3b
DB_USER=signal_p3b
DB_PASSWORD=signal_p3b_local_only
CONTAINER_NAME="signal-audit-p3b-postgres-$$"
APP_HOST=127.0.0.1
AUDIT_URL=""
EXPECTED_BRANCH=claude/signal-rubric-engine-audit-jvax0e
PHASE3B_GATE_SHA=0936c61855573b44c9812d54a913997f85e99597

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
DATABASE_URL_VALUE="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}?schema=public"

CONTAINER_STARTED=0
APP_PID=""
ANTHROPIC_API_KEY_INPUT=""

fail() {
  printf '\nPhase 3B lifecycle helper could not start: %s\n' "$1" >&2
  exit 1
}

terminate_process_tree() {
  local parent_pid="$1"
  local child_pid

  while IFS= read -r child_pid; do
    [ -z "$child_pid" ] || terminate_process_tree "$child_pid"
  done < <(pgrep -P "$parent_pid" 2>/dev/null || true)

  kill -TERM "$parent_pid" >/dev/null 2>&1 || true
}

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  set +e

  unset ANTHROPIC_API_KEY_INPUT

  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    printf '\nStopping the disposable Signal server...\n'
    terminate_process_tree "$APP_PID"
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi

  if [ "$CONTAINER_STARTED" -eq 1 ]; then
    printf 'Destroying disposable PostgreSQL container...\n'
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  printf 'Phase 3B disposable environment stopped.\n'
  exit "$exit_status"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

command -v docker >/dev/null 2>&1 || fail "Docker is unavailable. Install/start Docker Desktop, then retry."
docker info >/dev/null 2>&1 || fail "Docker is unavailable. Start Docker Desktop, then retry."
command -v node >/dev/null 2>&1 || fail "Node.js is unavailable."
command -v npm >/dev/null 2>&1 || fail "npm is unavailable."
command -v git >/dev/null 2>&1 || fail "Git is unavailable."
command -v curl >/dev/null 2>&1 || fail "curl is unavailable."
command -v lsof >/dev/null 2>&1 || fail "lsof is unavailable; it is required for safe port checks."
command -v pgrep >/dev/null 2>&1 || fail "pgrep is unavailable; it is required for reliable cleanup."

cd "$REPO_DIR"

CURRENT_BRANCH=$(git branch --show-current)
[ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ] || fail "this checkout is on '$CURRENT_BRANCH', not the Phase 3B experimental branch."
git merge-base --is-ancestor "$PHASE3B_GATE_SHA" HEAD || fail "the accepted Phase 3B gate SHA is not present in this checkout."

[ -x node_modules/.bin/prisma ] || fail "dependencies are missing; run 'npm install' in $REPO_DIR, then retry."
[ -x node_modules/.bin/tsx ] || fail "dependencies are missing; run 'npm install' in $REPO_DIR, then retry."
[ -x node_modules/.bin/next ] || fail "dependencies are missing; run 'npm install' in $REPO_DIR, then retry."
[ -f scripts/seed-phase3b-production-capture.ts ] || fail "the Phase 3B production-shaped seed is missing."
[ -f artifacts/rubric-production-parity/production-jsa-graph.json ] || fail "the gitignored read-only production graph capture is missing."
[ -f artifacts/rubric-production-parity/production-jsa-truth.json ] || fail "the gitignored read-only production truth capture is missing."

if lsof -nP -iTCP:"$DB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port $DB_PORT is occupied. Stop the process using it, then retry."
fi

if lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port $APP_PORT is occupied. Stop the process using it, then retry."
fi

printf 'Starting disposable PostgreSQL on 127.0.0.1:%s...\n' "$DB_PORT"
if ! docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --publish "127.0.0.1:${DB_PORT}:5432" \
  --env "POSTGRES_DB=${DB_NAME}" \
  --env "POSTGRES_USER=${DB_USER}" \
  --env "POSTGRES_PASSWORD=${DB_PASSWORD}" \
  postgres:16-alpine >/dev/null; then
  fail "Docker could not start the disposable PostgreSQL container."
fi
CONTAINER_STARTED=1

postgres_ready=0
for _attempt in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready --quiet --username "$DB_USER" --dbname "$DB_NAME"; then
    postgres_ready=1
    break
  fi

  if ! docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q '^true$'; then
    fail "the disposable PostgreSQL container stopped during startup."
  fi

  sleep 1
done
[ "$postgres_ready" -eq 1 ] || fail "disposable PostgreSQL did not become ready within 60 seconds."

printf 'Applying existing database migrations...\n'
if ! DATABASE_URL="$DATABASE_URL_VALUE" ./node_modules/.bin/prisma migrate deploy; then
  fail "database migration failed; the disposable container will be destroyed."
fi

printf 'Reconstructing the production-shaped JSA state through Signal loaders...\n'
if ! SEED_OUTPUT=$(DATABASE_URL="$DATABASE_URL_VALUE" KIT_DEV_FIXTURES=1 \
  ./node_modules/.bin/tsx scripts/seed-phase3b-production-capture.ts); then
  fail "production-shaped database seed failed; the disposable container will be destroyed."
fi
printf '%s\n' "$SEED_OUTPUT"
PHASE3B_SCOPE_ID=$(printf '%s\n' "$SEED_OUTPUT" | sed -n 's/^PHASE3B_SCOPE_ID=//p' | tail -n 1)
[ -n "$PHASE3B_SCOPE_ID" ] || fail "production-shaped seed did not report its Scope id."
AUDIT_URL="http://localhost:${APP_PORT}/audit?scope=${PHASE3B_SCOPE_ID}"

[ -r /dev/tty ] || fail "an interactive terminal is required for hidden credential input."
printf '\nANTHROPIC_API_KEY (input hidden): ' >/dev/tty
if ! IFS= read -r -s ANTHROPIC_API_KEY_INPUT </dev/tty; then
  printf '\n' >/dev/tty
  fail "the API key prompt was interrupted."
fi
printf '\n' >/dev/tty

if [[ -z "${ANTHROPIC_API_KEY_INPUT//[[:space:]]/}" ]]; then
  fail "ANTHROPIC_API_KEY was missing or empty; the Signal server was not started."
fi

printf 'Starting the disposable Signal server...\n'
DATABASE_URL="$DATABASE_URL_VALUE" \
KIT_DEV_FIXTURES=1 \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY_INPUT" \
APP_PASSWORD= \
LINEAR_API_KEY= \
NOTION_API_KEY= \
FIGMA_API_KEY= \
  ./node_modules/.bin/next dev --hostname "$APP_HOST" --port "$APP_PORT" &
APP_PID=$!

# The parent helper forgets the credential immediately. The running child has
# the only process-local copy and is terminated by the EXIT/INT/TERM cleanup.
unset ANTHROPIC_API_KEY_INPUT

app_ready=0
for _attempt in $(seq 1 90); do
  if curl --silent --fail --output /dev/null "$AUDIT_URL"; then
    app_ready=1
    break
  fi

  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    wait "$APP_PID" >/dev/null 2>&1 || true
    APP_PID=""
    fail "the Signal development server exited during startup."
  fi

  sleep 1
done
[ "$app_ready" -eq 1 ] || fail "the Signal development server did not become ready within 90 seconds."

printf '\nPhase 3B lifecycle test server is ready.\n'
printf 'Open: %s\n' "$AUDIT_URL"
printf 'Press Control-C in this terminal to stop Signal and destroy the disposable database.\n\n'

if wait "$APP_PID"; then
  APP_PID=""
  fail "the Signal development server stopped unexpectedly."
else
  APP_PID=""
  fail "the Signal development server failed."
fi
