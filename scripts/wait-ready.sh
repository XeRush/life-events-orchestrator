#!/usr/bin/env bash
# Wait until the backend reports ready (PostgreSQL reachable; other dependencies report live or fallback).
set -euo pipefail
API="${1:-http://localhost:${BACKEND_PORT:-8000}}"
echo "Waiting for LifeLoop at ${API} ..."
for _ in $(seq 1 90); do
  if curl -fsS "${API}/ready" >/dev/null 2>&1; then
    echo "Backend ready."
    exit 0
  fi
  sleep 3
done
echo "Backend did not become ready in time. Run: make logs"
exit 1
