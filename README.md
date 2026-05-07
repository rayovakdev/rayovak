# Rayovak

Rayovak is a health and performance analytics platform that correlates video analysis with health data to surface actionable insights.

## Directory Structure

```
rayovak/
├── frontend/               # React/TypeScript web app
├── backend/
│   ├── video_analysis/     # Video ingestion & analysis bounded context
│   │   ├── api/
│   │   ├── domain/
│   │   ├── models/
│   │   └── services/
│   ├── health_data/        # Health metrics & wearable data bounded context
│   │   ├── api/
│   │   ├── domain/
│   │   ├── models/
│   │   └── services/
│   ├── correlation/        # Cross-domain correlation & insights bounded context
│   │   ├── api/
│   │   ├── domain/
│   │   ├── models/
│   │   └── services/
│   └── shared/             # Shared utilities, types, and infrastructure
│       ├── api/
│       ├── domain/
│       ├── models/
│       └── services/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/      # CI/CD pipelines
├── docs/                   # Project documentation
├── pyproject.toml          # Python project config & dependencies
└── package.json            # Node workspace root
```

## Getting Started

### Backend (Python ≥ 3.11)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Frontend (Node ≥ 20)

```bash
npm install
npm run dev
```
