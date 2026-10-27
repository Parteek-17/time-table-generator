# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /app

# Dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev
# JSON Schemas the solve endpoints validate requests against.
COPY contracts ./contracts
ENV SOLVER_CONTRACTS_DIR=/app/contracts

RUN useradd --create-home solver
USER solver
EXPOSE 8000
# Railway/Render set PORT; default to 8000 locally.
CMD ["sh", "-c", "/app/.venv/bin/uvicorn slotwise_solver.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
