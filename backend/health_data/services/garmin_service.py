from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from garminconnect import (  # type: ignore[import-untyped]
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

from backend.health_data.domain.garmin_auth import GarminAuthState, GarminTokenStore

_store = GarminTokenStore()


class GarminService:
    def authenticate(self, email: str, password: str) -> GarminAuthState:
        if not email or not password:
            raise ValueError("Garmin credentials not configured")
        try:
            client: Any = Garmin(email, password)
            client.login()
            tokens: dict[str, object] = client.garth.dump()
            display_name: str = client.get_full_name() or email
            _store.set(tokens, display_name, datetime.now(timezone.utc))
            return _store.get_state()
        except GarminConnectAuthenticationError as exc:
            raise ValueError("Invalid Garmin credentials") from exc
        except GarminConnectTooManyRequestsError as exc:
            raise RuntimeError("Garmin rate limit exceeded") from exc
        except ConnectionError as exc:
            raise RuntimeError("Cannot reach Garmin Connect") from exc

    def get_status(self) -> GarminAuthState:
        return _store.get_state()

    def disconnect(self) -> GarminAuthState:
        _store.clear()
        return _store.get_state()

    def get_client(self) -> Any:
        tokens = _store.get_tokens()
        if tokens is None:
            raise RuntimeError("Not connected to Garmin Connect")
        client: Any = Garmin("", "")
        client.garth.loads(tokens)
        return client
