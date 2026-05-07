# Rayovak — Agent Context

## Project Overview

Rayovak is a health and performance analytics platform that correlates video analysis with wearable/health data to surface actionable insights for athletes and coaches.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Router v6 |
| Backend | Python 3.11+, FastAPI, Pydantic v2, uvicorn |
| Database | PostgreSQL 16 + TimescaleDB |
| Dev environment | Docker Compose |

## Repo Structure

```
rayovak/
├── frontend/               # React/TypeScript Vite app
│   └── src/
│       ├── api/            # Fetch-based API client
│       ├── components/     # Shared UI components
│       └── pages/          # One file per route
├── backend/
│   ├── main.py             # FastAPI app entrypoint
│   ├── config.py           # Pydantic Settings (env vars)
│   ├── video_analysis/     # Bounded context
│   ├── health_data/        # Bounded context
│   ├── correlation/        # Bounded context
│   └── shared/             # Cross-context utilities
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/      # CI/CD pipelines
└── docs/
```

## Bounded Contexts

Each backend bounded context (`video_analysis`, `health_data`, `correlation`) follows the same internal layout:

```
{context}/
├── api/        # FastAPI routers — HTTP boundary only
├── domain/     # Business logic, no framework deps
├── models/     # SQLAlchemy / Pydantic models
└── services/   # Orchestration, external calls
```

Keep logic in `domain/` and `services/`. Routers in `api/` should be thin — validate input, call a service, return a response.

## Coding Conventions

- **Python**: strict mypy, ruff (line length 100). No `Any` without a comment explaining why.
- **TypeScript**: strict mode, no implicit `any`. Prefer named exports over default where possible for pages/components.
- **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation.
- **No premature abstractions.** Three similar lines is fine. Extract only when a fourth appears and the pattern is stable.
- **Tests**: integration tests hit a real database — no mocking the DB layer.

## Running the App

### With Docker Compose (recommended)

```bash
cp .env.example .env          # edit values if needed
docker compose up --build
```

Services:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Postgres: localhost:5432 (user: rayovak, pass: rayovak, db: rayovak)

Backend hot-reloads on Python file changes. Frontend HMRs on TypeScript/React file changes.

### Without Docker

**Backend** (Python ≥ 3.11):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn backend.main:app --reload
```

**Frontend** (Node ≥ 20):
```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend
pytest

# Frontend type check
cd frontend && npx tsc -p tsconfig.app.json --noEmit

# Frontend lint
cd frontend && npm run lint
```

## Branching Strategy

GitHub Flow. `main` is always deployable.

- **Feature branches**: `ray-{issue-id}/{short-description}` — e.g., `ray-15/dev-environment`
- All work merged to `main` via pull request
- Branch deleted after merge
- No `develop` or `release` branches

## Git Identity for Agents

When committing as an agent, set the following environment variables before running `git commit`:

```bash
export GIT_AUTHOR_NAME="Rayovak Agent"
export GIT_AUTHOR_EMAIL="agent@rayovak.dev"
export GIT_COMMITTER_NAME="Rayovak Agent"
export GIT_COMMITTER_EMAIL="agent@rayovak.dev"
```

Commit messages must end with:
```
Co-Authored-By: Rayovak Agent <agent@rayovak.dev>
```
