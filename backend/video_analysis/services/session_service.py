from datetime import datetime, timezone
from uuid import uuid4

from backend.video_analysis.domain.session import Session, SessionStatus, TicEvent


class SessionService:
    def create_session(self) -> Session:
        return Session(id=uuid4(), started_at=datetime.now(timezone.utc), status=SessionStatus.active)

    def append_events(self, session: Session, events: list[TicEvent]) -> Session:
        session.events.extend(events)
        return session

    def complete_session(self, session: Session) -> Session:
        session.status = SessionStatus.completed
        session.completed_at = datetime.now(timezone.utc)
        session.severity_score = self._compute_severity(session.events)
        return session

    def _compute_severity(self, events: list[TicEvent]) -> float:
        if not events:
            return 0.0
        return round(sum(e.confidence for e in events) / len(events) * 10, 2)
