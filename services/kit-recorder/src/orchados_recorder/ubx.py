"""u-blox UBX framing, NAV-PVT and CFG-VALSET.

Mirrors firmware/gnss-logger/lib/gnss_core/src/{ubx,nav_pvt,cfg_valset}.cpp; the
tests reuse the firmware's vectors.
"""

from __future__ import annotations

import calendar
import struct
from dataclasses import dataclass

from .gpstime import GPS_EPOCH_UNIX_S, LEAP_SECONDS

SYNC = b"\xb5\x62"
HEADER_LEN = 6
OVERHEAD = 8
# Longest payload accepted; anything longer is a corrupt length field.
MAX_PLAUSIBLE_PAYLOAD = 8192

CLASS_NAV = 0x01
CLASS_RXM = 0x02
CLASS_ACK = 0x05
CLASS_CFG = 0x06
ID_NAV_PVT = 0x07
ID_RXM_RAWX = 0x15
ID_RXM_SFRBX = 0x13
ID_ACK_NAK = 0x00
ID_ACK_ACK = 0x01
ID_CFG_VALSET = 0x8A

LAYER_RAM = 0x01
NAV_PVT_LEN = 92
_WEEK_S = 604_800


def checksum(data: bytes) -> tuple[int, int]:
    """8-bit Fletcher over class, id, length and payload."""
    a = b = 0
    for byte in data:
        a = (a + byte) & 0xFF
        b = (b + a) & 0xFF
    return a, b


def frame(cls: int, msg_id: int, payload: bytes) -> bytes:
    body = bytes([cls, msg_id]) + len(payload).to_bytes(2, "little") + payload
    return SYNC + body + bytes(checksum(body))


@dataclass(frozen=True)
class UbxMessage:
    cls: int
    msg_id: int
    payload: bytes


class Framer:
    """Splits a raw UBX byte stream into messages.

    Aligns on the sync bytes, drops frames with a bad checksum or an implausible
    length and resumes the search one byte after the false sync.
    """

    def __init__(self) -> None:
        self._buf = bytearray()
        self.checksum_errors = 0

    def reset(self) -> None:
        self._buf.clear()

    def feed(self, data: bytes) -> list[UbxMessage]:
        self._buf += data
        out: list[UbxMessage] = []
        buf = self._buf
        while True:
            start = buf.find(SYNC)
            if start < 0:
                # Keep a trailing first sync byte: the next feed may complete it.
                keep = 1 if buf.endswith(SYNC[:1]) else 0
                del buf[: len(buf) - keep]
                break
            if start:
                del buf[:start]
            if len(buf) < HEADER_LEN:
                break
            length = int.from_bytes(buf[4:6], "little")
            if length > MAX_PLAUSIBLE_PAYLOAD:
                del buf[:1]
                continue
            total = OVERHEAD + length
            if len(buf) < total:
                break
            if bytes(buf[total - 2 : total]) != bytes(checksum(buf[2 : total - 2])):
                self.checksum_errors += 1
                del buf[:1]
                continue
            out.append(UbxMessage(buf[2], buf[3], bytes(buf[HEADER_LEN : total - 2])))
            del buf[:total]
        return out


def is_ack(msg: UbxMessage, cls: int, msg_id: int) -> bool | None:
    """True for ACK-ACK of (cls, msg_id), False for ACK-NAK, None otherwise."""
    if msg.cls != CLASS_ACK or msg.msg_id not in (ID_ACK_ACK, ID_ACK_NAK):
        return None
    if len(msg.payload) < 2 or msg.payload[0] != cls or msg.payload[1] != msg_id:
        return None
    return msg.msg_id == ID_ACK_ACK


def cfg_valset_ram(items: list[tuple[int, int, int]]) -> bytes:
    """UBX-CFG-VALSET to the RAM layer; items are (key, value, value size in bytes)."""
    payload = bytearray([0x00, LAYER_RAM, 0x00, 0x00])  # version 0, layer, reserved
    for key, value, size in items:
        payload += key.to_bytes(4, "little") + value.to_bytes(size, "little")
    return frame(CLASS_CFG, ID_CFG_VALSET, bytes(payload))


# iTOW, year, month, day, hour, min, sec, valid, tAcc, nano, fixType, flags, flags2,
# numSV, lon, lat, height, hMSL, hAcc, vAcc, velN, velE, velD, gSpeed, headMot, sAcc,
# headAcc, pDOP, flags3, reserved(5), headVeh, magDec, magAcc
_NAV_PVT = struct.Struct("<IHBBBBBBIiBBBBiiiiIIiiiiiIIHB5siHH")
assert _NAV_PVT.size == NAV_PVT_LEN


@dataclass(frozen=True)
class NavPvt:
    """The UBX-NAV-PVT fields the recorder uses (u-blox F9P interface description)."""

    i_tow_ms: int = 0
    year: int = 0
    month: int = 0
    day: int = 0
    hour: int = 0
    minute: int = 0
    second: int = 0
    valid: int = 0
    t_acc_ns: int = 0
    nano: int = 0
    fix_type: int = 0
    flags: int = 0
    num_sv: int = 0
    lon_e7: int = 0
    lat_e7: int = 0
    height_mm: int = 0
    h_acc_mm: int = 0
    flags3: int = 0

    @property
    def gnss_fix_ok(self) -> bool:
        return bool(self.flags & 0x01)

    @property
    def carr_soln(self) -> int:
        """0 none, 1 float, 2 fixed."""
        return (self.flags >> 6) & 0x3

    @property
    def invalid_llh(self) -> bool:
        return bool(self.flags3 & 0x01)

    @property
    def time_resolved(self) -> bool:
        """validDate, validTime and fullyResolved."""
        return self.valid & 0x07 == 0x07

    @property
    def position_valid(self) -> bool:
        return self.gnss_fix_ok and 2 <= self.fix_type <= 4 and not self.invalid_llh

    def gps_time_ns(self) -> int | None:
        """GPS time of the solution's epoch (iTOW), the week taken from the UTC date.

        Same reconciliation as the firmware: the week is derived from the UTC date
        and the fixed leap seconds, then corrected so that iTOW decides near a week
        boundary.
        """
        if not self.time_resolved:
            return None
        unix_s = calendar.timegm(
            (self.year, self.month, self.day, self.hour, self.minute, self.second, 0, 0, 0)
        )
        gps_s = unix_s - GPS_EPOCH_UNIX_S + LEAP_SECONDS
        week = gps_s // _WEEK_S
        diff = week * _WEEK_S + self.i_tow_ms // 1000 - gps_s
        if diff > _WEEK_S // 2:
            week -= 1
        if diff < -_WEEK_S // 2:
            week += 1
        return (week * _WEEK_S * 1000 + self.i_tow_ms) * 1_000_000

    def utc_unix_ns(self) -> int | None:
        """UTC of the solution as Unix ns (date, time and the signed nano fraction)."""
        if not self.time_resolved:
            return None
        unix_s = calendar.timegm(
            (self.year, self.month, self.day, self.hour, self.minute, self.second, 0, 0, 0)
        )
        return unix_s * 1_000_000_000 + self.nano


def parse_nav_pvt(payload: bytes) -> NavPvt:
    if len(payload) != NAV_PVT_LEN:
        raise ValueError(f"NAV-PVT payload is {len(payload)} bytes, expected {NAV_PVT_LEN}")
    f = _NAV_PVT.unpack(payload)
    return NavPvt(
        i_tow_ms=f[0],
        year=f[1],
        month=f[2],
        day=f[3],
        hour=f[4],
        minute=f[5],
        second=f[6],
        valid=f[7],
        t_acc_ns=f[8],
        nano=f[9],
        fix_type=f[10],
        flags=f[11],
        num_sv=f[13],
        lon_e7=f[14],
        lat_e7=f[15],
        height_mm=f[16],
        h_acc_mm=f[18],
        flags3=f[28],
    )


def build_nav_pvt(p: NavPvt) -> bytes:
    """Inverse of parse_nav_pvt (unused fields zero); for fakes and tests."""
    return _NAV_PVT.pack(
        p.i_tow_ms, p.year, p.month, p.day, p.hour, p.minute, p.second, p.valid,
        p.t_acc_ns, p.nano, p.fix_type, p.flags, 0, p.num_sv,
        p.lon_e7, p.lat_e7, p.height_mm, p.height_mm, p.h_acc_mm, 0,
        0, 0, 0, 0, 0, 0, 0, 0, p.flags3, bytes(5), 0, 0, 0,
    )  # fmt: skip
