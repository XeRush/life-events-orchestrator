#!/usr/bin/env bash
# Idempotent seed: if the data exists it is left alone, otherwise it is created. Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."
${COMPOSE:-docker compose} exec -T backend python -m app.seed
