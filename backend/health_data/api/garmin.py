from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import settings
from backend.health_data.services.garmin_service import GarminService

router = APIRouter(prefix="/garmin", tags=["garmin"])

_service = GarminService()


class GarminStatusResponse(BaseModel):
    connected: bool
    last_auth_at: datetime | None
    display_name: str | None


@router.get("/status", response_model=GarminStatusResponse)
def get_status() -> GarminStatusResponse:
    state = _service.get_status()
    return GarminStatusResponse(
        connected=state.connected,
        last_auth_at=state.last_auth_at,
        display_name=state.display_name,
    )


@router.post("/connect", response_model=GarminStatusResponse)
def connect() -> GarminStatusResponse:
    try:
        state = _service.authenticate(settings.garmin_email, settings.garmin_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return GarminStatusResponse(
        connected=state.connected,
        last_auth_at=state.last_auth_at,
        display_name=state.display_name,
    )


@router.post("/disconnect", response_model=GarminStatusResponse)
def disconnect() -> GarminStatusResponse:
    state = _service.disconnect()
    return GarminStatusResponse(
        connected=state.connected,
        last_auth_at=state.last_auth_at,
        display_name=state.display_name,
    )
