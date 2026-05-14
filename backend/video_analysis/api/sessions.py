from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.video_analysis.domain.session import (
    ConfirmationStatus,
    Session,
    SessionStatus,
    TicEvent,
    TicType,
)
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


class TicEventOut(BaseModel):
    timestamp: datetime
    tic_type: TicType
    confidence: float
    confirmation: ConfirmationStatus | None
    annotation: str


class AppendEventsRequest(BaseModel):
    events: list[TicEventIn]


class ConfirmEventRequest(BaseModel):
    status: ConfirmationStatus
    annotation: str = ""


class BulkConfirmItem(BaseModel):
    event_index: int
    status: ConfirmationStatus
    annotation: str = ""


class BulkConfirmRequest(BaseModel):
    confirmations: list[BulkConfirmItem]


class SessionSummary(BaseModel):
    session_id: UUID
    started_at: datetime
    completed_at: datetime | None
    status: SessionStatus
    severity_score: float | None
    event_count: int
    confirmed_count: int
    rejected_count: int


class RegionScoresOut(BaseModel):
    face: float
    mouth: float
    hands: float
    body: float


class SeverityDetailOut(BaseModel):
    composite: float
    frequency_score: float
    intensity_score: float
    repetitiveness_score: float
    variety_score: float
    region_scores: RegionScoresOut


class SessionDetail(BaseModel):
    session_id: UUID
    started_at: datetime
    completed_at: datetime | None
    status: SessionStatus
    severity_score: float | None
    severity_detail: SeverityDetailOut | None
    events: list[TicEventOut]
    confirmed_count: int
    rejected_count: int


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


@router.post("/{session_id}/events/{event_index}/confirmation", status_code=204)
def confirm_event(session_id: UUID, event_index: int, body: ConfirmEventRequest) -> None:
    session = _store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == SessionStatus.active:
        raise HTTPException(status_code=409, detail="Cannot confirm events on an active session")
    if event_index < 0 or event_index >= len(session.events):
        raise HTTPException(status_code=404, detail="Event not found")
    session.events[event_index].confirmation = body.status
    session.events[event_index].annotation = body.annotation


@router.post("/{session_id}/events/bulk-confirmation", status_code=204)
def bulk_confirm_events(session_id: UUID, body: BulkConfirmRequest) -> None:
    session = _store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == SessionStatus.active:
        raise HTTPException(status_code=409, detail="Cannot confirm events on an active session")
    for item in body.confirmations:
        if 0 <= item.event_index < len(session.events):
            session.events[item.event_index].confirmation = item.status
            session.events[item.event_index].annotation = item.annotation


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
    severity_detail: SeverityDetailOut | None = None
    if session.severity_detail is not None:
        d = session.severity_detail
        severity_detail = SeverityDetailOut(
            composite=d.composite,
            frequency_score=d.frequency_score,
            intensity_score=d.intensity_score,
            repetitiveness_score=d.repetitiveness_score,
            variety_score=d.variety_score,
            region_scores=RegionScoresOut(
                face=d.region_scores.face,
                mouth=d.region_scores.mouth,
                hands=d.region_scores.hands,
                body=d.region_scores.body,
            ),
        )
    confirmed = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.confirmed)
    rejected = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.rejected)
    return SessionDetail(
        session_id=session.id,
        started_at=session.started_at,
        completed_at=session.completed_at,
        status=session.status,
        severity_score=session.severity_score,
        severity_detail=severity_detail,
        events=[
            TicEventOut(
                timestamp=e.timestamp,
                tic_type=e.tic_type,
                confidence=e.confidence,
                confirmation=e.confirmation,
                annotation=e.annotation,
            )
            for e in session.events
        ],
        confirmed_count=confirmed,
        rejected_count=rejected,
    )


def _session_to_summary(session: Session) -> SessionSummary:
    confirmed = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.confirmed)
    rejected = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.rejected)
    return SessionSummary(
        session_id=session.id,
        started_at=session.started_at,
        completed_at=session.completed_at,
        status=session.status,
        severity_score=session.severity_score,
        event_count=len(session.events),
        confirmed_count=confirmed,
        rejected_count=rejected,
    )
