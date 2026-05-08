from datetime import datetime, timezone

from backend.video_analysis.domain.session import SessionStatus, TicEvent, TicType
from backend.video_analysis.services.session_service import SessionService


def test_create_session() -> None:
    svc = SessionService()
    session = svc.create_session()
    assert session.status == SessionStatus.active
    assert session.severity_score is None


def test_append_events() -> None:
    svc = SessionService()
    session = svc.create_session()
    events = [TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.mouth, confidence=0.8)]
    svc.append_events(session, events)
    assert len(session.events) == 1


def test_complete_session() -> None:
    svc = SessionService()
    session = svc.create_session()
    events = [TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.hand, confidence=0.6)]
    svc.append_events(session, events)
    svc.complete_session(session)
    assert session.status == SessionStatus.completed
    assert session.severity_score is not None
    assert session.completed_at is not None


def test_complete_empty_session() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.complete_session(session)
    assert session.severity_score == 0.0
