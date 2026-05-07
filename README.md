# Rayovak

Rayovak is a health and performance analytics platform that correlates video analysis with wearable/health data to surface actionable insights for athletes and coaches.

## Directory Structure

```
rayovak/
├── frontend/               # React/TypeScript web app (Vite)
├── backend/
│   ├── main.py             # FastAPI entrypoint
│   ├── config.py           # Pydantic Settings
│   ├── video_analysis/     # Bounded context — api/, domain/, models/, services/
│   ├── health_data/        # Bounded context — api/, domain/, models/, services/
│   ├── correlation/        # Bounded context — api/, domain/, models/, services/
│   └── shared/             # Cross-context utilities
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/      # CI/CD pipelines
└── docs/
```

## Getting Started

### Docker Compose (recommended)

Single command brings up the full stack:

```bash
cp .env.example .env        # adjust values if needed
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

The backend hot-reloads on Python file changes. The frontend HMRs on TypeScript/React changes — no container restart needed.

### Without Docker

**Backend** (Python ≥ 3.11):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn backend.main:app --reload
```

**Frontend** (Node ≥ 20):

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and set values for your environment. The frontend reads `VITE_API_BASE_URL` from `frontend/.env` (see `frontend/.env.example`).

## Running Tests

```bash
# Backend unit + integration tests
pytest

# Frontend type check
cd frontend && npx tsc -p tsconfig.app.json --noEmit

# Frontend lint
cd frontend && npm run lint
```

## Branching Strategy

This project uses **GitHub Flow**.

- `main` is always deployable — never commit broken code directly
- Create a feature branch for every piece of work: `ray-{issue-id}/{short-description}`
  - Example: `ray-15/dev-environment`, `ray-22/video-upload-api`
- Open a pull request against `main` when ready for review
- Delete the branch after merge
- No `develop` or `release` branches
