"""Session files on the SSD: gnss/gnss.ubx, gnss/events.csv, gnss/session.json.

Same formats as the ESP32 logger (firmware/gnss-logger/README.md, "Dosya
biçimleri"); the kit recorder's additions are in docs/arayuzler.md. Layout:

    <ssd>/sessions/<session_id>/
      gnss/gnss.ubx, gnss/events.csv, gnss/session.json
      lidar/raw/                  ros2 bag (bag/*.mcap) and recording.json

The `esp_micros` column keeps its name; on the Pi it is CLOCK_MONOTONIC in us.
"""

from __future__ import annotations

import csv
import io
import json
import os
from dataclasses import dataclass
from pathlib import Path

from .gpstime import LEAP_SECONDS, gps_ns_to_utc_iso
from .thresholds import FSYNC_INTERVAL_S

EVENTS_HEADER = "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns"
RECORDER_NAME = "kit-recorder"


@dataclass(frozen=True)
class TimeStamp:
    """When something happened: monotonic us and, with the clock locked, GPS ns."""

    mono_us: int
    gps_ns: int | None


@dataclass(frozen=True)
class Anchor:
    """The last PPS edge: its monotonic us and the GPS time of that second."""

    mono_us: int
    gps_ns: int


def session_dir(root: Path, session_id: str) -> Path:
    return Path(root) / "sessions" / session_id


def _time_point(t: TimeStamp) -> dict:
    return {
        "esp_micros": t.mono_us,
        "gps_time_ns": t.gps_ns,
        "utc": gps_ns_to_utc_iso(t.gps_ns) if t.gps_ns is not None else None,
    }


def write_json_atomic(path: Path, doc: dict) -> None:
    """Write to a temporary file, fsync, then rename over the target."""
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    _fsync_dir(path.parent)


def _fsync_dir(path: Path) -> None:
    try:
        fd = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def format_event_row(event_type: str, payload: str, at: TimeStamp, anchor: Anchor | None) -> str:
    out = io.StringIO()
    csv.writer(out, lineterminator="\n", quoting=csv.QUOTE_MINIMAL).writerow(
        [
            at.mono_us,
            "" if at.gps_ns is None else at.gps_ns,
            event_type,
            payload,
            "" if anchor is None else anchor.mono_us,
            "" if anchor is None else anchor.gps_ns,
        ]
    )
    return out.getvalue()


class SessionWriter:
    """One open session. Errors from the disk are raised as OSError; the recorder
    turns them into sd_error."""

    def __init__(self, directory: Path, meta: dict) -> None:
        self.dir = directory
        self.gnss_dir = directory / "gnss"
        self.lidar_dir = directory / "lidar" / "raw"
        self.meta = meta
        self.gnss_bytes = 0
        self._gnss = open(self.gnss_dir / "gnss.ubx", "ab")
        self._events = open(self.gnss_dir / "events.csv", "a", encoding="utf-8", newline="")
        self._last_fsync_us: int | None = None
        self._closed = False

    @classmethod
    def create(
        cls,
        root: Path,
        session_id: str,
        parcel_id: str,
        *,
        receiver: dict,
        recorder_version: str,
        overrides: list[str],
        clock_state: str,
        start: TimeStamp,
        anchor: Anchor | None,
    ) -> SessionWriter:
        directory = session_dir(root, session_id)
        (Path(root) / "sessions").mkdir(parents=True, exist_ok=True)
        directory.mkdir()  # FileExistsError: a session is never overwritten
        (directory / "gnss").mkdir()
        (directory / "lidar" / "raw").mkdir(parents=True)
        meta = {
            "format_version": 1,
            "session_id": session_id,
            "parcel_id": parcel_id,
            "firmware_version": recorder_version,
            "recorder": RECORDER_NAME,
            "receiver": receiver,
            "gps_utc_leap_seconds": LEAP_SECONDS,
            "start": _time_point(start),
            "stop": None,
            "stop_reason": None,
            "gnss_bytes": 0,
            "dropped_bytes": 0,
            "precheck_overrides": list(overrides),
            "clock_state_at_start": clock_state,
        }
        (directory / "gnss" / "events.csv").write_text(EVENTS_HEADER + "\n", encoding="utf-8")
        w = cls(directory, meta)
        w._write_meta()
        w.event("session_start", f"parcel_id={parcel_id}", start, anchor)
        if overrides:
            w.event("precheck_override", ";".join(overrides), start, anchor)
        w._fsync(start.mono_us)
        return w

    @property
    def session_id(self) -> str:
        return self.meta["session_id"]

    def append_gnss(self, data: bytes) -> None:
        self._gnss.write(data)
        self.gnss_bytes += len(data)

    def event(self, event_type: str, payload: str, at: TimeStamp, anchor: Anchor | None) -> None:
        self._events.write(format_event_row(event_type, payload, at, anchor))
        # Events are rare: hand each row to the OS at once, like the ESP32's flush.
        self._events.flush()

    def maybe_fsync(self, now_mono_us: int) -> None:
        if (
            self._last_fsync_us is None
            or now_mono_us - self._last_fsync_us >= FSYNC_INTERVAL_S * 1_000_000
        ):
            self._fsync(now_mono_us)

    def _fsync(self, now_mono_us: int) -> None:
        for f in (self._gnss, self._events):
            f.flush()
            os.fsync(f.fileno())
        self._last_fsync_us = now_mono_us

    def _write_meta(self) -> None:
        write_json_atomic(self.gnss_dir / "session.json", self.meta)

    def write_recording_json(self, doc: dict) -> None:
        write_json_atomic(self.lidar_dir / "recording.json", doc)

    def close(
        self,
        stop: TimeStamp,
        reason: str,
        *,
        gnss_bytes: int,
        dropped_bytes: int,
        anchor: Anchor | None = None,
    ) -> None:
        """session_stop event and the final session.json; best effort on each step.

        The files are closed in any case; the first error is raised afterwards.
        """
        if self._closed:
            return
        errors: list[OSError] = []
        try:
            self.event("session_stop", reason, stop, anchor)
        except OSError as exc:
            errors.append(exc)
        self.meta.update(
            stop=_time_point(stop),
            stop_reason=reason,
            gnss_bytes=gnss_bytes,
            dropped_bytes=dropped_bytes,
        )
        for step in (lambda: self._fsync(stop.mono_us), self._write_meta):
            try:
                step()
            except OSError as exc:
                errors.append(exc)
        self.abandon()
        if errors:
            raise errors[0]

    def abandon(self) -> None:
        """Close the file handles without writing anything more."""
        self._closed = True
        for f in (self._gnss, self._events):
            try:
                f.close()
            except OSError:
                pass


def recover_open_sessions(root: Path) -> list[str]:
    """Close sessions the power cut left open: stop_reason "power_loss".

    `stop` stays null (as on the ESP32 after a power cut; the pipeline requires
    esp_micros in a stop time, so none is made up), `gnss_bytes` is the size of
    gnss.ubx and events.csv is not touched. Returns the closed session ids.
    """
    sessions = Path(root) / "sessions"
    if not sessions.is_dir():
        return []
    closed: list[str] = []
    for meta_path in sorted(sessions.glob("*/gnss/session.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(meta, dict) or meta.get("stop_reason") is not None:
            continue
        ubx = meta_path.parent / "gnss.ubx"
        meta["stop_reason"] = "power_loss"
        meta["gnss_bytes"] = ubx.stat().st_size if ubx.exists() else 0
        try:
            write_json_atomic(meta_path, meta)
        except OSError:
            continue
        closed.append(meta.get("session_id") or meta_path.parent.parent.name)
    return closed
