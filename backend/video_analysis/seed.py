from datetime import datetime, timedelta, timezone
from uuid import uuid4

from backend.video_analysis.api.sessions import _store
from backend.video_analysis.domain.scoring import compute_severity
from backend.video_analysis.domain.session import Session, SessionStatus, TicEvent, TicType


def _make_session(
    started_at: datetime,
    duration_seconds: float,
    events: list[TicEvent],
) -> Session:
    result = compute_severity(events, duration_seconds)
    return Session(
        id=uuid4(),
        started_at=started_at,
        status=SessionStatus.completed,
        events=events,
        completed_at=started_at + timedelta(seconds=duration_seconds),
        severity_score=result.composite,
        severity_detail=result,
    )


def _spread(
    start: datetime,
    duration_seconds: float,
    tic_type: TicType,
    count: int,
    confidence: float,
) -> list[TicEvent]:
    interval = duration_seconds / (count + 1)
    return [
        TicEvent(
            timestamp=start + timedelta(seconds=interval * (i + 1)),
            tic_type=tic_type,
            confidence=confidence,
        )
        for i in range(count)
    ]


def seed_sessions() -> None:
    now = datetime.now(timezone.utc)

    def days_ago(n: int) -> datetime:
        return now - timedelta(days=n, hours=10)

    sessions = [
        # Session 1 — 2 days ago, 3 min, low severity
        _make_session(
            days_ago(2),
            180.0,
            _spread(days_ago(2), 180.0, TicType.mouth, 8, 0.65),
        ),
        # Session 2 — 2 days ago (afternoon), 8 min, moderate severity
        _make_session(
            days_ago(2) + timedelta(hours=5),
            480.0,
            _spread(days_ago(2) + timedelta(hours=5), 480.0, TicType.mouth, 22, 0.72)
            + _spread(days_ago(2) + timedelta(hours=5), 480.0, TicType.hand, 10, 0.68),
        ),
        # Session 3 — 3 days ago, 5 min, low severity
        _make_session(
            days_ago(3),
            300.0,
            _spread(days_ago(3), 300.0, TicType.mouth, 12, 0.70),
        ),
        # Session 4 — 4 days ago, 12 min, high severity
        _make_session(
            days_ago(4),
            720.0,
            _spread(days_ago(4), 720.0, TicType.mouth, 40, 0.82)
            + _spread(days_ago(4), 720.0, TicType.hand, 25, 0.78)
            + _spread(days_ago(4), 720.0, TicType.manual, 5, 0.90),
        ),
        # Session 5 — 5 days ago, 7 min, moderate severity
        _make_session(
            days_ago(5),
            420.0,
            _spread(days_ago(5), 420.0, TicType.mouth, 18, 0.73)
            + _spread(days_ago(5), 420.0, TicType.hand, 8, 0.67),
        ),
        # Session 6 — 7 days ago, 15 min, high severity
        _make_session(
            days_ago(7),
            900.0,
            _spread(days_ago(7), 900.0, TicType.mouth, 50, 0.87)
            + _spread(days_ago(7), 900.0, TicType.hand, 30, 0.83)
            + _spread(days_ago(7), 900.0, TicType.manual, 8, 0.92),
        ),
    ]

    for session in sessions:
        _store[session.id] = session
