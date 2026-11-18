"""Recording health: the pre-check before a session, live alerts and LiDAR gaps.

Rules and thresholds: docs/arayuzler.md, "Ön kontrol ve atlama" and "Kayıt
sırasında"; values in thresholds.py.
"""

from __future__ import annotations

from dataclasses import dataclass

from .clock import ClockState
from .protocol import ALERT_NAMES, Alert, Check
from .ssd import SsdStatus, ssd_check_ok
from .thresholds import (
    BAG_STALL_S,
    GNSS_SILENT_S,
    LIDAR_EXPECTED_PPS,
    LIDAR_MIN_RATE_FRACTION,
    LIDAR_SILENT_S,
    SSD_LOW_GIB,
)

_US = 1_000_000
LIDAR_MIN_PPS = LIDAR_EXPECTED_PPS * LIDAR_MIN_RATE_FRACTION


@dataclass(frozen=True)
class Snapshot:
    """Everything the health rules look at, taken once a second."""

    mono_us: int
    lidar_pps: float  # average over the last few seconds
    imu_hz: float
    lidar_last_mono_us: int | None  # last time points arrived
    lidar_mode: str  # unknown | ok | wrong
    gnss_last_mono_us: int | None  # last time UBX bytes arrived
    rx_config: str  # receiver configuration status
    clock: ClockState
    ssd: SsdStatus
    bag_bytes: int  # MCAP bytes written so far in this session
    bag_alive: bool
    gps_ns: int | None = None  # GPS time at mono_us, with the clock locked to PPS


def _silent(last: int | None, now: int, limit_s: float) -> bool:
    return last is None or now - last > limit_s * _US


def lidar_check_fails(s: Snapshot) -> bool:
    return _silent(s.lidar_last_mono_us, s.mono_us, LIDAR_SILENT_S) or s.lidar_pps < LIDAR_MIN_PPS


def precheck_failures(s: Snapshot) -> Check:
    fails = Check(0)
    if lidar_check_fails(s):
        fails |= Check.LIDAR
    if s.lidar_mode == "wrong":  # unknown passes: the SDK may not report the mode
        fails |= Check.LIDAR_MODE
    if s.clock != ClockState.PPS:
        fails |= Check.CLOCK
    if not ssd_check_ok(s.ssd):
        fails |= Check.SSD
    if s.rx_config != "ok" or _silent(s.gnss_last_mono_us, s.mono_us, GNSS_SILENT_S):
        fails |= Check.GNSS
    return fails


class LiveHealth:
    """Alerts during one session, the events their transitions write and the gaps."""

    def __init__(self, start_mono_us: int) -> None:
        self.start_mono_us = start_mono_us
        self.gaps: list[dict] = []
        self.alert_log: list[dict] = []
        self._alerts = Alert(0)
        self._lidar_lost = False
        self._gap_start: tuple[int, int | None] | None = None  # (mono, gps)
        self._gnss_lost = False
        self._bag_bytes = 0
        self._bag_growth_us = start_mono_us
        self._bag_was_alive = True

    @property
    def gap_count(self) -> int:
        return len(self.gaps)

    @property
    def longest_gap_s(self) -> int:
        return round(max((g["duration_s"] for g in self.gaps), default=0))

    @property
    def alerts(self) -> Alert:
        return self._alerts

    @staticmethod
    def _gps_at(s: Snapshot, mono_us: int) -> int | None:
        if s.gps_ns is None:
            return None
        return s.gps_ns - (s.mono_us - mono_us) * 1000

    def _close_gap(self, end_mono_us: int, end_gps_ns: int | None) -> None:
        start_mono, start_gps = self._gap_start
        self.gaps.append(
            {
                "start_gps_ns": start_gps,
                "end_gps_ns": end_gps_ns,
                "start_mono_us": start_mono,
                "end_mono_us": end_mono_us,
                "duration_s": round((end_mono_us - start_mono) / _US, 3),
            }
        )
        self._gap_start = None

    def update(self, s: Snapshot) -> tuple[Alert, list[tuple[str, str]]]:
        """The alerts now and the events to write (each transition once)."""
        events: list[tuple[str, str]] = []
        alerts = Alert(0)

        # LiDAR: a gap opens when it goes silent after it was seen, and closes
        # when points arrive again; it lasts from the last to the next data.
        lidar_silent = _silent(s.lidar_last_mono_us, s.mono_us, LIDAR_SILENT_S)
        if lidar_silent:
            alerts |= Alert.LIDAR_SILENT
            if not self._lidar_lost and s.lidar_last_mono_us is not None:
                self._lidar_lost = True
                last = s.lidar_last_mono_us
                self._gap_start = (last, self._gps_at(s, last))
                events.append(("lidar_lost", ""))
        else:
            if self._lidar_lost:
                self._lidar_lost = False
                last = s.lidar_last_mono_us
                self._close_gap(last, self._gps_at(s, last))
                events.append(("lidar_regained", ""))
            if s.lidar_pps < LIDAR_MIN_PPS:
                alerts |= Alert.LIDAR_RATE_LOW

        # The MCAP must grow while points arrive (the bag also carries UBX, but
        # MCAP writes in chunks, so only the LiDAR's own rate makes growth certain).
        # A restarted bag gets BAG_STALL_S for its first chunk, like a new session.
        restarted = s.bag_alive and not self._bag_was_alive
        if s.bag_bytes > self._bag_bytes:
            self._bag_bytes = s.bag_bytes
            self._bag_growth_us = s.mono_us
        elif lidar_silent or restarted:
            self._bag_growth_us = s.mono_us
        in_start_window = s.mono_us - self.start_mono_us < BAG_STALL_S * _US
        stalled = s.mono_us - self._bag_growth_us >= BAG_STALL_S * _US
        if not s.bag_alive or (stalled and not in_start_window):
            alerts |= Alert.LIDAR_NOT_WRITTEN
        if not s.bag_alive and self._bag_was_alive:  # every death once
            events.append(("sd_error", "lidar_write"))
        self._bag_was_alive = s.bag_alive

        gnss_silent = _silent(s.gnss_last_mono_us, s.mono_us, GNSS_SILENT_S)
        if gnss_silent:
            alerts |= Alert.GNSS_SILENT
            if not self._gnss_lost and s.gnss_last_mono_us is not None:
                self._gnss_lost = True
                events.append(("gnss_lost", ""))
        elif self._gnss_lost:
            self._gnss_lost = False
            events.append(("gnss_regained", ""))

        if s.clock != ClockState.PPS:
            alerts |= Alert.CLOCK_UNLOCKED
        if not s.ssd.present or s.ssd.error:
            alerts |= Alert.SSD_ERROR
        elif s.ssd.free_mib < SSD_LOW_GIB * 1024:
            alerts |= Alert.SSD_LOW

        self._log_rising(alerts & ~self._alerts, s.mono_us)
        self._alerts = alerts
        return alerts, events

    def _log_rising(self, rising: Alert, mono_us: int) -> None:
        for bit, name in ALERT_NAMES.items():
            if not rising & bit:
                continue
            for entry in self.alert_log:
                if entry["type"] == name:
                    entry["count"] += 1
                    break
            else:
                self.alert_log.append({"type": name, "first_mono_us": mono_us, "count": 1})

    def finish(self, mono_us: int, gps_ns: int | None) -> None:
        """At stop: a gap still open ends now."""
        if self._gap_start is not None:
            self._lidar_lost = False
            self._close_gap(mono_us, gps_ns)
