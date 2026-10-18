"""GPS time helpers.

All pipeline timestamps are GPS time in integer nanoseconds since the GPS epoch
(1980-01-06T00:00:00, no leap seconds). UTC is only used for display.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

GPS_EPOCH = datetime(1980, 1, 6, tzinfo=UTC)
NS_PER_S = 1_000_000_000
SECONDS_PER_WEEK = 604_800

# (first UTC instant the offset applies, GPS - UTC in seconds). Only the entries
# relevant for field data are listed; no leap second has been announced after 2017.
_LEAP_SECONDS = [
    (datetime(2012, 7, 1, tzinfo=UTC), 16),
    (datetime(2015, 7, 1, tzinfo=UTC), 17),
    (datetime(2017, 1, 1, tzinfo=UTC), 18),
]


def leap_seconds_at(utc: datetime) -> int:
    offset = 15
    for start, value in _LEAP_SECONDS:
        if utc >= start:
            offset = value
    return offset


def utc_to_gps_ns(utc: datetime) -> int:
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=UTC)
    delta = utc - GPS_EPOCH
    us = (delta.days * 86_400 + delta.seconds) * 1_000_000 + delta.microseconds
    return us * 1000 + leap_seconds_at(utc) * NS_PER_S


def gps_ns_to_utc(gps_ns: int) -> datetime:
    approx = GPS_EPOCH + timedelta(microseconds=gps_ns // 1000)
    leap = leap_seconds_at(approx - timedelta(seconds=18))
    return GPS_EPOCH + timedelta(microseconds=gps_ns // 1000 - leap * 1_000_000)


def gps_ns_to_iso(gps_ns: int) -> str:
    """UTC ISO-8601 string with millisecond precision."""
    return gps_ns_to_utc(gps_ns).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def week_tow_to_gps_ns(week: int, tow_s: float) -> int:
    return week * SECONDS_PER_WEEK * NS_PER_S + round(tow_s * NS_PER_S)


def gps_ns_to_week_tow(gps_ns: int) -> tuple[int, float]:
    week, rem = divmod(gps_ns, SECONDS_PER_WEEK * NS_PER_S)
    return week, rem / NS_PER_S
