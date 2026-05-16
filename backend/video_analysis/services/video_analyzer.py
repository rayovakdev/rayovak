from __future__ import annotations

import math
import os
import tempfile
from collections import deque
from datetime import datetime, timedelta
from uuid import UUID

import cv2
import mediapipe as mp

from backend.video_analysis.domain.session import TicEvent, TicType

_UPPER_LIP_IDX = 13
_LOWER_LIP_IDX = 14
_LEFT_EYE_IDX = 33
_RIGHT_EYE_IDX = 263

_SIGMA_THRESHOLD = 2.0
_MIN_MOUTH_VELOCITY = 0.005
_WINDOW_SIZE = 30
_MIN_HAND_VELOCITY = 0.005
_HAND_SIMILARITY_THRESHOLD = 0.02
_MIN_HAND_REPETITIONS = 3
_HAND_WINDOW_MS = 10_000


def _centroid(pts: list[object]) -> tuple[float, float, float]:
    n = len(pts)
    x = sum(float(getattr(p, "x")) for p in pts) / n
    y = sum(float(getattr(p, "y")) for p in pts) / n
    z = sum(float(getattr(p, "z")) for p in pts) / n
    return x, y, z


def _dist3(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def _compute_stats(values: list[float]) -> tuple[float, float]:
    if not values:
        return 0.0, 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return mean, math.sqrt(variance)


def _process_hand_burst(
    velocity: float,
    timestamp_ms: float,
    in_burst: bool,
    burst_peak: float,
    bursts: list[dict[str, float]],
    tic_type_unused: str,
) -> tuple[bool, float, list[dict[str, float]], TicEvent | None]:
    cutoff = timestamp_ms - _HAND_WINDOW_MS
    bursts = [b for b in bursts if b["timestamp"] >= cutoff]
    event: TicEvent | None = None

    if not in_burst:
        if velocity > _MIN_HAND_VELOCITY:
            in_burst = True
            burst_peak = velocity
    else:
        if velocity > burst_peak:
            burst_peak = velocity
        if velocity <= _MIN_HAND_VELOCITY:
            bursts.append({"timestamp": timestamp_ms, "peakVelocity": burst_peak})
            in_burst = False
            similar = [b for b in bursts if abs(b["peakVelocity"] - burst_peak) <= _HAND_SIMILARITY_THRESHOLD]
            if len(similar) >= _MIN_HAND_REPETITIONS:
                confidence = min(1.0, len(similar) / (_MIN_HAND_REPETITIONS * 2))
                event = TicEvent(timestamp=datetime.min, tic_type=TicType.hand, confidence=confidence)
                bursts.clear()
            burst_peak = 0.0

    return in_burst, burst_peak, bursts, event


def analyze_video(video_bytes: bytes, session_id: UUID, started_at: datetime) -> list[TicEvent]:  # noqa: ARG001
    events: list[TicEvent] = []

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        fps: float = cap.get(cv2.CAP_PROP_FPS) or 30.0

        face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        hands_mp = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        mouth_window: deque[float] = deque(maxlen=_WINDOW_SIZE)
        mouth_in_candidate = False
        mouth_candidate_start_ms = 0.0
        mouth_peak_velocity = 0.0
        prev_normalized_lip_gap: float | None = None

        left_bursts: list[dict[str, float]] = []
        right_bursts: list[dict[str, float]] = []
        left_in_burst = False
        right_in_burst = False
        left_burst_peak = 0.0
        right_burst_peak = 0.0
        prev_left_centroid: tuple[float, float, float] | None = None
        prev_right_centroid: tuple[float, float, float] | None = None

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_ms = (frame_idx / fps) * 1000.0
            frame_time = started_at + timedelta(milliseconds=frame_ms)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Mouth detection — normalized lip gap velocity to exclude rigid head motion
            face_result = face_mesh.process(rgb)
            if face_result.multi_face_landmarks:
                fl = list(face_result.multi_face_landmarks[0].landmark)
                if len(fl) > _RIGHT_EYE_IDX:
                    inter_ocular = math.hypot(
                        fl[_RIGHT_EYE_IDX].x - fl[_LEFT_EYE_IDX].x,
                        fl[_RIGHT_EYE_IDX].y - fl[_LEFT_EYE_IDX].y,
                    )
                    if inter_ocular > 0:
                        lip_gap = math.hypot(
                            fl[_UPPER_LIP_IDX].x - fl[_LOWER_LIP_IDX].x,
                            fl[_UPPER_LIP_IDX].y - fl[_LOWER_LIP_IDX].y,
                        )
                        normalized_lip_gap = lip_gap / inter_ocular
                        mouth_velocity = (
                            abs(normalized_lip_gap - prev_normalized_lip_gap)
                            if prev_normalized_lip_gap is not None
                            else 0.0
                        )
                        prev_normalized_lip_gap = normalized_lip_gap
                        mouth_window.append(mouth_velocity)

                        win = list(mouth_window)
                        mean, std = _compute_stats(win)
                        threshold = mean + _SIGMA_THRESHOLD * std

                        if not mouth_in_candidate:
                            if mouth_velocity > threshold and threshold > 0 and mouth_velocity > _MIN_MOUTH_VELOCITY:
                                mouth_in_candidate = True
                                mouth_candidate_start_ms = frame_ms
                                mouth_peak_velocity = mouth_velocity
                        else:
                            if mouth_velocity > mouth_peak_velocity:
                                mouth_peak_velocity = mouth_velocity
                            if mouth_velocity <= threshold:
                                duration = frame_ms - mouth_candidate_start_ms
                                if duration < 500:
                                    sigma_scaled = _SIGMA_THRESHOLD * std + 1e-9
                                    confidence = min(1.0, (mouth_peak_velocity - mean) / sigma_scaled / 3)
                                    events.append(TicEvent(
                                        timestamp=frame_time,
                                        tic_type=TicType.mouth,
                                        confidence=confidence,
                                    ))
                                mouth_in_candidate = False
                                mouth_peak_velocity = 0.0
            else:
                prev_normalized_lip_gap = None

            # Hand detection — mirrors handTicDetector.ts burst-repetition logic
            hand_result = hands_mp.process(rgb)
            left_vel: float | None = None
            right_vel: float | None = None

            if hand_result.multi_hand_landmarks and hand_result.multi_handedness:
                for hlm, hedness in zip(
                    hand_result.multi_hand_landmarks, hand_result.multi_handedness
                ):
                    label: str = hedness.classification[0].label
                    hc = _centroid(list(hlm.landmark))
                    if label == "Left":
                        left_vel = _dist3(hc, prev_left_centroid) if prev_left_centroid is not None else 0.0
                        prev_left_centroid = hc
                    else:
                        right_vel = _dist3(hc, prev_right_centroid) if prev_right_centroid is not None else 0.0
                        prev_right_centroid = hc
            else:
                prev_left_centroid = None
                prev_right_centroid = None

            if left_vel is not None:
                left_in_burst, left_burst_peak, left_bursts, hand_event = _process_hand_burst(
                    left_vel, frame_ms, left_in_burst, left_burst_peak, left_bursts, "left"
                )
                if hand_event is not None:
                    events.append(TicEvent(timestamp=frame_time, tic_type=TicType.hand, confidence=hand_event.confidence))

            if right_vel is not None:
                right_in_burst, right_burst_peak, right_bursts, hand_event = _process_hand_burst(
                    right_vel, frame_ms, right_in_burst, right_burst_peak, right_bursts, "right"
                )
                if hand_event is not None:
                    events.append(TicEvent(timestamp=frame_time, tic_type=TicType.hand, confidence=hand_event.confidence))

            frame_idx += 1

        cap.release()
        face_mesh.close()
        hands_mp.close()
    finally:
        os.unlink(tmp_path)

    return events
