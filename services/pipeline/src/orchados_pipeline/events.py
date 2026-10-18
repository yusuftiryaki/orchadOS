"""Parser for the GNSS logger's events.csv (İP2 format).

Columns: esp_micros, gps_time_ns, event_type, payload. gps_time_ns is empty
when the logger had no PPS lock. A header row and '#' comment lines are allowed;
payload may be quoted and contain commas. This is the only module that knows the
layout, so a format change in İP2 is handled here.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path

COLUMNS = ("esp_micros", "gps_time_ns", "event_type", "payload")
KNOWN_TYPES = frozenset(
    {"session_start", "session_stop", "corner", "qr_sync", "pps_lost", "pps_regained", "sd_error"}
)


class EventsFormatError(ValueError):
    pass


@dataclass(frozen=True)
class GnssEvent:
    line: int
    esp_micros: int
    gps_time_ns: int | None
    event_type: str
    payload: str


def parse_events(text: str) -> list[GnssEvent]:
    events: list[GnssEvent] = []
    reader = csv.reader(io.StringIO(text), skipinitialspace=True)
    for lineno, row in enumerate(reader, start=1):
        if not row or not "".join(row).strip() or row[0].lstrip().startswith("#"):
            continue
        cells = [c.strip() for c in row]
        if cells[0] == COLUMNS[0]:
            if tuple(cells[: len(COLUMNS)]) != COLUMNS[: len(cells)]:
                raise EventsFormatError(f"line {lineno}: unexpected header {cells}")
            continue
        if len(cells) < 3:
            raise EventsFormatError(f"line {lineno}: expected 4 columns, got {len(cells)}")
        if len(cells) > 4:  # unquoted commas in the payload
            cells = cells[:3] + [",".join(cells[3:])]
        try:
            esp_micros = int(cells[0])
            gps_time_ns = int(cells[1]) if cells[1] else None
        except ValueError as exc:
            raise EventsFormatError(f"line {lineno}: {exc}") from None
        event_type = cells[2]
        if not event_type:
            raise EventsFormatError(f"line {lineno}: empty event_type")
        payload = cells[3] if len(cells) > 3 else ""
        events.append(GnssEvent(lineno, esp_micros, gps_time_ns, event_type, payload))
    return events


def read_events(path: Path) -> list[GnssEvent]:
    return parse_events(Path(path).read_text(encoding="utf-8"))


def format_events(events: list[tuple[int, int | None, str, str]]) -> str:
    """Write events in the İP2 layout (used by the synthetic session generator)."""
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(COLUMNS)
    for esp_micros, gps_ns, kind, payload in events:
        w.writerow([esp_micros, "" if gps_ns is None else gps_ns, kind, payload])
    return out.getvalue()
