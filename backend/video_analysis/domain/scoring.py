from dataclasses import dataclass

from .session import TicEvent, TicType


@dataclass
class ScoringWeights:
    frequency: float = 0.40
    intensity: float = 0.25
    repetitiveness: float = 0.20
    variety: float = 0.15


@dataclass
class RegionScores:
    face: float = 0.0
    mouth: float = 0.0
    hands: float = 0.0
    body: float = 0.0


@dataclass
class SeverityResult:
    composite: float
    frequency_score: float
    intensity_score: float
    repetitiveness_score: float
    variety_score: float
    region_scores: RegionScores


_BASELINE_FREQ_PER_MIN = 5.0
_DETECTED_TIC_TYPES = frozenset({TicType.mouth, TicType.hand, TicType.face, TicType.body})
_MAX_VARIETY = len(_DETECTED_TIC_TYPES)


def compute_severity(
    events: list[TicEvent],
    duration_seconds: float,
    weights: ScoringWeights | None = None,
) -> SeverityResult:
    w = weights or ScoringWeights()

    if not events or duration_seconds <= 0:
        return SeverityResult(
            composite=0.0,
            frequency_score=0.0,
            intensity_score=0.0,
            repetitiveness_score=0.0,
            variety_score=0.0,
            region_scores=RegionScores(),
        )

    duration_minutes = duration_seconds / 60.0
    freq_per_min = len(events) / duration_minutes
    frequency_score = min(100.0, (freq_per_min / _BASELINE_FREQ_PER_MIN) * 50.0)

    intensity_score = min(100.0, (sum(e.confidence for e in events) / len(events)) * 100.0)

    type_counts: dict[TicType, int] = {}
    for e in events:
        type_counts[e.tic_type] = type_counts.get(e.tic_type, 0) + 1
    most_common_count = max(type_counts.values()) if type_counts else 0
    repetitiveness_score = min(100.0, (most_common_count / len(events)) * 100.0)

    detected_variety = len(type_counts.keys() & _DETECTED_TIC_TYPES)
    variety_score = min(100.0, (detected_variety / _MAX_VARIETY) * 100.0)

    composite = round(
        frequency_score * w.frequency
        + intensity_score * w.intensity
        + repetitiveness_score * w.repetitiveness
        + variety_score * w.variety,
        2,
    )

    def region_score(tic_types: list[TicType]) -> float:
        region_events = [e for e in events if e.tic_type in tic_types]
        if not region_events:
            return 0.0
        region_freq = len(region_events) / duration_minutes
        region_intensity = sum(e.confidence for e in region_events) / len(region_events)
        return round(
            min(100.0, (region_freq / _BASELINE_FREQ_PER_MIN) * 50.0 * 0.5 + region_intensity * 100.0 * 0.5),
            2,
        )

    region_scores = RegionScores(
        face=region_score([TicType.face]),
        mouth=region_score([TicType.mouth]),
        hands=region_score([TicType.hand]),
        body=region_score([TicType.body]),
    )

    return SeverityResult(
        composite=composite,
        frequency_score=round(frequency_score, 2),
        intensity_score=round(intensity_score, 2),
        repetitiveness_score=round(repetitiveness_score, 2),
        variety_score=round(variety_score, 2),
        region_scores=region_scores,
    )
