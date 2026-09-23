"""Object detection on the shared camera feed (OpenCV DNN, MobileNet-SSD).

Reads MediaMTX over RTSP — never VIDEO_DEVICE, which camera.py owns exclusively.
A person detection raises a motion event through events.handle_motion(), the
same path the HTTP /motion endpoint uses.

Design notes:
  - cv2 is imported lazily so the hub still boots (and /health still answers)
    on a machine without OpenCV or without model weights.
  - Frames are drained continuously and inference runs on an interval, so the
    RTSP buffer never backs up behind a slow model.
  - RTSP reconnects use bounded exponential backoff, then stop with an error
    state rather than retrying forever (architecture §8).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence

from . import config, events

log = logging.getLogger("pi_hub.detect")


@dataclass(frozen=True)
class Detection:
    """One box above the confidence floor."""

    label: str
    confidence: float
    box: tuple[int, int, int, int] = field(default=(0, 0, 0, 0))

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 3),
            "box": list(self.box),
        }


# ── Pure decision logic (no cv2, no camera — unit tested) ────────────────────


def select_triggers(
    detections: Sequence[Detection],
    targets: Sequence[str] = config.DETECT_TARGET_LABELS,
    min_confidence: float = config.DETECT_MIN_CONFIDENCE,
) -> list[Detection]:
    """Detections that are both an alert-worthy class and confident enough."""
    wanted = {t.lower() for t in targets}
    return [
        d
        for d in detections
        if d.label.lower() in wanted and d.confidence >= min_confidence
    ]


def cooldown_active(
    last_trigger_ts: Optional[float],
    now: float,
    cooldown_sec: float = config.DETECT_COOLDOWN_SEC,
) -> bool:
    """True while a previous event is still suppressing new ones."""
    if last_trigger_ts is None:
        return False
    return (now - last_trigger_ts) < cooldown_sec


def next_backoff(
    current: float,
    base: float = config.DETECT_RECONNECT_BACKOFF_SEC,
    ceiling: float = config.DETECT_RECONNECT_BACKOFF_MAX_SEC,
) -> float:
    """Exponential backoff, clamped. Bounded so it never runs away."""
    if current <= 0:
        return base
    return min(current * 2, ceiling)


def model_present() -> bool:
    return config.DETECT_PROTOTXT.exists() and config.DETECT_MODEL.exists()


# ── Runtime state ────────────────────────────────────────────────────────────

_thread: Optional[threading.Thread] = None
_stop_event: Optional[threading.Event] = None
_state: dict = {
    "running": False,
    "last_error": None,
    "last_detection": None,
    "last_trigger_ts": None,
    "frames_sampled": 0,
    "events_raised": 0,
    "read_failures": 0,
}
_state_lock = threading.Lock()


def _set(**kwargs) -> None:
    with _state_lock:
        _state.update(kwargs)


def _bump(key: str, by: int = 1) -> None:
    with _state_lock:
        _state[key] = _state.get(key, 0) + by


def _load_cv2():
    """Import OpenCV on demand. Returns the module or None."""
    try:
        import cv2  # noqa: PLC0415 — deliberate lazy import

        return cv2
    except ImportError as e:
        log.error("OpenCV not available: %s", e)
        return None


def _open_network(cv2):
    """Load MobileNet-SSD from disk into an OpenCV DNN net."""
    net = cv2.dnn.readNetFromCaffe(
        str(config.DETECT_PROTOTXT),
        str(config.DETECT_MODEL),
    )
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    return net


def _open_capture(cv2):
    cap = cv2.VideoCapture(config.MEDIAMTX_RTSP_URL, cv2.CAP_FFMPEG)
    # Keep the buffer shallow so sampled frames are recent, not queued.
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:  # noqa: BLE001 — property is backend dependent
        pass
    return cap


def infer(cv2, net, frame) -> list[Detection]:
    """Run one forward pass and return detections above the confidence floor."""
    height, width = frame.shape[:2]
    blob = cv2.dnn.blobFromImage(
        frame,
        scalefactor=0.007843,  # 1/127.5
        size=(config.DETECT_INPUT_SIZE, config.DETECT_INPUT_SIZE),
        mean=127.5,
    )
    net.setInput(blob)
    raw = net.forward()

    found: list[Detection] = []
    for i in range(raw.shape[2]):
        confidence = float(raw[0, 0, i, 2])
        if confidence < config.DETECT_MIN_CONFIDENCE:
            continue
        class_id = int(raw[0, 0, i, 1])
        if class_id < 0 or class_id >= len(config.DETECT_CLASSES):
            continue
        x1 = int(raw[0, 0, i, 3] * width)
        y1 = int(raw[0, 0, i, 4] * height)
        x2 = int(raw[0, 0, i, 5] * width)
        y2 = int(raw[0, 0, i, 6] * height)
        found.append(
            Detection(
                label=config.DETECT_CLASSES[class_id],
                confidence=confidence,
                box=(x1, y1, x2, y2),
            )
        )
    return found


def _run(stop: threading.Event, on_event: Callable[..., dict]) -> None:
    """Detection loop. Runs on a background thread until `stop` is set."""
    cv2 = _load_cv2()
    if cv2 is None:
        _set(running=False, last_error="opencv not installed")
        return

    try:
        net = _open_network(cv2)
    except Exception as e:  # noqa: BLE001 — surface any load failure as state
        log.error("Failed to load detection model: %s", e)
        _set(running=False, last_error=f"model load failed: {e}")
        return

    log.info(
        "Detector started: %s targets=%s conf>=%.2f every %.1fs",
        config.MEDIAMTX_RTSP_URL,
        list(config.DETECT_TARGET_LABELS),
        config.DETECT_MIN_CONFIDENCE,
        config.DETECT_INTERVAL_SEC,
    )

    cap = None
    backoff = 0.0
    failures = 0
    last_infer = 0.0

    try:
        while not stop.is_set():
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = _open_capture(cv2)
                if not cap.isOpened():
                    failures += 1
                    _set(read_failures=failures)
                    if failures >= config.DETECT_MAX_READ_FAILURES:
                        msg = (
                            f"gave up after {failures} RTSP open failures — "
                            "is MediaMTX publishing?"
                        )
                        log.error("Detector %s", msg)
                        _set(last_error=msg)
                        return
                    backoff = next_backoff(backoff)
                    log.warning(
                        "RTSP open failed (%s/%s); retrying in %.0fs",
                        failures,
                        config.DETECT_MAX_READ_FAILURES,
                        backoff,
                    )
                    stop.wait(backoff)
                    continue
                log.info("RTSP connected")
                failures = 0
                backoff = 0.0
                _set(read_failures=0, last_error=None)

            # Drain — keeps the decoder current without paying for inference.
            if not cap.grab():
                failures += 1
                _set(read_failures=failures)
                if failures >= config.DETECT_MAX_READ_FAILURES:
                    msg = f"gave up after {failures} consecutive read failures"
                    log.error("Detector %s", msg)
                    _set(last_error=msg)
                    return
                cap.release()
                cap = None
                backoff = next_backoff(backoff)
                stop.wait(backoff)
                continue

            now = time.monotonic()
            if (now - last_infer) < config.DETECT_INTERVAL_SEC:
                continue
            last_infer = now

            ok, frame = cap.retrieve()
            if not ok or frame is None:
                continue

            failures = 0
            _bump("frames_sampled")

            try:
                detections = infer(cv2, net, frame)
            except Exception as e:  # noqa: BLE001 — one bad frame is not fatal
                log.warning("Inference failed on a frame: %s", e)
                continue

            triggers = select_triggers(detections)
            if not triggers:
                continue

            best = max(triggers, key=lambda d: d.confidence)
            _set(last_detection=best.as_dict())

            with _state_lock:
                last_ts = _state.get("last_trigger_ts")
            if cooldown_active(last_ts, time.monotonic()):
                log.debug("Detection suppressed by cooldown: %s", best.label)
                continue

            _set(last_trigger_ts=time.monotonic())
            _bump("events_raised")
            labels = sorted({d.label for d in triggers})
            log.info(
                "Detected %s (%.2f) — raising motion event",
                best.label,
                best.confidence,
            )
            try:
                on_event(source="opencv", labels=labels)
            except Exception as e:  # noqa: BLE001 — keep detecting on failure
                log.error("Motion event failed: %s", e)
                _set(last_error=f"event failed: {e}")
    finally:
        if cap is not None:
            cap.release()
        _set(running=False)
        log.info("Detector stopped")


# ── Public API (mirrors camera.py / live.py) ─────────────────────────────────


def is_running() -> bool:
    return _thread is not None and _thread.is_alive()


def start(on_event: Callable[..., dict] | None = None) -> dict:
    """Start the detection thread. Idempotent."""
    global _thread, _stop_event

    if is_running():
        return {"ok": True, "running": True, "message": "already running"}

    if not model_present():
        msg = (
            "detection model missing — run scripts/fetch-detection-model.sh "
            f"(expected {config.DETECT_MODEL})"
        )
        log.warning("Detector not started: %s", msg)
        _set(running=False, last_error=msg)
        return {"ok": False, "running": False, "error": msg}

    if _load_cv2() is None:
        msg = "opencv not installed — pip3 install opencv-python-headless"
        _set(running=False, last_error=msg)
        return {"ok": False, "running": False, "error": msg}

    _stop_event = threading.Event()
    _set(running=True, last_error=None, read_failures=0)
    _thread = threading.Thread(
        target=_run,
        args=(_stop_event, on_event or events.handle_motion),
        name="pi_hub.detect",
        daemon=True,
    )
    _thread.start()
    return {"ok": True, "running": True}


def stop() -> dict:
    """Signal the detection thread to finish and wait briefly for it."""
    global _thread, _stop_event

    if not is_running():
        _thread = None
        _set(running=False)
        return {"ok": True, "running": False, "message": "not running"}

    if _stop_event is not None:
        _stop_event.set()
    _thread.join(timeout=10)
    stopped = not is_running()
    if not stopped:
        log.warning("Detector thread did not exit within 10s")
    _thread = None
    _set(running=False)
    return {"ok": True, "running": False, "clean": stopped}


def status() -> dict:
    with _state_lock:
        snapshot = dict(_state)
    snapshot["running"] = is_running()
    snapshot["model_present"] = model_present()
    snapshot["opencv_available"] = _load_cv2() is not None
    snapshot["source"] = config.MEDIAMTX_RTSP_URL
    snapshot["targets"] = list(config.DETECT_TARGET_LABELS)
    snapshot["min_confidence"] = config.DETECT_MIN_CONFIDENCE
    snapshot["interval_sec"] = config.DETECT_INTERVAL_SEC
    snapshot["cooldown_sec"] = config.DETECT_COOLDOWN_SEC
    # last_trigger_ts is a monotonic clock value — report age, not epoch.
    ts = snapshot.pop("last_trigger_ts", None)
    snapshot["seconds_since_last_event"] = (
        round(time.monotonic() - ts, 1) if ts is not None else None
    )
    return snapshot
