"""GPS time (docs/arayuzler.md, "Zaman").

Every time exchanged between components is GPS time: integer nanoseconds since
the GPS epoch (1980-01-06 00:00:00), without leap seconds. GPS - UTC = 18 s.
"""

from __future__ import annotations

from datetime import UTC, datetime

GPS_EPOCH_UNIX_S = 315_964_800
# GPS - UTC since 2017. If a new leap second is announced, update this (it only
# affects the human-readable UTC strings and the coarse clock feed).
LEAP_SECONDS = 18
_NS = 1_000_000_000


def unix_ns_to_gps_ns(unix_ns: int) -> int:
    return unix_ns - GPS_EPOCH_UNIX_S * _NS + LEAP_SECONDS * _NS


def gps_ns_to_unix_ns(gps_ns: int) -> int:
    return gps_ns + GPS_EPOCH_UNIX_S * _NS - LEAP_SECONDS * _NS


def gps_ns_to_utc_iso(gps_ns: int) -> str:
    """'2026-10-18T09:15:02.500Z': millisecond resolution, rounded down."""
    unix_ms = gps_ns_to_unix_ns(gps_ns) // 1_000_000
    seconds, ms = divmod(unix_ms, 1000)
    dt = datetime.fromtimestamp(seconds, tz=UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + f".{ms:03d}Z"
