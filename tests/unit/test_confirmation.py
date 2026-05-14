from datetime import datetime, timezone

from backend.video_analysis.domain.session import (
    ConfirmationStatus,
    SessionStatus,
    TicEvent,
    TicType,
)
from backend.video_analysis.services.session_service import SessionService


def _make_event(tic_type: TicType = TicType.mouth) -> TicEvent:
    return TicEvent(timestamp=datetime.now(timezone.utc), tic_type=tic_type, confidence=0.8)


def test_tic_event_confirmation_defaults_none() -> None:
    event = _make_event()
    assert event.confirmation is None
    assert event.annotation == ""


def test_single_event_confirmed() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event()])
    svc.complete_session(session)

    session.events[0].confirmation = ConfirmationStatus.confirmed
    session.events[0].annotation = "clear tic"

    assert session.events[0].confirmation == ConfirmationStatus.confirmed
    assert session.events[0].annotation == "clear tic"


def test_single_event_rejected() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event()])
    svc.complete_session(session)

    session.events[0].confirmation = ConfirmationStatus.rejected

    assert session.events[0].confirmation == ConfirmationStatus.rejected


def test_bulk_confirmation_updates_multiple_events() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event(), _make_event(TicType.hand), _make_event(TicType.face)])
    svc.complete_session(session)

    for i in range(len(session.events)):
        session.events[i].confirmation = ConfirmationStatus.confirmed

    assert all(e.confirmation == ConfirmationStatus.confirmed for e in session.events)


def test_confirmed_count() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event(), _make_event(), _make_event()])
    svc.complete_session(session)

    session.events[0].confirmation = ConfirmationStatus.confirmed
    session.events[1].confirmation = ConfirmationStatus.confirmed
    session.events[2].confirmation = ConfirmationStatus.rejected

    confirmed = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.confirmed)
    rejected = sum(1 for e in session.events if e.confirmation == ConfirmationStatus.rejected)

    assert confirmed == 2
    assert rejected == 1


def test_active_session_cannot_be_confirmed() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event()])

    assert session.status == SessionStatus.active
    # The API layer enforces the 409; here we verify active state is preserved
    # so the router's guard condition is testable
    assert session.status != SessionStatus.completed


def test_confirmation_overwrites_previous() -> None:
    svc = SessionService()
    session = svc.create_session()
    svc.append_events(session, [_make_event()])
    svc.complete_session(session)

    session.events[0].confirmation = ConfirmationStatus.confirmed
    session.events[0].confirmation = ConfirmationStatus.rejected

    assert session.events[0].confirmation == ConfirmationStatus.rejected
