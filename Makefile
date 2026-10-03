# LifeLoop - Team Symphony, Ignyte x ElevenLabs Voice Agent Challenge.
# Works with GNU make + bash (Linux/macOS, Git Bash or WSL on Windows). PowerShell equivalents: docs/deployment/local-development.md
.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE ?= docker compose
-include .env
FRONTEND_PORT ?= 5173
BACKEND_PORT ?= 8000
API := http://localhost:$(BACKEND_PORT)

.PHONY: help install dev up down build logs backend frontend migrate migration seed demo test agent-test lint format clean health reset docs bones

help: ## Show this help
	@echo "LifeLoop - one call, one case, every step after birth."
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv sync) and frontend (npm ci) dependencies
	cd backend && uv sync
	cd frontend && npm ci

dev: ## Data stores in Docker + backend and frontend with hot reload on the host
	$(COMPOSE) up -d postgres redis kafka neo4j
	$(MAKE) -j2 backend frontend

backend: ## Run the FastAPI backend locally with reload (uses .env; needs the data stores)
	cd backend && uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)

frontend: ## Run the Vite dev server locally
	cd frontend && VITE_PROXY_TARGET=$(API) npm run dev -- --port $(FRONTEND_PORT)

up: ## Build and start the whole platform in Docker
	$(COMPOSE) up --build -d
	@bash scripts/wait-ready.sh $(API)
	@echo "Frontend : http://localhost:$(FRONTEND_PORT)"
	@echo "Backend  : $(API)   (Swagger $(API)/docs)"

down: ## Stop all containers
	$(COMPOSE) down

build: ## Build images, the frontend bundle and type-check
	$(COMPOSE) build
	cd frontend && npm run build

logs: ## Follow container logs
	$(COMPOSE) logs -f --tail=150

migrate: ## Apply Alembic migrations (inside the backend container)
	$(COMPOSE) exec -T backend alembic upgrade head

migration: ## Create a migration: make migration m="describe the change"
	cd backend && uv run alembic revision --autogenerate -m "$(m)"

seed: ## Idempotent seed: reference data, demo users and demo cases
	$(COMPOSE) exec -T backend python -m app.seed

demo: ## Start everything, migrate, seed, and print URLs, credentials and the scenario
	bash scripts/demo.sh

test: ## Backend test suite (pytest) and frontend type-check
	cd backend && uv run pytest
	cd frontend && npm run lint

agent-test: ## Agent Testing guardrail scenarios only
	cd backend && uv run pytest -q tests/test_agent.py -k "scenarios or translations"

lint: ## Ruff (backend) and TypeScript (frontend); also checks the banned Sparkle icon
	cd backend && uv run ruff check .
	cd frontend && npm run lint
	@! grep -rnE "\bSparkles?\b" frontend/src || (echo "Banned Lucide Sparkle icon found" && exit 1)

bones: ## Regenerate skeleton screens (boneyard-js captures every <Bones> fixture on the dev-only /__bones page)
	cd frontend && npm run bones

format: ## Format backend code
	cd backend && uv run ruff check --fix . && uv run ruff format .

health: ## Readiness of every dependency (live or fallback)
	@curl -fsS $(API)/ready | python -m json.tool

clean: ## Remove containers, volumes and build artefacts (DESTRUCTIVE for local data)
	$(COMPOSE) down -v --remove-orphans
	rm -rf frontend/dist backend/.pytest_cache backend/.ruff_cache backend/.test-storage

reset: ## Wipe local data and rebuild the demo from scratch (DESTRUCTIVE)
	bash scripts/reset.sh

docs: ## Print the documentation map
	@sed -n '1,80p' docs/README.md
