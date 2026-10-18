"""u-blox UBX framing and NAV-PVT decoding.

Only what the pipeline needs: walk a raw logger file (gnss.ubx from the ESP32
logger), validate checksums, and decode NAV-PVT into trajectory points. Raw
measurements (RXM-RAWX/SFRBX) are left to RTKLIB.
"""

from __future__ import annotations

import struct
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np

from .gpstime import NS_PER_S, SECONDS_PER_WEEK, gps_ns_to_utc, utc_to_gps_ns

SYNC = b"\xb5\x62"
MAX_PAYLOAD = 8192

CLS_NAV, ID_NAV_PVT = 0x01, 0x07
CLS_RXM, ID_RXM_RAWX, ID_RXM_SFRBX = 0x02, 0x15, 0x13

MESSAGE_NAMES = {
    (CLS_NAV, ID_NAV_PVT): "NAV-PVT",
    (CLS_RXM, ID_RXM_RAWX): "RXM-RAWX",
    (CLS_RXM, ID_RXM_SFRBX): "RXM-SFRBX",
}

_NAV_PVT = struct.Struct("<IHBBBBBBIiBBBBiiiiIIiiiiiIIHH4BihH")
assert _NAV_PVT.size == 92


def checksum(body: bytes) -> bytes:
    """8-bit Fletcher checksum over class, id, length and payload."""
    if len(body) > 64:  # vectorised: b = sum((n - i) * byte_i)
        arr = np.frombuffer(body, dtype=np.uint8).astype(np.int64)
        weights = np.arange(len(arr), 0, -1, dtype=np.int64)
        return bytes((int(arr.sum()) & 0xFF, int((arr * weights).sum()) & 0xFF))
    a = b = 0
    for byte in body:
        a = (a + byte) & 0xFF
        b = (b + a) & 0xFF
    return bytes((a, b))


def build_frame(msg_class: int, msg_id: int, payload: bytes) -> bytes:
    body = struct.pack("<BBH", msg_class, msg_id, len(payload)) + payload
    return SYNC + body + checksum(body)


@dataclass(frozen=True)
class UbxFrame:
    msg_class: int
    msg_id: int
    payload: bytes
    offset: int

    @property
    def name(self) -> str:
        return MESSAGE_NAMES.get(
            (self.msg_class, self.msg_id), f"0x{self.msg_class:02X}-0x{self.msg_id:02X}"
        )


@dataclass
class ScanStats:
    frames: Counter = field(default_factory=Counter)
    bad_checksum: int = 0
    skipped_bytes: int = 0
    truncated_tail: int = 0

    @property
    def total(self) -> int:
        return sum(self.frames.values())


def iter_frames(data: bytes, stats: ScanStats | None = None) -> Iterator[UbxFrame]:
    """Yield valid frames; garbage, NMEA and frames with bad checksums are skipped."""
    stats = stats if stats is not None else ScanStats()
    pos, n = 0, len(data)
    while True:
        start = data.find(SYNC, pos)
        if start < 0:
            stats.skipped_bytes += n - pos
            return
        stats.skipped_bytes += start - pos
        if start + 6 > n:
            stats.truncated_tail += n - start
            return
        length = data[start + 4] | (data[start + 5] << 8)
        end = start + 6 + length + 2
        if length > MAX_PAYLOAD:
            stats.skipped_bytes += 1
            pos = start + 1
            continue
        if end > n:
            stats.truncated_tail += n - start
            return
        body = data[start + 2 : start + 6 + length]
        if checksum(body) != data[end - 2 : end]:
            stats.bad_checksum += 1
            stats.skipped_bytes += 1
            pos = start + 1
            continue
        frame = UbxFrame(data[start + 2], data[start + 3], bytes(body[4:]), start)
        stats.frames[frame.name] += 1
        yield frame
        pos = end


@dataclass(frozen=True)
class NavPvt:
    itow_ms: int
    year: int
    month: int
    day: int
    hour: int
    minute: int
    second: int
    valid: int
    t_acc_ns: int
    nano_ns: int
    fix_type: int
    flags: int
    flags2: int
    num_sv: int
    lon_deg: float
    lat_deg: float
    height_m: float
    hmsl_m: float
    h_acc_m: float
    v_acc_m: float
    vel_n_mps: float
    vel_e_mps: float
    vel_d_mps: float
    ground_speed_mps: float
    head_mot_deg: float
    s_acc_mps: float
    head_acc_deg: float
    pdop: float

    @property
    def gnss_fix_ok(self) -> bool:
        return bool(self.flags & 0x01)

    @property
    def carr_soln(self) -> int:
        """0 none, 1 RTK float, 2 RTK fixed."""
        return (self.flags >> 6) & 0x03

    @property
    def time_valid(self) -> bool:
        return (self.valid & 0x03) == 0x03

    def gps_time_ns(self) -> int:
        """GPS time from iTOW, with the week resolved from the UTC date."""
        utc = datetime(
            self.year,
            self.month,
            self.day,
            self.hour,
            self.minute,
            min(self.second, 59),
            tzinfo=UTC,
        ) + timedelta(microseconds=self.nano_ns / 1000)
        approx_s = utc_to_gps_ns(utc) / NS_PER_S
        week = round((approx_s - self.itow_ms / 1000) / SECONDS_PER_WEEK)
        return week * SECONDS_PER_WEEK * NS_PER_S + self.itow_ms * 1_000_000


def decode_nav_pvt(payload: bytes) -> NavPvt:
    if len(payload) != _NAV_PVT.size:
        raise ValueError(f"NAV-PVT payload must be 92 bytes, got {len(payload)}")
    v = _NAV_PVT.unpack(payload)
    return NavPvt(
        itow_ms=v[0],
        year=v[1],
        month=v[2],
        day=v[3],
        hour=v[4],
        minute=v[5],
        second=v[6],
        valid=v[7],
        t_acc_ns=v[8],
        nano_ns=v[9],
        fix_type=v[10],
        flags=v[11],
        flags2=v[12],
        num_sv=v[13],
        lon_deg=v[14] * 1e-7,
        lat_deg=v[15] * 1e-7,
        height_m=v[16] / 1000,
        hmsl_m=v[17] / 1000,
        h_acc_m=v[18] / 1000,
        v_acc_m=v[19] / 1000,
        vel_n_mps=v[20] / 1000,
        vel_e_mps=v[21] / 1000,
        vel_d_mps=v[22] / 1000,
        ground_speed_mps=v[23] / 1000,
        head_mot_deg=v[24] * 1e-5,
        s_acc_mps=v[25] / 1000,
        head_acc_deg=v[26] * 1e-5,
        pdop=v[27] * 0.01,
    )


def encode_nav_pvt(
    *,
    gps_time_ns: int,
    lat_deg: float,
    lon_deg: float,
    height_m: float,
    h_acc_m: float = 0.02,
    v_acc_m: float = 0.03,
    fix_type: int = 3,
    carr_soln: int = 2,
    num_sv: int = 18,
    vel_ned_mps: tuple[float, float, float] = (0.0, 0.0, 0.0),
    head_mot_deg: float = 0.0,
    undulation_m: float = 36.0,
) -> bytes:
    """Build a NAV-PVT payload (used to make synthetic logs and test vectors)."""
    utc = gps_ns_to_utc(gps_time_ns)
    whole = utc.replace(microsecond=0)
    nano = utc.microsecond * 1000
    itow_ms = (gps_time_ns // 1_000_000) % (SECONDS_PER_WEEK * 1000)
    flags = 0x01 | ((carr_soln & 0x03) << 6) | (0x02 if carr_soln else 0)
    vn, ve, vd = vel_ned_mps
    gspeed = (vn * vn + ve * ve) ** 0.5
    return _NAV_PVT.pack(
        itow_ms,
        whole.year,
        whole.month,
        whole.day,
        whole.hour,
        whole.minute,
        whole.second,
        0x07,
        20,
        nano,
        fix_type,
        flags,
        0xE0,
        num_sv,
        round(lon_deg * 1e7),
        round(lat_deg * 1e7),
        round(height_m * 1000),
        round((height_m - undulation_m) * 1000),
        round(h_acc_m * 1000),
        round(v_acc_m * 1000),
        round(vn * 1000),
        round(ve * 1000),
        round(vd * 1000),
        round(gspeed * 1000),
        round((head_mot_deg % 360) * 1e5),
        50,
        round(0.5 * 1e5),
        120,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    )
