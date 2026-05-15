from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from backend.health_data.domain.garmin_auth import GarminAuthState, GarminTokenStore
from backend.health_data.services.garmin_service import GarminService


def test_garmin_auth_state_defaults() -> None:
    state = GarminAuthState()
    assert state.connected is False
    assert state.last_auth_at is None
    assert state.display_name is None


def test_token_store_initial_state() -> None:
    store = GarminTokenStore()
    state = store.get_state()
    assert state.connected is False
    assert state.last_auth_at is None
    assert state.display_name is None


def test_token_store_get_tokens_initially_none() -> None:
    store = GarminTokenStore()
    assert store.get_tokens() is None


def test_token_store_set_and_get() -> None:
    store = GarminTokenStore()
    now = datetime.now(timezone.utc)
    store.set({"access_token": "abc"}, "Jane Doe", now)
    state = store.get_state()
    assert state.connected is True
    assert state.display_name == "Jane Doe"
    assert state.last_auth_at == now
    assert store.get_tokens() == {"access_token": "abc"}


def test_token_store_clear() -> None:
    store = GarminTokenStore()
    now = datetime.now(timezone.utc)
    store.set({"access_token": "abc"}, "Jane Doe", now)
    store.clear()
    state = store.get_state()
    assert state.connected is False
    assert store.get_tokens() is None


def test_garmin_service_get_status_disconnected() -> None:
    service = GarminService()
    with patch("backend.health_data.services.garmin_service._store", GarminTokenStore()):
        state = service.get_status()
    assert state.connected is False


def test_garmin_service_disconnect() -> None:
    service = GarminService()
    fresh_store = GarminTokenStore()
    fresh_store.set({"token": "x"}, "User", datetime.now(timezone.utc))
    with patch("backend.health_data.services.garmin_service._store", fresh_store):
        state = service.disconnect()
    assert state.connected is False


def test_garmin_service_get_client_raises_when_not_connected() -> None:
    service = GarminService()
    with patch("backend.health_data.services.garmin_service._store", GarminTokenStore()):
        with pytest.raises(RuntimeError, match="Not connected"):
            service.get_client()


def test_garmin_service_authenticate_missing_credentials() -> None:
    service = GarminService()
    with pytest.raises(ValueError, match="not configured"):
        service.authenticate("", "")


def test_garmin_service_authenticate_invalid_credentials() -> None:
    from garminconnect import GarminConnectAuthenticationError  # type: ignore[import-untyped]

    service = GarminService()
    mock_client = MagicMock()
    mock_client.login.side_effect = GarminConnectAuthenticationError("bad creds")

    with patch("backend.health_data.services.garmin_service._store", GarminTokenStore()):
        with patch("backend.health_data.services.garmin_service.Garmin", return_value=mock_client):
            with pytest.raises(ValueError, match="Invalid Garmin credentials"):
                service.authenticate("user@example.com", "wrong")


def test_garmin_service_authenticate_rate_limit() -> None:
    from garminconnect import GarminConnectTooManyRequestsError  # type: ignore[import-untyped]

    service = GarminService()
    mock_client = MagicMock()
    mock_client.login.side_effect = GarminConnectTooManyRequestsError("rate limited")

    with patch("backend.health_data.services.garmin_service._store", GarminTokenStore()):
        with patch("backend.health_data.services.garmin_service.Garmin", return_value=mock_client):
            with pytest.raises(RuntimeError, match="rate limit"):
                service.authenticate("user@example.com", "pass")


def test_garmin_service_authenticate_connection_error() -> None:
    service = GarminService()
    mock_client = MagicMock()
    mock_client.login.side_effect = ConnectionError("unreachable")

    with patch("backend.health_data.services.garmin_service._store", GarminTokenStore()):
        with patch("backend.health_data.services.garmin_service.Garmin", return_value=mock_client):
            with pytest.raises(RuntimeError, match="Cannot reach"):
                service.authenticate("user@example.com", "pass")


def test_garmin_service_authenticate_success() -> None:
    service = GarminService()
    mock_client = MagicMock()
    mock_client.garth.dump.return_value = {"access_token": "tok"}
    mock_client.get_full_name.return_value = "Test User"

    fresh_store = GarminTokenStore()
    with patch("backend.health_data.services.garmin_service._store", fresh_store):
        with patch("backend.health_data.services.garmin_service.Garmin", return_value=mock_client):
            state = service.authenticate("user@example.com", "pass")

    assert state.connected is True
    assert state.display_name == "Test User"
    assert state.last_auth_at is not None
