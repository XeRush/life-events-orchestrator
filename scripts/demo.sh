#!/usr/bin/env bash
# Bring the demo up: containers -> healthy backend -> migrations -> seed -> print the scenario.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose}"
$COMPOSE up --build -d

echo "Waiting for the backend to become healthy..."
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/v1/health/ready >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://localhost:8000/api/v1/health/ready >/dev/null || { echo "Backend did not become ready. Run: make logs"; exit 1; }

$COMPOSE exec -T backend alembic upgrade head
$COMPOSE exec -T backend python -m app.seed.seed_data

cat <<'EOF'

LIFELOOP DEMO READY

Frontend:
http://localhost:5173

API:
http://localhost:8000

Swagger:
http://localhost:8000/docs

Demo login:
demo@lifeloop.example / demo1234

Demo Case:
L-49281  (pre-seeded: registration + certificate done, identity in progress)

Scenario:
New Baby / Birth

  1. Sign in with the demo account, open Life events > L-49281 (or click "Watch Demo" on the landing page).
  2. Voice center > Start demo call > "My daughter was born yesterday." > "Yes." -> a new case is created and its workflow starts.
  3. On the case page (Demo mode panel): Complete Birth Registration -> Issue Birth Certificate -> Start Identity.
  4. Require Document -> the assistant queues a callback (Callback center). Answer it and say "I don't have it right now."
  5. Submit Document -> identity resumes. Approve Identity -> Additional Services unlocks. Complete Health / Additional Services.
  6. Ask "Where are we?" at any point - the answer comes from persistent case state. Full script: docs/demo-script.md
EOF
