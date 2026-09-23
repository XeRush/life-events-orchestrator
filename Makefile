.DEFAULT_GOAL := help
SHELL := /bin/bash
COMPOSE ?= docker compose
BACKEND_EXEC = $(COMPOSE) exec -T backend

.PHONY: help install dev backend frontend up down logs db migrate migration seed test lint format clean demo reset

help: ## Show this help
	@echo "LIFELOOP - one event. one call. every next step."
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv sync) and frontend (npm) dependencies
	cd backend && uv sync
	cd frontend && npm install

dev: ## Local dev: PostgreSQL in Docker + backend and frontend with hot reload
	$(COMPOSE) up -d postgres
	cd backend && uv run alembic upgrade head && uv run python -m app.seed.seed_data
	$(MAKE) -j2 backend frontend

backend: ## Run the FastAPI backend locally with reload (needs PostgreSQL on :5432)
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend: ## Run the Vite dev server locally
	cd frontend && npm run dev

up: ## Start PostgreSQL + backend + frontend in Docker
	$(COMPOSE) up --build -d
	@echo
	@echo "Frontend : http://localhost:5173"
	@echo "Backend  : http://localhost:8000"
	@echo "Swagger  : http://localhost:8000/docs"
	@echo "Postgres : localhost:5432"

down: ## Stop all containers
	$(COMPOSE) down

logs: ## Follow container logs
	$(COMPOSE) logs -f --tail=100

db: ## Open a psql shell in the PostgreSQL container
	$(COMPOSE) exec postgres psql -U lifeloop -d lifeloop

migrate: ## Apply Alembic migrations (inside the backend container)
	$(BACKEND_EXEC) alembic upgrade head

migration: ## Create a migration: make migration m="add something"
	cd backend && uv run alembic revision --autogenerate -m "$(m)"

seed: ## Seed reference data, demo user and demo case (idempotent)
	$(BACKEND_EXEC) python -m app.seed.seed_data

test: ## Run the backend test suite
	cd backend && uv run pytest

lint: ## Lint backend (ruff) and type-check frontend (tsc)
	cd backend && uv run ruff check .
	cd frontend && npm run lint

format: ## Format backend code
	cd backend && uv run ruff check --select I --fix . && uv run ruff format .

clean: ## Remove containers, volumes and build artifacts
	$(COMPOSE) down -v --remove-orphans
	rm -rf frontend/dist backend/.pytest_cache backend/.ruff_cache backend/.test-storage

demo: ## Start everything, migrate, seed, and print the demo scenario
	bash scripts/demo.sh

reset: ## Wipe the database and rebuild the demo from scratch
	bash scripts/reset.sh
