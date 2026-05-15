from fastapi import APIRouter

from backend.video_analysis.api.sessions import router as sessions_router
from backend.video_analysis.api.upload import router as upload_router

router = APIRouter(tags=["video_analysis"])
router.include_router(sessions_router)
router.include_router(upload_router)
