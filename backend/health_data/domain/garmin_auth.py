from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class GarminAuthState:
    connected: bool = False
    last_auth_at: datetime | None = None
    display_name: str | None = None


class GarminTokenStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens: dict[str, object] | None = None
        self._state = GarminAuthState()

    def set(self, tokens: dict[str, object], display_name: str, auth_at: datetime) -> None:
        with self._lock:
            self._tokens = tokens
            self._state = GarminAuthState(
                connected=True,
                last_auth_at=auth_at,
                display_name=display_name,
            )

    def get_tokens(self) -> dict[str, object] | None:
        with self._lock:
            return self._tokens

    def clear(self) -> None:
        with self._lock:
            self._tokens = None
            self._state = GarminAuthState()

    def get_state(self) -> GarminAuthState:
        with self._lock:
            return GarminAuthState(
                connected=self._state.connected,
                last_auth_at=self._state.last_auth_at,
                display_name=self._state.display_name,
            )
