from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.video_analysis.domain.session import Session, SessionStatus, TicEvent, TicType
from backend.video_analysis.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])

_store: dict[UUID, Session] = {}
_service = SessionService()


class CreateSessionResponse(BaseModel):
    session_id: UUID
    started_at: datetime


class TicEventIn(BaseModel):
    timestamp: datetime
    tic_type: TicType
    confidence: float


class AppendEventsRequest(BaseModel):
    events: list[TicEventIn]


class SessionSummary(BaseModel):
    session_id: UUID
    started_at: datetime
    completed_at: datetime | None
    status: SessionStatus
    severity_score: float | None
    event_count: int


class SessionDetail(BaseModel):
    session_id: UUID
    started_at: datetime
    completed_at: datetime | None
    status: SessionStatus
    severity_score: float | None
    events: list[TicEventIn]


@router.post("", response_model=CreateSessionResponse, status_code=201)
def create_session() -> CreateSessionResponse:
    session = _service.create_session()
    _store[session.id] = session
    return CreateSessionResponse(session_id=session.id, started_at=session.started_at)


@router.post("/{session_id}/events", status_code=204)
def append_events(session_id: UUID, body: AppendEventsRequest) -> None:
    session = _store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.active:
        raise HTTPException(status_code=409, detail="Session is not active")
    events = [
        TicEvent(timestamp=e.timestamp, tic_type=e.tic_type, confidence=e.confidence)
        for e in body.events
    ]
    _service.append_events(session, events)


@router.post("/{session_id}/complete", response_model=SessionSummary)
def complete_session(session_id: UUID) -> SessionSummary:
    session = _store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.active:
        raise HTTPException(status_code=409, detail="Session already completed")
    _service.complete_session(session)
    return _session_to_summary(session)


@router.get("", response_model=list[SessionSummary])
def list_sessions(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
) -> list[SessionSummary]:
    sessions = list(_store.values())
    if start_date:
        sessions = [s for s in sessions if s.started_at >= start_date]
    if end_date:
        sessions = [s for s in sessions if s.started_at <= end_date]
    if min_score is not None:
        sessions = [s for s in sessions if s.severity_score is not None and s.severity_score >= min_score]
    if max_score is not None:
        sessions = [s for s in sessions if s.severity_score is not None and s.severity_score <= max_score]
    return [_session_to_summary(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: UUID) -> SessionDetail:
    session = _store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetail(
        session_id=session.id,
        started_at=session.started_at,
        completed_at=session.completed_at,
        status=session.status,
        severity_score=session.severity_score,
        events=[
            TicEventIn(timestamp=e.timestamp, tic_type=e.tic_type, confidence=e.confidence)
            for e in session.events
        ],
    )


def _session_to_summary(session: Session) -> SessionSummary:
    return SessionSummary(
        session_id=session.id,
        started_at=session.started_at,
        completed_at=session.completed_at,
        status=session.status,
        severity_score=session.severity_score,
        event_count=len(session.events),
    )
