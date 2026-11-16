"""BLE protocol: status message and commands.

The first 51 bytes of the status and every command are the ESP32 logger's
(firmware/gnss-logger/README.md, "BLE protokolü"). The kit recorder appends 26
bytes (77 in total) and accepts an optional override byte at the end of
start_session: docs/arayuzler.md, "Kit kaydedicisi (Raspberry Pi)".
All multi-byte fields are little-endian.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, fields
from enum import IntEnum, IntFlag
from typing import Literal

SERVICE_UUID = "cdee0001-a1bf-488e-8eda-a2c084827c6c"
STATUS_UUID = "cdee0002-a1bf-488e-8eda-a2c084827c6c"
COMMAND_UUID = "cdee0003-a1bf-488e-8eda-a2c084827c6c"
DEVICE_NAME_PREFIX = "orchados-gnss-"

PROTOCOL_VERSION = 1
ESP32_STATUS_LEN = 51
STATUS_LEN = 77
RECORDER_KIND_PI = 1

MAX_SESSION_ID_LEN = 36
MAX_PARCEL_ID_LEN = 64
MAX_PAYLOAD_LEN = 200


class Result(IntEnum):
    OK = 0
    MALFORMED = 1
    UNKNOWN_OPCODE = 2
    INVALID_ARGUMENT = 3
    ALREADY_RECORDING = 4
    NOT_RECORDING = 5
    SD_MISSING = 6
    SD_FULL = 7
    SD_ERROR = 8
    SESSION_EXISTS = 9
    PRECHECK_FAILED = 10
    NONE = 0xFF


class Check(IntFlag):
    """Pre-check items; the same mask in precheck_fail, overrides and the override byte."""

    LIDAR = 0x01
    LIDAR_MODE = 0x02
    CLOCK = 0x04
    SSD = 0x08
    GNSS = 0x10


# Only these can be skipped by the crew; SSD and receiver cannot.
OVERRIDABLE = Check.LIDAR | Check.LIDAR_MODE | Check.CLOCK

CHECK_NAMES = {
    Check.LIDAR: "lidar",
    Check.LIDAR_MODE: "lidar_mode",
    Check.CLOCK: "clock",
    Check.SSD: "ssd",
    Check.GNSS: "gnss",
}


def check_names(mask: int) -> list[str]:
    """Names of the items in a mask, in bit order (session.json, precheck_override)."""
    return [name for bit, name in CHECK_NAMES.items() if mask & bit]


class Alert(IntFlag):
    LIDAR_SILENT = 0x01
    LIDAR_RATE_LOW = 0x02
    LIDAR_NOT_WRITTEN = 0x04
    GNSS_SILENT = 0x08
    CLOCK_UNLOCKED = 0x10
    SSD_ERROR = 0x20
    SSD_LOW = 0x40


ALERT_NAMES = {
    Alert.LIDAR_SILENT: "lidar_silent",
    Alert.LIDAR_RATE_LOW: "lidar_rate_low",
    Alert.LIDAR_NOT_WRITTEN: "lidar_not_written",
    Alert.GNSS_SILENT: "gnss_silent",
    Alert.CLOCK_UNLOCKED: "clock_unlocked",
    Alert.SSD_ERROR: "ssd_error",
    Alert.SSD_LOW: "ssd_low",
}


class Flag(IntFlag):
    """Status byte 2. On the Pi "SD" means the SSD."""

    SD_PRESENT = 0x01
    SD_LOW_SPACE = 0x02
    SD_ERROR = 0x04
    TIME_MAPPED = 0x08  # clock locked to PPS
    DATA_DROPPED = 0x10
    GNSS_FIX_OK = 0x20
    POSITION_VALID = 0x40


class RxConfig(IntEnum):
    PENDING = 0
    OK = 1
    NO_RESPONSE = 2
    NAK = 3
    INVALID = 4


class PpsState(IntEnum):
    NEVER_SEEN = 0
    LOCKED = 1
    LOST = 2


class LidarState(IntEnum):
    NEVER_SEEN = 0
    STREAMING = 1
    LOST = 2


class LidarModeCode(IntEnum):
    UNKNOWN = 0
    OK = 1
    WRONG = 2


@dataclass
class Status:
    """Every field of the 77-byte status message, in byte order."""

    version: int = PROTOCOL_VERSION
    recording: bool = False
    flags: int = 0
    rx_config: int = 0
    pps_state: int = 0
    fix_type: int = 0
    carr_soln: int = 0
    num_sv: int = 0
    h_acc_mm: int = 0xFFFFFFFF  # no NAV-PVT yet
    bytes_written: int = 0
    sd_free_mib: int = 0
    battery_mv: int = 0  # the Pi does not measure the battery
    fw: tuple[int, int, int] = (0, 0, 0)
    dropped_bytes: int = 0
    last_cmd_seq: int = 0
    last_cmd_result: int = Result.NONE
    gps_time_ns: int = 0
    lat_e7: int = 0
    lon_e7: int = 0
    height_mm: int = 0
    # Kit extension (offset 51 on)
    recorder_kind: int = RECORDER_KIND_PI
    lidar_state: int = 0
    lidar_mode: int = 0
    clock_state: int = 0
    precheck_fail: int = 0
    alerts: int = 0
    overrides: int = 0
    lidar_points_per_s: int = 0
    imu_hz: int = 0
    lidar_gap_count: int = 0
    lidar_longest_gap_s: int = 0
    lidar_written_mib: int = 0
    clock_offset_us: int = 0

    @classmethod
    def idle(cls, **overrides) -> Status:
        """A status with every field at its default and the given ones set."""
        names = {f.name for f in fields(cls)}
        unknown = set(overrides) - names
        if unknown:
            raise TypeError(f"unknown status fields: {sorted(unknown)}")
        return cls(**overrides)


_STATUS = struct.Struct("<BBBBBBBBIIIHBBBIBBQiii" + "BBBBBBBBIHHHIi")
assert _STATUS.size == STATUS_LEN


def _u(v: int, bits: int) -> int:
    return max(0, min(int(v), (1 << bits) - 1))


def _i(v: int, bits: int) -> int:
    return max(-(1 << (bits - 1)), min(int(v), (1 << (bits - 1)) - 1))


def encode_status(s: Status) -> bytes:
    """77 bytes; unsigned fields saturate, signed ones clamp."""
    return _STATUS.pack(
        _u(s.version, 8),
        1 if s.recording else 0,
        _u(s.flags, 8),
        _u(s.rx_config, 8),
        _u(s.pps_state, 8),
        _u(s.fix_type, 8),
        _u(s.carr_soln, 8),
        _u(s.num_sv, 8),
        _u(s.h_acc_mm, 32),
        _u(s.bytes_written, 32),
        _u(s.sd_free_mib, 32),
        _u(s.battery_mv, 16),
        _u(s.fw[0], 8),
        _u(s.fw[1], 8),
        _u(s.fw[2], 8),
        _u(s.dropped_bytes, 32),
        _u(s.last_cmd_seq, 8),
        _u(s.last_cmd_result, 8),
        _u(s.gps_time_ns, 64),
        _i(s.lat_e7, 32),
        _i(s.lon_e7, 32),
        _i(s.height_mm, 32),
        _u(s.recorder_kind, 8),
        _u(s.lidar_state, 8),
        _u(s.lidar_mode, 8),
        _u(s.clock_state, 8),
        _u(s.precheck_fail, 8),
        _u(s.alerts, 8),
        _u(s.overrides, 8),
        0,  # reserved
        _u(s.lidar_points_per_s, 32),
        _u(s.imu_hz, 16),
        _u(s.lidar_gap_count, 16),
        _u(s.lidar_longest_gap_s, 16),
        _u(s.lidar_written_mib, 32),
        _i(s.clock_offset_us, 32),
    )


# --- commands ----------------------------------------------------------------

OP_START_SESSION = 0x01
OP_STOP_SESSION = 0x02
OP_MARK_EVENT = 0x03
MARK_TYPES = {0x01: "corner", 0x02: "qr_sync"}


@dataclass(frozen=True)
class StartSession:
    seq: int
    session_id: str
    parcel_id: str
    override_mask: int = 0


@dataclass(frozen=True)
class StopSession:
    seq: int


@dataclass(frozen=True)
class MarkEvent:
    seq: int
    kind: Literal["corner", "qr_sync"]
    payload: str


Command = StartSession | StopSession | MarkEvent


def encode_command(cmd: Command) -> bytes:
    """The phone's side, for fakes and tests. The override byte only when set."""
    if isinstance(cmd, StartSession):
        sid, pid = cmd.session_id.encode(), cmd.parcel_id.encode()
        out = bytes([OP_START_SESSION, cmd.seq, len(sid)]) + sid + bytes([len(pid)]) + pid
        return out + (bytes([cmd.override_mask]) if cmd.override_mask else b"")
    if isinstance(cmd, StopSession):
        return bytes([OP_STOP_SESSION, cmd.seq])
    kind = {v: k for k, v in MARK_TYPES.items()}[cmd.kind]
    payload = cmd.payload.encode()
    return bytes([OP_MARK_EVENT, cmd.seq, kind, len(payload)]) + payload


def valid_session_id(s: str) -> bool:
    return 1 <= len(s) <= MAX_SESSION_ID_LEN and all(
        c.isascii() and (c.isalnum() or c in "_-") for c in s
    )


def valid_parcel_id(s: str) -> bool:
    return 1 <= len(s) <= MAX_PARCEL_ID_LEN and all(0x20 <= ord(c) <= 0x7E for c in s)


def valid_payload(raw: bytes) -> bool:
    return len(raw) <= MAX_PAYLOAD_LEN and all(b >= 0x20 and b != 0x7F for b in raw)


def _read_string(data: bytes, pos: int) -> tuple[bytes, int] | None:
    if pos >= len(data):
        return None
    n = data[pos]
    if pos + 1 + n > len(data):
        return None
    return data[pos + 1 : pos + 1 + n], pos + 1 + n


def decode_command(data: bytes) -> tuple[Command | None, int | None, Result]:
    """(command, seq, result). The command is None unless the result is OK."""
    if len(data) < 2:
        return None, None, Result.MALFORMED
    op, seq = data[0], data[1]

    if op == OP_START_SESSION:
        first = _read_string(data, 2)
        second = _read_string(data, first[1]) if first else None
        if second is None:
            return None, seq, Result.MALFORMED
        (sid_raw, _), (pid_raw, pos) = first, second
        rest = data[pos:]
        if len(rest) > 1:
            return None, seq, Result.MALFORMED
        mask = rest[0] if rest else 0
        sid = sid_raw.decode("ascii", errors="replace")
        pid = pid_raw.decode("ascii", errors="replace")
        if not valid_session_id(sid) or not valid_parcel_id(pid) or mask & ~OVERRIDABLE:
            return None, seq, Result.INVALID_ARGUMENT
        return StartSession(seq, sid, pid, mask), seq, Result.OK

    if op == OP_STOP_SESSION:
        if len(data) != 2:
            return None, seq, Result.MALFORMED
        return StopSession(seq), seq, Result.OK

    if op == OP_MARK_EVENT:
        if len(data) < 3:
            return None, seq, Result.MALFORMED
        read = _read_string(data, 3)
        if read is None or read[1] != len(data):
            return None, seq, Result.MALFORMED
        kind = MARK_TYPES.get(data[2])
        raw = read[0]
        if kind is None or not valid_payload(raw):
            return None, seq, Result.INVALID_ARGUMENT
        try:
            payload = raw.decode("utf-8")
        except UnicodeDecodeError:
            return None, seq, Result.INVALID_ARGUMENT
        return MarkEvent(seq, kind, payload), seq, Result.OK

    return None, seq, Result.UNKNOWN_OPCODE
