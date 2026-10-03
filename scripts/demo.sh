#!/usr/bin/env bash
# Bring the demo up: containers -> healthy backend -> migrations -> idempotent seed -> print the scenario.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
set -a; source .env; set +a
COMPOSE="${COMPOSE:-docker compose}"
API="http://localhost:${BACKEND_PORT:-8000}"
WEB="http://localhost:${FRONTEND_PORT:-5173}"

$COMPOSE up --build -d
bash scripts/wait-ready.sh "$API"
$COMPOSE exec -T backend alembic upgrade head
$COMPOSE exec -T backend python -m app.seed

cat <<BANNER

  LifeLoop demo is ready  -  one call, one case, every step after birth

  Frontend   ${WEB}
  API        ${API}        Swagger ${API}/docs
  Health     ${API}/ready

  Sign in (password: DEMO_USER_PASSWORD in .env)
    Resident   demo.resident@lifeloop.local
    Officer    demo.officer@lifeloop.local      (Mariam Al Ali, Amer Officer)
    Admin      demo.admin@lifeloop.local

  Demo case LL-DEMO-001 (Demo Child, Indian, English)
    Birth certificate CLEARED . MOFA CLEARED . Consulate PARENT-REPORTED
    Residence visa PROCESSING . Emirates ID PENDING . Insurance PENDING

  Script: docs/demo/demo-script.md   Mock government integrations - no real UAE system is connected.

BANNER
