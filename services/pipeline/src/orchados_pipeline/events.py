"""Parser for the GNSS logger's events.csv (İP2 format, see docs/arayuzler.md).

Written by the ESP32 logger or the kit recorder (Raspberry Pi); the kit recorder
uses the same columns, `esp_micros` being its monotonic clock.

UTF-8, RFC 4180, with a mandatory header row:

    esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns

gps_time_ns is empty when the logger had no usable PPS mapping. The last two
columns hold the PPS anchor valid when the row was written (empty without one).
When gps_time_ns is empty but the anchor is present, the GPS time is recomputed
with the logger's formula and the event is flagged `gps_time_derived`.
This is the only module that knows the layout, so a format change in İP2 is
handled here.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path

COLUMNS = (
    "esp_micros",
    "gps_time_ns",
    "event_type",
    "payload",
    "pps_esp_micros",
    "pps_gps_time_ns",
)
LEGACY_COLUMNS = COLUMNS[:4]
KNOWN_TYPES = frozenset(
    {
        "session_start",
        "session_stop",
        "corner",
        "qr_sync",
        "pps_lost",
        "pps_regained",
        "sd_error",
        # Kit recorder (Raspberry Pi) only.
        "lidar_lost",
        "lidar_regained",
        "gnss_lost",
        "gnss_regained",
        "precheck_override",
    }
)
# Recompute GPS time from a stale anchor only this far away. The ESP32 crystal
# (±40 ppm) drifts at most ~2.4 ms over 60 s, well below the QR resolution.
MAX_ANCHOR_AGE_S = 60.0


class EventsFormatError(ValueError):
    pass


@dataclass(frozen=True)
class GnssEvent:
    line: int
    esp_micros: int
    gps_time_ns: int | None
    event_type: str
    payload: str
    pps_esp_micros: int | None = None
    pps_gps_time_ns: int | None = None
    # True when gps_time_ns was empty in the file and recomputed from the anchor.
    gps_time_derived: bool = False


def anchor_to_gps_ns(esp_micros: int, pps_esp_micros: int, pps_gps_time_ns: int) -> int:
    """İP2 formula: anchor_gps + (event_micros - anchor_micros) * 1000."""
    return pps_gps_time_ns + (esp_micros - pps_esp_micros) * 1000


def _int_or_none(text: str, column: str, lineno: int) -> int | None:
    if text == "":
        return None
    try:
        return int(text)
    except ValueError:
        raise EventsFormatError(f"line {lineno}: {column} is not an integer: {text!r}") from None


def parse_events(text: str) -> list[GnssEvent]:
    events: list[GnssEvent] = []
    reader = csv.reader(io.StringIO(text))
    header_seen = False
    for lineno, row in enumerate(reader, start=1):
        if not row or not "".join(row).strip():
            continue
        if not header_seen:
            cells = tuple(c.strip() for c in row)
            if cells == LEGACY_COLUMNS:
                raise EventsFormatError(
                    "line 1: legacy 4-column events.csv is not supported; "
                    f"expected header {','.join(COLUMNS)}"
                )
            if cells != COLUMNS:
                raise EventsFormatError(
                    f"line {lineno}: expected header {','.join(COLUMNS)}, got {','.join(cells)}"
                )
            header_seen = True
            continue
        if len(row) != len(COLUMNS):
            raise EventsFormatError(
                f"line {lineno}: expected {len(COLUMNS)} columns, got {len(row)}"
            )
        esp_s, gps_s, event_type, payload, pps_esp_s, pps_gps_s = row
        esp_micros = _int_or_none(esp_s.strip(), "esp_micros", lineno)
        if esp_micros is None:
            raise EventsFormatError(f"line {lineno}: empty esp_micros")
        gps_time_ns = _int_or_none(gps_s.strip(), "gps_time_ns", lineno)
        pps_esp = _int_or_none(pps_esp_s.strip(), "pps_esp_micros", lineno)
        pps_gps = _int_or_none(pps_gps_s.strip(), "pps_gps_time_ns", lineno)
        if (pps_esp is None) != (pps_gps is None):
            raise EventsFormatError(f"line {lineno}: PPS anchor has only one of its two values")
        event_type = event_type.strip()
        if not event_type:
            raise EventsFormatError(f"line {lineno}: empty event_type")
        derived = False
        if (
            gps_time_ns is None
            and pps_esp is not None
            and pps_gps is not None
            and abs(esp_micros - pps_esp) <= MAX_ANCHOR_AGE_S * 1e6
        ):
            gps_time_ns = anchor_to_gps_ns(esp_micros, pps_esp, pps_gps)
            derived = True
        events.append(
            GnssEvent(
                lineno, esp_micros, gps_time_ns, event_type, payload, pps_esp, pps_gps, derived
            )
        )
    if not header_seen:
        raise EventsFormatError(f"missing header row {','.join(COLUMNS)}")
    return events


def read_events(path: Path) -> list[GnssEvent]:
    return parse_events(Path(path).read_text(encoding="utf-8"))


def format_events(
    events: list[tuple[int, int | None, str, str, int | None, int | None]],
) -> str:
    """Write events in the İP2 layout (used by the synthetic session generator)."""
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(COLUMNS)
    for row in events:
        w.writerow(["" if v is None else v for v in row])
    return out.getvalue()
