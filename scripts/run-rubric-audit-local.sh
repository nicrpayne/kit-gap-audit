#!/usr/bin/env bash

# Local, fixture-backed hands-on review for the experimental Rubric viewport.
# This never connects to Signal's database or external services. It generates
# the same deterministic full-size JSA-shaped payload used by the renderer
# evidence pass, serves Next behind the existing read-only fixture proxy, and
# tears both processes down together on Ctrl-C.

set -eu

EXPECTED_BRANCH="claude/signal-rubric-engine-audit-jvax0e"
BASELINE_SHA="79cfacf2d8814631d45694ee4419ee6beba36880"
REVIEW_HOST="127.0.0.1"
REVIEW_PORT="${RUBRIC_REVIEW_PORT:-3000}"
APP_PORT="${RUBRIC_APP_PORT:-3001}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REVIEW_URL="http://localhost:${REVIEW_PORT}/audit?renderer=canvas&layout=rings&camera=rubric"

fail() {
  printf 'Rubric local review could not start: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is not installed."
command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v git >/dev/null 2>&1 || fail "Git is not installed."
command -v curl >/dev/null 2>&1 || fail "curl is not installed."
command -v lsof >/dev/null 2>&1 || fail "lsof is not installed."

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18 or newer is required."

cd "$REPO_DIR"

CURRENT_BRANCH=$(git branch --show-current)
[ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ] || fail "this checkout is on '$CURRENT_BRANCH', not '$EXPECTED_BRANCH'."
git merge-base --is-ancestor "$BASELINE_SHA" HEAD || fail "the required candidate $BASELINE_SHA is not in this branch."

[ -x node_modules/.bin/next ] && [ -x node_modules/.bin/tsx ] || fail "dependencies are missing; run 'npm install' in $REPO_DIR, then retry."

if [ "$REVIEW_PORT" = "$APP_PORT" ]; then
  fail "RUBRIC_REVIEW_PORT and RUBRIC_APP_PORT must be different."
fi

port_is_free() {
  ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

port_is_free "$REVIEW_PORT" || fail "port $REVIEW_PORT is already in use. Set RUBRIC_REVIEW_PORT to another fixed port and retry."
port_is_free "$APP_PORT" || fail "port $APP_PORT is already in use. Set RUBRIC_APP_PORT to another fixed port and retry."

REVIEW_TMP=$(mktemp -d "${TMPDIR:-/tmp}/signal-rubric-review.XXXXXX")
GRAPH_PATH="$REVIEW_TMP/jsa-renderer-graph.json"
APP_LOG="$REVIEW_TMP/signal-app.log"
PROXY_LOG="$REVIEW_TMP/fixture-proxy.log"
APP_PID=""
PROXY_PID=""

cleanup() {
  trap - EXIT INT TERM
  [ -z "$PROXY_PID" ] || kill "$PROXY_PID" >/dev/null 2>&1 || true
  [ -z "$APP_PID" ] || kill "$APP_PID" >/dev/null 2>&1 || true
  [ -z "$PROXY_PID" ] || wait "$PROXY_PID" >/dev/null 2>&1 || true
  [ -z "$APP_PID" ] || wait "$APP_PID" >/dev/null 2>&1 || true
  rm -rf "$REVIEW_TMP"
  printf '\nSignal Rubric local review stopped.\n'
}
trap cleanup EXIT INT TERM

./node_modules/.bin/tsx scripts/audit-renderer-fixture.ts "$GRAPH_PATH"

# APP_PASSWORD is intentionally empty for this loopback-only review server.
# The deliberately unreachable database URL and blank external keys override
# both the caller's shell and any local dotenv file. Even an accidental click
# on a write action therefore cannot reach production data or an external API.
APP_PASSWORD= \
DATABASE_URL="postgresql://rubric_review:rubric_review@127.0.0.1:1/rubric_review" \
LINEAR_API_KEY= ANTHROPIC_API_KEY= NOTION_API_KEY= FIGMA_API_KEY= \
  npm run dev -- --hostname "$REVIEW_HOST" --port "$APP_PORT" >"$APP_LOG" 2>&1 &
APP_PID=$!

attempt=0
until curl --silent --fail --output /dev/null "http://${REVIEW_HOST}:${APP_PORT}/login"; do
  attempt=$((attempt + 1))
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    printf '\nSignal app log:\n' >&2
    sed -n '1,200p' "$APP_LOG" >&2
    fail "the Signal development server exited during startup."
  fi
  [ "$attempt" -lt 60 ] || {
    printf '\nSignal app log:\n' >&2
    sed -n '1,200p' "$APP_LOG" >&2
    fail "the Signal development server did not become ready within 60 seconds."
  }
  sleep 1
done

UPSTREAM="http://${REVIEW_HOST}:${APP_PORT}" PORT="$REVIEW_PORT" RENDERER_GRAPH="$GRAPH_PATH" \
  node scripts/audit-fixture-proxy.mjs >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!

attempt=0
until curl --silent --fail --output /dev/null "$REVIEW_URL"; do
  attempt=$((attempt + 1))
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    printf '\nFixture proxy log:\n' >&2
    sed -n '1,200p' "$PROXY_LOG" >&2
    fail "the local fixture proxy exited during startup."
  fi
  [ "$attempt" -lt 30 ] || {
    printf '\nFixture proxy log:\n' >&2
    sed -n '1,200p' "$PROXY_LOG" >&2
    fail "the local review URL did not become ready within 30 seconds."
  }
  sleep 1
done

printf '\nSignal Rubric local review is ready.\n\n'
printf 'Open: %s\n\n' "$REVIEW_URL"
printf 'This uses invented, deterministic JSA-shaped fixture data only.\n'
printf 'Press Control-C in this Terminal window to stop both local servers.\n'

while kill -0 "$APP_PID" >/dev/null 2>&1 && kill -0 "$PROXY_PID" >/dev/null 2>&1; do
  sleep 2
done

printf '\nA local server stopped unexpectedly.\n' >&2
if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
  printf '\nSignal app log:\n' >&2
  sed -n '1,200p' "$APP_LOG" >&2
fi
if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
  printf '\nFixture proxy log:\n' >&2
  sed -n '1,200p' "$PROXY_LOG" >&2
fi
exit 1
