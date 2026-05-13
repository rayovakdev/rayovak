from datetime import datetime, timezone

from backend.video_analysis.domain.scoring import ScoringWeights, compute_severity
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
    assert session.severity_detail is not None


def test_complete_empty_session() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.complete_session(session)
    assert session.severity_score == 0.0


def test_compute_severity_empty() -> None:
    result = compute_severity([], 60.0)
    assert result.composite == 0.0
    assert result.frequency_score == 0.0
    assert result.region_scores.mouth == 0.0


def test_compute_severity_zero_duration() -> None:
    events = [TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.mouth, confidence=0.8)]
    result = compute_severity(events, 0.0)
    assert result.composite == 0.0


def test_compute_severity_mouth_only() -> None:
    events = [
        TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.mouth, confidence=0.9)
        for _ in range(5)
    ]
    result = compute_severity(events, 60.0)
    assert result.composite > 0.0
    assert result.region_scores.mouth > 0.0
    assert result.region_scores.hands == 0.0
    assert result.region_scores.face == 0.0
    assert result.region_scores.body == 0.0


def test_compute_severity_variety() -> None:
    events = [
        TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.mouth, confidence=0.5),
        TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.hand, confidence=0.5),
        TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.face, confidence=0.5),
        TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.body, confidence=0.5),
    ]
    result = compute_severity(events, 60.0)
    assert result.variety_score == 100.0


def test_compute_severity_custom_weights() -> None:
    events = [TicEvent(timestamp=datetime.now(timezone.utc), tic_type=TicType.mouth, confidence=1.0)]
    weights = ScoringWeights(frequency=1.0, intensity=0.0, repetitiveness=0.0, variety=0.0)
    result = compute_severity(events, 60.0, weights=weights)
    assert result.composite == result.frequency_score
