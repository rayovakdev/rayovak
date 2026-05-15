from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from .scoring import SeverityResult


class TicType(str, Enum):
    mouth = "mouth"
    hand = "hand"
    face = "face"
    body = "body"
    manual = "manual"


class SessionStatus(str, Enum):
    active = "active"
    completed = "completed"


class ConfirmationStatus(str, Enum):
    confirmed = "confirmed"
    rejected = "rejected"


@dataclass
class TicEvent:
    timestamp: datetime
    tic_type: TicType
    confidence: float
    confirmation: ConfirmationStatus | None = None
    annotation: str = ""


@dataclass
class Session:
    id: UUID
    started_at: datetime
    status: SessionStatus
    events: list[TicEvent] = field(default_factory=list)
    severity_score: float | None = None
    completed_at: datetime | None = None
    severity_detail: SeverityResult | None = None
