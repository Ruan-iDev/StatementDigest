#!/usr/bin/env bash
# Start an isolated LedgerFlow API for bot / parser-accuracy testing.
# Never touches ~/Documents/LedgerFlow — data lives in LEDGERFLOW_DATA.
# Usage: scripts/start-bot-test-server.sh   (env overrides below are optional)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export LEDGERFLOW_DATA="${LEDGERFLOW_DATA:-/workspace/ledgerflow-bot-data}"
export LEDGERFLOW_PORT="${LEDGERFLOW_PORT:-8471}"
export LEDGERFLOW_HOST="${LEDGERFLOW_HOST:-127.0.0.1}"
# Allow a bot frontend on :3471 (and the normal :3470) to call this API.
export LEDGERFLOW_CORS_ORIGINS="${LEDGERFLOW_CORS_ORIGINS:-[\"http://localhost:3471\",\"http://127.0.0.1:3471\",\"http://localhost:3470\",\"http://127.0.0.1:3470\"]}"

case "$LEDGERFLOW_DATA" in
  *Documents/LedgerFlow*) echo "Refusing: LEDGERFLOW_DATA points at the real Documents/LedgerFlow DB" >&2; exit 1 ;;
esac
if [ "$LEDGERFLOW_PORT" = "8470" ]; then
  echo "Refusing: :8470 is the user's real API port — pick another (default 8471)" >&2; exit 1
fi

mkdir -p "$LEDGERFLOW_DATA"
cd "$ROOT/backend"
PY="${PYTHON:-.venv/bin/python}"
[ -x "$PY" ] || PY=python3
echo "LedgerFlow bot test API → http://$LEDGERFLOW_HOST:$LEDGERFLOW_PORT/api  (data: $LEDGERFLOW_DATA)"
exec "$PY" run.py
