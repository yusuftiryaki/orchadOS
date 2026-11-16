"""The Pi's clock: PPS, chrony and the PPS anchor.

chrony disciplines the system clock with the receiver's PPS (refid PPS, locked
to the coarse GNSS time this service feeds through a SOCK refclock, refid GNSS).
The recorder only reads the state:

- `/sys/class/pps/pps0/assert`: Unix time of the last PPS edge and its sequence
- `chronyc -c tracking`: selected reference and the system clock's offset

docs/arayuzler.md, "Kit kaydedicisi" -> "Saat".
"""

from __future__ import annotations

import struct
import subprocess
import time
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from .gpstime import unix_ns_to_gps_ns
from .session import Anchor
from .thresholds import CLOCK_MAX_OFFSET_US, PPS_LOST_S

PPS_ASSERT_PATH = Path("/sys/class/pps/pps0/assert")
CHRONY_SOCK_MAGIC = 0x534F434B  # "SOCK"
_NS = 1_000_000_000


def parse_pps_assert(text: str) -> tuple[int, int] | None:
    """'1700000000.123456789#1234' -> (unix_ns, seq); None before the first edge."""
    text = text.strip()
    try:
        stamp, seq = text.split("#", 1)
        sec, _, frac = stamp.partition(".")
        unix_ns = int(sec) * _NS + int((frac + "000000000")[:9])
        seq_n = int(seq)
    except ValueError:
        return None
    if unix_ns == 0:
        return None
    return unix_ns, seq_n


@dataclass(frozen=True)
class Tracking:
    ref_name: str
    offset_us: int
    leap_ok: bool


def parse_chronyc_tracking(csv_line: str) -> Tracking:
    """`chronyc -c tracking`: field 1 reference name, field 4 the system clock's
    offset in seconds, the last field the leap status."""
    fields = csv_line.strip().split(",")
    if len(fields) < 14:
        raise ValueError(f"chronyc tracking: expected 14 fields, got {len(fields)}")
    return Tracking(
        ref_name=fields[1],
        offset_us=round(float(fields[4]) * 1_000_000),
        leap_ok=fields[-1].strip() != "Not synchronised",
    )


class ClockState(StrEnum):
    UNLOCKED = "unlocked"
    COARSE = "coarse"  # only the receiver's USB time (tens of ms)
    PPS = "pps"

    @property
    def code(self) -> int:
        """Status byte 54."""
        return {"unlocked": 0, "coarse": 1, "pps": 2}[self.value]


def classify_clock(tracking: Tracking | None, pps_age_s: float | None) -> ClockState:
    if tracking is None or not tracking.leap_ok:
        return ClockState.UNLOCKED
    if (
        tracking.ref_name == "PPS"
        and abs(tracking.offset_us) <= CLOCK_MAX_OFFSET_US
        and pps_age_s is not None
        and pps_age_s < PPS_LOST_S
    ):
        return ClockState.PPS
    if tracking.ref_name == "GNSS":
        return ClockState.COARSE
    return ClockState.UNLOCKED


def pps_anchor(assert_unix_ns: int, now_unix_ns: int, now_mono_us: int) -> Anchor:
    """The edge in monotonic time, paired with the GPS time of its full second.

    With the clock locked the edge falls on a full second; it is rounded to the
    nearest one to drop the interrupt latency.
    """
    mono_us = now_mono_us - (now_unix_ns - assert_unix_ns) // 1000
    second_ns = (assert_unix_ns + _NS // 2) // _NS * _NS
    return Anchor(mono_us, unix_ns_to_gps_ns(second_ns))


def chrony_sock_sample(unix_ns: int, offset_s: float) -> bytes:
    """chrony's SOCK refclock sample (struct sock_sample, 64-bit Linux).

    `unix_ns` is the local system time of the sample, `offset_s` the true time
    minus that local time.
    """
    sec, rem = divmod(unix_ns, _NS)
    return struct.pack("<qqdiiii", sec, rem // 1000, offset_s, 0, 0, 0, CHRONY_SOCK_MAGIC)


class SystemClock:
    """The real clock: CLOCK_MONOTONIC, the system time, PPS sysfs and chronyc."""

    def __init__(self, pps_path: Path = PPS_ASSERT_PATH, chronyc: str = "chronyc") -> None:
        self.pps_path = pps_path
        self.chronyc = chronyc

    def now_mono_us(self) -> int:
        return time.monotonic_ns() // 1000

    def now_unix_ns(self) -> int:
        return time.time_ns()

    def pps_assert(self) -> tuple[int, int] | None:
        try:
            return parse_pps_assert(self.pps_path.read_text())
        except OSError:
            return None

    def tracking(self) -> Tracking | None:
        try:
            out = subprocess.run(
                [self.chronyc, "-c", "tracking"],
                capture_output=True,
                text=True,
                timeout=2,
                check=True,
            ).stdout
            return parse_chronyc_tracking(out.splitlines()[0])
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            return None


class FakeClock:
    """Test clock: monotonic and Unix time advance together; PPS on full seconds."""

    def __init__(
        self,
        mono_us: int = 10_000_000,
        unix_ns: int = 1_792_314_900_000_000_000,  # 2026-10-18T09:15:00Z
        tracking: Tracking | None = None,
        pps_enabled: bool = True,
    ) -> None:
        self.mono_us = mono_us
        self.unix_ns = unix_ns
        self.tracking_value = tracking if tracking is not None else Tracking("PPS", 5, True)
        self.pps_enabled = pps_enabled
        self._last_edge: int | None = None
        self._seq = 0

    def advance_us(self, us: int) -> None:
        self.mono_us += us
        self.unix_ns += us * 1000

    def now_mono_us(self) -> int:
        return self.mono_us

    def now_unix_ns(self) -> int:
        return self.unix_ns

    def pps_assert(self) -> tuple[int, int] | None:
        if self.pps_enabled:
            edge = self.unix_ns // _NS * _NS
            if edge != self._last_edge:
                self._last_edge = edge
                self._seq += 1
        if self._last_edge is None:
            return None
        return self._last_edge, self._seq

    def tracking(self) -> Tracking | None:
        return self.tracking_value
