from fastapi import APIRouter

from backend.health_data.api.garmin import router as garmin_router

router = APIRouter(tags=["health_data"])
router.include_router(garmin_router)
