#!/usr/bin/env bash
# Destroy the database volume and rebuild a clean, seeded demo. DESTRUCTIVE: all local case data is lost.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose down -v --remove-orphans
bash scripts/demo.sh
