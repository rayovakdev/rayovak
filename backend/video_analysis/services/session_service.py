from datetime import datetime, timezone
from uuid import uuid4

from backend.video_analysis.domain.scoring import compute_severity
from backend.video_analysis.domain.session import Session, SessionStatus, TicEvent


class SessionService:
    def create_session(self) -> Session:
        return Session(id=uuid4(), started_at=datetime.now(timezone.utc), status=SessionStatus.active)

    def append_events(self, session: Session, events: list[TicEvent]) -> Session:
        session.events.extend(events)
        return session

    def complete_session(self, session: Session) -> Session:
        session.status = SessionStatus.completed
        now = datetime.now(timezone.utc)
        session.completed_at = now
        duration = (now - session.started_at).total_seconds()
        result = compute_severity(session.events, duration)
        session.severity_score = result.composite
        session.severity_detail = result
        return session
