from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.correlation.api.router import router as correlation_router
from backend.health_data.api.router import router as health_data_router
from backend.video_analysis.api.router import router as video_analysis_router
from backend.video_analysis.seed import seed_sessions


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]  # FastAPI generic not exposed publicly
    if settings.seed_on_startup:
        seed_sessions()
    yield


app = FastAPI(title="Rayovak API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video_analysis_router, prefix="/api/v1/video_analysis")
app.include_router(health_data_router, prefix="/api/v1/health_data")
app.include_router(correlation_router, prefix="/api/v1/correlation")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
