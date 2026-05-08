from fastapi import APIRouter

from backend.video_analysis.api.sessions import router as sessions_router

router = APIRouter(tags=["video_analysis"])
router.include_router(sessions_router)
