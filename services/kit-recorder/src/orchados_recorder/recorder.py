"""The recorder core: commands, session files, health and the status message.

Pure Python over thin adapters (clock, receiver transport, LiDAR monitor, ros2
bag, SSD probe), so the whole behaviour runs on fakes in the tests. The
service calls `pump()` often (receiver bytes), `tick()` once a second (health,
status) and `handle_command()` for every BLE write. Not thread-safe: the
caller serialises the calls.

Behaviour: docs/arayuzler.md, "Kit kaydedicisi (Raspberry Pi)".
"""

from __future__ import annotations

import logging
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import __version__
from .clock import ClockState, classify_clock, pps_anchor
from .gpstime import unix_ns_to_gps_ns
from .health import LiveHealth, Snapshot, precheck_failures
from .lidar import BagRecorder, LidarMonitor, LidarSample
from .protocol import (
    STATUS_LEN,
    Alert,
    Check,
    Flag,
    LidarModeCode,
    LidarState,
    MarkEvent,
    PpsState,
    Result,
    RxConfig,
    StartSession,
    Status,
    StopSession,
    check_names,
    decode_command,
    encode_status,
)
from .receiver import RECEIVER_INFO, Receiver, Transport
from .session import Anchor, SessionWriter, TimeStamp, recover_open_sessions, session_dir
from .ssd import SsdStatus, probe_ssd
from .thresholds import (
    BAG_RESTART_MAX_S,
    BAG_RESTART_MIN_S,
    BAG_RESTART_RESET_S,
    LIDAR_RATE_WINDOW_S,
    LIDAR_SILENT_S,
    PPS_LOST_S,
    SSD_LOW_GIB,
    SSD_MIN_FREE_START_GIB,
    SSD_STOP_MIB,
)
from .ubx import NavPvt

log = logging.getLogger(__name__)

RECORDING_SCHEMA = "orchados.lidar_recording/1"
# After a write error the SSD error flag stays up at least this long.
SD_ERROR_HOLD_S = 5
_US = 1_000_000

RX_CONFIG_CODES = {
    "pending": RxConfig.PENDING,
    "ok": RxConfig.OK,
    "no_response": RxConfig.NO_RESPONSE,
    "nak": RxConfig.NAK,
    "invalid_settings": RxConfig.INVALID,
}
LIDAR_MODE_CODES = {
    "unknown": LidarModeCode.UNKNOWN,
    "ok": LidarModeCode.OK,
    "wrong": LidarModeCode.WRONG,
}


@dataclass
class Deps:
    clock: Any  # SystemClock or FakeClock
    transport: Transport
    lidar: LidarMonitor
    bag: BagRecorder
    ssd_mount: Path
    probe_ssd: Callable[..., SsdStatus] = probe_ssd
    # Called with every NAV-PVT and its receive time (Unix ns): the chrony feed.
    pvt_sink: Callable[[NavPvt, int], None] | None = None
    receiver_timeout_s: float = 1.0


def _version_tuple(version: str) -> tuple[int, int, int]:
    parts = [int(p) if p.isdigit() else 0 for p in version.split(".")[:3]] + [0, 0, 0]
    return parts[0], parts[1], parts[2]


class Recorder:
    def __init__(self, deps: Deps, version: str = __version__) -> None:
        self.deps = deps
        self.version = version
        self.clock = deps.clock
        self.receiver = Receiver(
            deps.transport, self._on_gnss_bytes, self._on_pvt, clock=deps.clock
        )

        self.writer: SessionWriter | None = None
        self.health: LiveHealth | None = None
        self.last_cmd_seq = 0
        self.last_cmd_result = int(Result.NONE)

        self.clock_state = ClockState.UNLOCKED
        self.clock_offset_us = 0
        self.pps_state = PpsState.NEVER_SEEN
        self.anchor: Anchor | None = None
        self.ssd = SsdStatus(present=False, free_mib=0, error=False)
        self._write_error_us: int | None = None
        self.precheck_fail = Check(0)

        self._lidar_window: deque[tuple[int, int, int, int]] = deque()  # start, end, pts, imu
        self._lidar_prev_us: int = deps.clock.now_mono_us()
        self.lidar_last_mono_us: int | None = None
        self.lidar_pps = 0.0
        self.imu_hz = 0.0

        # The last session's figures stay in the status after the stop (summary).
        self.overrides = Check(0)
        self.alerts = Alert(0)
        self.session_gnss_bytes = 0
        # Receiver bytes lost to a reconfiguration in this session (not in gnss.ubx).
        self.session_dropped_bytes = 0
        self._discarded_at_start = 0
        self.bag_bytes = 0
        self.gap_count = 0
        self.longest_gap_s = 0
        self._points_total = 0
        self._imu_total = 0
        self._session_pps = False
        self._session_meta: dict = {}
        # ros2 bag supervision: when the process (re)started, the next restart
        # time while it is dead, and how many restarts in a row came too soon.
        self._bag_started_us = 0
        self._bag_retry_us: int | None = None
        self._bag_quick_deaths = 0

        # Sessions this process stopped but could not close (SSD gone): their
        # stop_reason, written when the SSD is back.
        self._unclosed: dict[str, str] = {}

        self.receiver.configure(timeout_s=deps.receiver_timeout_s)
        self.deps.lidar.apply_mode()
        self._evaluate(write_test=True)

    # --- state ---------------------------------------------------------------

    @property
    def recording(self) -> bool:
        return self.writer is not None

    @property
    def session_id(self) -> str | None:
        return self.writer.session_id if self.writer else None

    def _now(self) -> TimeStamp:
        mono = self.clock.now_mono_us()
        gps = None
        if self.clock_state == ClockState.PPS:
            gps = unix_ns_to_gps_ns(self.clock.now_unix_ns())
        return TimeStamp(mono, gps)

    def _eval_clock(self) -> None:
        tracking = self.clock.tracking()
        pps = self.clock.pps_assert()
        now_unix = self.clock.now_unix_ns()
        now_mono = self.clock.now_mono_us()
        age_s = (now_unix - pps[0]) / 1e9 if pps else None
        self.clock_state = classify_clock(tracking, age_s)
        self.clock_offset_us = tracking.offset_us if tracking else 0
        if pps is None:
            self.pps_state = PpsState.NEVER_SEEN
        elif age_s < PPS_LOST_S:
            self.pps_state = PpsState.LOCKED
        else:
            self.pps_state = PpsState.LOST
        if self.clock_state == ClockState.PPS:
            self.anchor = pps_anchor(pps[0], now_unix, now_mono)
        else:
            self.anchor = None

    def _add_lidar(self, s: LidarSample) -> None:
        start = min(self._lidar_prev_us, s.mono_us)
        self._lidar_prev_us = s.mono_us
        self._lidar_window.append((start, s.mono_us, s.points, s.imu_messages))
        horizon = s.mono_us - LIDAR_RATE_WINDOW_S * _US
        while self._lidar_window and self._lidar_window[0][1] <= horizon:
            self._lidar_window.popleft()
        if s.points > 0:
            self.lidar_last_mono_us = s.mono_us
        if self._lidar_window:
            begin = max(self._lidar_window[0][0], horizon)
            span_s = max((s.mono_us - begin) / _US, 1e-3)
            self.lidar_pps = sum(w[2] for w in self._lidar_window) / span_s
            self.imu_hz = sum(w[3] for w in self._lidar_window) / span_s
        if self.recording:
            self._points_total += s.points
            self._imu_total += s.imu_messages

    def _probe(self, write_test: bool) -> None:
        was_present = self.ssd.present
        self.ssd = self.deps.probe_ssd(self.deps.ssd_mount, write_test=write_test)
        if self.ssd.present and not was_present and not self.recording:
            # At start and whenever the SSD comes (back): the mount may come
            # after the service (fstab nofail), so this is not done only once.
            self._recover()
        if (
            write_test
            and self._write_error_us is not None
            and self.ssd.present
            and not self.ssd.error
            and self.clock.now_mono_us() - self._write_error_us >= SD_ERROR_HOLD_S * _US
        ):
            self._write_error_us = None

    def _recover(self) -> None:
        """Close the sessions left open on the SSD (power_loss, or the reason of a
        stop whose files could not be written)."""
        try:
            closed = recover_open_sessions(self.deps.ssd_mount, reasons=self._unclosed)
        except OSError as exc:
            log.warning("cannot look for open sessions: %s", exc)
            return
        for sid in closed:
            reason = self._unclosed.pop(sid, "power_loss")
            log.warning("session %s was left open; closed as %s", sid, reason)

    def _snapshot(self) -> Snapshot:
        now = self._now()
        return Snapshot(
            mono_us=now.mono_us,
            lidar_pps=self.lidar_pps,
            imu_hz=self.imu_hz,
            lidar_last_mono_us=self.lidar_last_mono_us,
            lidar_mode=self.deps.lidar.mode(),
            gnss_last_mono_us=self.receiver.last_rx_mono_us,
            rx_config=self.receiver.config_status,
            clock=self.clock_state,
            ssd=self.ssd,
            bag_bytes=self.bag_bytes if self.recording else 0,
            bag_alive=self.deps.bag.alive(),
            gps_ns=now.gps_ns,
        )

    def _evaluate(self, write_test: bool) -> Snapshot:
        self._eval_clock()
        self._probe(write_test)
        snap = self._snapshot()
        self.precheck_fail = precheck_failures(snap)
        return snap

    # --- the service's loop --------------------------------------------------

    def pump(self) -> None:
        """Read the receiver; while recording its bytes go to gnss.ubx and the bag."""
        self.receiver.poll()
        self._count_dropped()

    def _count_dropped(self) -> None:
        if self.recording:
            self.session_dropped_bytes = self.receiver.discarded_bytes - self._discarded_at_start

    def tick(self) -> bytes:
        """Once a second: health, events, fsync; returns the status message."""
        self.receiver.retry_configure(timeout_s=self.deps.receiver_timeout_s)
        self.receiver.poll()
        self._count_dropped()
        self._add_lidar(self.deps.lidar.drain())
        if self.recording:
            self.bag_bytes = self.deps.bag.written_bytes(self.writer.lidar_dir)
        snap = self._evaluate(write_test=not self.recording)
        if self.recording:
            self._tick_recording(snap)
        return self.status()

    def _tick_recording(self, snap: Snapshot) -> None:
        if not self.ssd.present or self.ssd.error:
            log.error("SSD gone or failing while recording; stopping")
            self._abort("ssd_lost")
            return
        if self.ssd.free_mib < SSD_STOP_MIB:
            log.error("SSD full; stopping")
            self._event("sd_error", "sd_full")
            self._stop("sd_full")
            return

        self.alerts, events = self.health.update(snap)
        self.gap_count = self.health.gap_count
        self.longest_gap_s = self.health.longest_gap_s
        locked = self.clock_state == ClockState.PPS
        if locked != self._session_pps:
            self._session_pps = locked
            events.append(("pps_regained" if locked else "pps_lost", ""))
        for event_type, payload in events:
            if not self._event(event_type, payload):
                return
        if not self._supervise_bag(snap.mono_us):
            return
        try:
            self.writer.maybe_fsync(snap.mono_us)
        except OSError as exc:
            self._fail("gnss_write", exc)

    def _supervise_bag(self, now_us: int) -> bool:
        """Restart a dead `ros2 bag` with a growing wait (a new folder each time:
        bag.1/, bag.2/, ...). False if the session stopped (events.csv failed)."""
        bag = self.deps.bag
        if bag.alive():
            return True
        if self._bag_retry_us is None:  # just found dead
            if now_us - self._bag_started_us >= BAG_RESTART_RESET_S * _US:
                self._bag_quick_deaths = 0
            wait_s = min(BAG_RESTART_MAX_S, BAG_RESTART_MIN_S * 2**self._bag_quick_deaths)
            self._bag_quick_deaths += 1
            self._bag_retry_us = now_us + wait_s * _US
            log.error("ros2 bag is not running; restarting it in %s s", wait_s)
            return True
        if now_us < self._bag_retry_us:
            return True
        self._bag_retry_us = None
        self._bag_started_us = now_us
        try:
            name = bag.restart(self.writer.lidar_dir)
        except OSError as exc:
            log.error("cannot restart ros2 bag: %s", exc)
            return True
        log.warning("ros2 bag restarted into lidar/raw/%s/", name)
        return self._event("lidar_bag_restart", name)

    # --- receiver callbacks --------------------------------------------------

    def _on_gnss_bytes(self, data: bytes) -> None:
        if self.writer is None:
            return
        try:
            self.writer.append_gnss(data)
        except OSError as exc:
            self._fail("gnss_write", exc)
            return
        self.session_gnss_bytes = self.writer.gnss_bytes
        try:
            self.deps.lidar.publish_ubx(data)
        except Exception as exc:  # the bag copy must never stop gnss.ubx
            log.warning("cannot publish UBX to the bag: %s", exc)

    def _on_pvt(self, pvt: NavPvt, rx_unix_ns: int) -> None:
        if self.deps.pvt_sink is not None:
            try:
                self.deps.pvt_sink(pvt, rx_unix_ns)
            except Exception as exc:
                log.debug("pvt sink failed: %s", exc)

    # --- commands ------------------------------------------------------------

    def handle_command(self, data: bytes) -> None:
        cmd, seq, result = decode_command(bytes(data))
        self.last_cmd_seq = seq if seq is not None else 0
        if result == Result.OK:
            if isinstance(cmd, StartSession):
                result = self._start(cmd)
            elif isinstance(cmd, StopSession):
                result = self._stop_command()
            elif isinstance(cmd, MarkEvent):
                result = self._mark(cmd)
        self.last_cmd_result = int(result)
        log.info("command %s seq %s -> %s", type(cmd).__name__, seq, Result(result).name)

    def _start(self, cmd: StartSession) -> Result:
        if self.recording:
            return Result.ALREADY_RECORDING
        self.deps.lidar.apply_mode()
        snap = self._evaluate(write_test=True)
        if not self.ssd.present:
            return Result.SD_MISSING
        if self.ssd.free_mib < SSD_MIN_FREE_START_GIB * 1024:
            return Result.SD_FULL
        if self.ssd.error:
            return Result.SD_ERROR
        failing = precheck_failures(snap)
        if failing & ~Check(cmd.override_mask):
            return Result.PRECHECK_FAILED
        if session_dir(self.deps.ssd_mount, cmd.session_id).exists():
            return Result.SESSION_EXISTS

        overrides = Check(cmd.override_mask) & failing
        start = self._now()
        receiver = dict(RECEIVER_INFO, config_status=self.receiver.config_status)
        try:
            writer = SessionWriter.create(
                self.deps.ssd_mount,
                cmd.session_id,
                cmd.parcel_id,
                receiver=receiver,
                recorder_version=self.version,
                overrides=check_names(overrides),
                clock_state=self.clock_state.value,
                start=start,
                anchor=self.anchor,
            )
        except FileExistsError:
            return Result.SESSION_EXISTS
        except OSError as exc:
            log.error("cannot create the session: %s", exc)
            self._write_error_us = start.mono_us
            return Result.SD_ERROR

        self.writer = writer
        self.health = LiveHealth(start.mono_us)
        self.overrides = overrides
        self.alerts = Alert(0)
        self.session_gnss_bytes = 0
        self.session_dropped_bytes = 0
        self._discarded_at_start = self.receiver.discarded_bytes
        self.bag_bytes = 0
        self.gap_count = 0
        self.longest_gap_s = 0
        self._points_total = 0
        self._imu_total = 0
        self._session_pps = self.clock_state == ClockState.PPS
        self._session_meta = {
            "session_id": cmd.session_id,
            "parcel_id": cmd.parcel_id,
            "start_gps_ns": start.gps_ns,
            "clock_state_at_start": self.clock_state.value,
            "precheck_overrides": check_names(overrides),
            "lidar_mode": self.deps.lidar.mode(),
        }
        self._bag_started_us = start.mono_us
        self._bag_retry_us = None
        self._bag_quick_deaths = 0
        try:
            self.deps.bag.start(writer.lidar_dir)
        except OSError as exc:
            # GNSS still records; the missing bag shows as lidar_not_written and
            # is tried again from the tick.
            log.error("cannot start ros2 bag: %s", exc)
        log.info("session %s started (overrides: %s)", cmd.session_id, check_names(overrides))
        return Result.OK

    def _stop_command(self) -> Result:
        if not self.recording:
            return Result.NOT_RECORDING
        return Result.OK if self._stop("command") else Result.SD_ERROR

    def _mark(self, cmd: MarkEvent) -> Result:
        if not self.recording:
            return Result.NOT_RECORDING
        return Result.OK if self._event(cmd.kind, cmd.payload) else Result.SD_ERROR

    # --- writing -------------------------------------------------------------

    def _event(self, event_type: str, payload: str) -> bool:
        try:
            self.writer.event(event_type, payload, self._now(), self.anchor)
            return True
        except OSError as exc:
            self._fail("events_write", exc)
            return False

    def _fail(self, what: str, exc: Exception) -> None:
        """A write failed: sd_error (best effort), then stop with sd_error."""
        log.error("write failed (%s): %s; stopping", what, exc)
        self._abort(what)

    def _abort(self, what: str) -> None:
        """An sd_error row (best effort: the SSD may be gone), then stop with sd_error."""
        self._write_error_us = self.clock.now_mono_us()
        if self.writer is None:
            return
        try:
            self.writer.event("sd_error", what, self._now(), self.anchor)
        except (OSError, ValueError):  # ValueError: the file is already closed
            pass
        self._stop("sd_error")

    def _stop(self, reason: str) -> bool:
        writer, health = self.writer, self.health
        if writer is None:
            return False
        self._count_dropped()
        self.writer = None
        ok = True
        # The stop time is now: closing the bag's last segment can take ~15 s.
        stop = self._now()
        try:
            self.deps.bag.stop()
        except Exception as exc:
            log.error("cannot stop ros2 bag: %s", exc)
        health.finish(stop.mono_us, stop.gps_ns)
        self.gap_count = health.gap_count
        self.longest_gap_s = health.longest_gap_s
        self.bag_bytes = self.deps.bag.written_bytes(writer.lidar_dir)
        meta = self._session_meta
        doc = {
            "schema": RECORDING_SCHEMA,
            "session_id": meta["session_id"],
            "parcel_id": meta["parcel_id"],
            "recorder_version": self.version,
            "start_gps_ns": meta["start_gps_ns"],
            "stop_gps_ns": stop.gps_ns,
            "clock_state_at_start": meta["clock_state_at_start"],
            "precheck_overrides": meta["precheck_overrides"],
            "lidar_mode": meta["lidar_mode"],
            "topics": {
                "points": self.deps.bag.config.points_topic,
                "imu": self.deps.bag.config.imu_topic,
                "ubx": self.deps.bag.config.ubx_topic,
            },
            "segments": self.deps.bag.segments(writer.lidar_dir),
            "points_total": self._points_total,
            "imu_messages_total": self._imu_total,
            "gaps": health.gaps,
            "alerts": health.alert_log,
        }
        try:
            writer.write_recording_json(doc)
        except OSError as exc:
            log.error("cannot write recording.json: %s", exc)
            ok = False
        try:
            writer.close(
                stop,
                reason,
                gnss_bytes=writer.gnss_bytes,
                dropped_bytes=self.session_dropped_bytes,
                anchor=self.anchor,
            )
        except OSError as exc:
            log.error("cannot close the session cleanly: %s", exc)
            ok = False
        if not ok:
            self._write_error_us = stop.mono_us
            self._unclosed[writer.session_id] = reason
        self.health = None
        self.overrides = Check(0)
        self.alerts = Alert(0)
        log.info("session %s stopped: %s", writer.session_id, reason)
        return ok

    # --- status --------------------------------------------------------------

    def status(self) -> bytes:
        pvt = self.receiver.last_pvt
        locked = self.clock_state == ClockState.PPS
        sd_error = self.ssd.error or self._write_error_us is not None
        flags = Flag(0)
        if self.ssd.present:
            flags |= Flag.SD_PRESENT
            if self.ssd.free_mib < SSD_LOW_GIB * 1024:
                flags |= Flag.SD_LOW_SPACE
        if sd_error:
            flags |= Flag.SD_ERROR
        if self.session_dropped_bytes:
            flags |= Flag.DATA_DROPPED
        if locked:
            flags |= Flag.TIME_MAPPED
        if pvt is not None and pvt.gnss_fix_ok:
            flags |= Flag.GNSS_FIX_OK
        position = pvt is not None and pvt.position_valid
        if position:
            flags |= Flag.POSITION_VALID

        now_mono = self.clock.now_mono_us()
        if self.lidar_last_mono_us is None:
            lidar_state = LidarState.NEVER_SEEN
        elif now_mono - self.lidar_last_mono_us > LIDAR_SILENT_S * _US:
            lidar_state = LidarState.LOST
        else:
            lidar_state = LidarState.STREAMING

        s = Status(
            recording=self.recording,
            flags=int(flags),
            rx_config=int(RX_CONFIG_CODES.get(self.receiver.config_status, RxConfig.PENDING)),
            pps_state=int(self.pps_state),
            fix_type=pvt.fix_type if pvt else 0,
            carr_soln=pvt.carr_soln if pvt else 0,
            num_sv=pvt.num_sv if pvt else 0,
            h_acc_mm=pvt.h_acc_mm if pvt else 0xFFFFFFFF,
            bytes_written=self.session_gnss_bytes,
            sd_free_mib=self.ssd.free_mib,
            battery_mv=0,
            fw=_version_tuple(self.version),
            dropped_bytes=self.session_dropped_bytes,
            last_cmd_seq=self.last_cmd_seq,
            last_cmd_result=self.last_cmd_result,
            gps_time_ns=unix_ns_to_gps_ns(self.clock.now_unix_ns()) if locked else 0,
            lat_e7=pvt.lat_e7 if position else 0,
            lon_e7=pvt.lon_e7 if position else 0,
            height_mm=pvt.height_mm if position else 0,
            lidar_state=int(lidar_state),
            lidar_mode=int(LIDAR_MODE_CODES.get(self.deps.lidar.mode(), LidarModeCode.UNKNOWN)),
            clock_state=self.clock_state.code,
            precheck_fail=int(self.precheck_fail),
            alerts=int(self.alerts) if self.recording else 0,
            overrides=int(self.overrides) if self.recording else 0,
            lidar_points_per_s=round(self.lidar_pps),
            imu_hz=round(self.imu_hz),
            lidar_gap_count=self.gap_count,
            lidar_longest_gap_s=self.longest_gap_s,
            lidar_written_mib=self.bag_bytes >> 20,
            clock_offset_us=self.clock_offset_us,
        )
        out = encode_status(s)
        assert len(out) == STATUS_LEN
        return out
