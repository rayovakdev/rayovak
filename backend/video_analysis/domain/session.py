from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID


class TicType(str, Enum):
    mouth = "mouth"
    hand = "hand"
    face = "face"
    body = "body"


class SessionStatus(str, Enum):
    active = "active"
    completed = "completed"


@dataclass
class TicEvent:
    timestamp: datetime
    tic_type: TicType
    confidence: float


@dataclass
class Session:
    id: UUID
    started_at: datetime
    status: SessionStatus
    events: list[TicEvent] = field(default_factory=list)
    severity_score: float | None = None
    completed_at: datetime | None = None
