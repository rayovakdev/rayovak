import asyncio
from functools import partial

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.video_analysis.api.sessions import _store, _video_store
from backend.video_analysis.services.session_service import SessionService
from backend.video_analysis.services.video_analyzer import analyze_video

router = APIRouter(prefix="/upload", tags=["upload"])

_ACCEPTED_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
_MAX_SIZE_BYTES = 500 * 1024 * 1024

_service = SessionService()


class UploadResponse(BaseModel):
    session_id: str
    filename: str
    size_bytes: int


@router.post("", response_model=UploadResponse, status_code=202)
async def upload_video(file: UploadFile) -> UploadResponse:
    if file.content_type not in _ACCEPTED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type. Accepted: {', '.join(_ACCEPTED_TYPES)}",
        )

    content = await file.read()
    if len(content) > _MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 500 MB limit")

    session = _service.create_session()

    loop = asyncio.get_event_loop()
    events = await loop.run_in_executor(
        None,
        partial(analyze_video, content, session.id, session.started_at),
    )

    _service.append_events(session, events)
    _service.complete_session(session)
    _store[session.id] = session
    _video_store[session.id] = (content, file.content_type or "video/mp4")

    return UploadResponse(
        session_id=str(session.id),
        filename=file.filename or "upload",
        size_bytes=len(content),
    )
