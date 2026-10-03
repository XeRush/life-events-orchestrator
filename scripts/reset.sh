#!/usr/bin/env bash
# DESTRUCTIVE: remove LifeLoop's containers and volumes, then rebuild a clean, seeded demo.
set -euo pipefail
cd "$(dirname "$0")/.."
${COMPOSE:-docker compose} down -v --remove-orphans
bash scripts/demo.sh
