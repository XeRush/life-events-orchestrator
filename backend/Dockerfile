# LifeLoop backend - Python 3.12 + uv (no pip installs), non-root, migrations + seed on startup via env switches.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN useradd --create-home --uid 10001 lifeloop \
    && mkdir -p /app/storage /app/logs \
    && chown -R lifeloop:lifeloop /app/storage /app/logs
USER lifeloop

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=4s --start-period=40s --retries=12 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status == 200 else 1)"

# RUN_MIGRATIONS_ON_STARTUP / SEED_ON_STARTUP (default true) run inside the app lifespan before serving.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
