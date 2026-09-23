#!/usr/bin/env bash
# Idempotent seed. Uses the running backend container if present, otherwise the local uv environment.
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose ps --status running --services 2>/dev/null | grep -q '^backend$'; then
  docker compose exec -T backend python -m app.seed.seed_data "$@"
else
  (cd backend && uv run python -m app.seed.seed_data "$@")
fi
