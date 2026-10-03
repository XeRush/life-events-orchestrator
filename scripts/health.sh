#!/usr/bin/env bash
# Print readiness of every dependency (PostgreSQL, Kafka, Redis, Neo4j, ElevenLabs, Langfuse, mocks).
set -euo pipefail
API="${1:-http://localhost:${BACKEND_PORT:-8000}}"
curl -fsS "${API}/ready" | python -m json.tool
