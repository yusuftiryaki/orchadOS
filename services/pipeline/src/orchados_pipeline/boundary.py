"""Boundary stage: the session's corners as a boundary version (docs/arayuzler.md,
"Sınır köşeleri ve kapsama").

The field app records the boundary walk as session events in the database:
`corner` (one per press, with the logger's last status position) and
`boundary_corners` (the crew's list after an edit). The newest list counts;
corners marked after it are appended, listed-out corners marked before it are
deleted; without a list the corners are taken in the order they were marked.

Each corner is positioned at its GPS time:

1. `ppk`: the PPK trajectory (trajectory.json, ppk_status = ppk) when its
   solution is fixed at that time; the uncertainty is the trajectory's.
2. `phone`: otherwise the position the phone stored with the event (the
   logger's real-time solution from the BLE status message);
3. `logger`: otherwise the logger's own NAV-PVT solution in gnss.ubx at the
   time of the matching `corner` row in events.csv.

Fallback positions get at least `boundary.fallback_min_uncertainty_m` and are
flagged in the report. The corners in walking order make the polygon; fewer
than three corners or a self-intersecting ring is an error. The result goes to
boundary.json in the run directory and, through add_field_survey_boundary()
with the ops user's token (no service key), to public.boundary as the next
version, source field_survey. The same corners again open no new version.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

import numpy as np
from pydantic import Field

from .context import RunContext
from .events import read_events
from .geo import LocalFrame
from .gpstime import gps_ns_to_iso
from .ingest import EVENTS_PATH, UBX_PATH
from .models import Model, PpkStatus, Producer, SolutionQuality, Trajectory, read_model, write_model
from .params import BoundaryParams
from .position import PositionError, TrajectoryInterpolator, trajectory_from_nav_pvt

EVENT_TYPES = ("corner", "boundary_corners")
DONUM_M2 = 1000.0


class BoundaryError(RuntimeError):
    pass


# --- models ------------------------------------------------------------------------


class BoundaryCorner(Model):
    event_id: str
    corner_no: int | None
    gps_time_ns: int
    # Where the corner time came from: the event (gps / phone clock) or the logger row.
    time_source: Literal["gps", "phone", "logger"]
    source: Literal["ppk", "phone", "logger"]
    lat: float
    lon: float
    height_m: float | None
    uncertainty_m: float
    quality: str | None = None
    # True for phone / logger positions (not post-processed, uncertainty raised).
    flagged: bool
    note: str | None = None
    markers: list[str] = Field(default_factory=list)


class BoundaryRecord(Model):
    boundary_id: str
    version: int
    created: bool
    area_m2: float | None


class BoundarySurvey(Model):
    producer: Producer
    session_id: str
    parcel_id: str
    trajectory_ppk_status: PpkStatus | None
    list_event_id: str | None  # the boundary_corners event used; None = marking order
    corners: list[BoundaryCorner]
    area_m2: float  # local plane
    area_donum: float
    vertex_uncertainty_m: float
    surveyed_at: str  # UTC, ISO 8601: time of the last corner
    warnings: list[str] = Field(default_factory=list)
    record: BoundaryRecord | None = None

    def ring(self) -> list[list[float]]:
        """[lon, lat] pairs in walking order (open ring)."""
        return [[c.lon, c.lat] for c in self.corners]

    def lines(self) -> list[str]:
        out = [
            f"boundary: {len(self.corners)} corners, {self.area_m2:.1f} m2 "
            f"({self.area_donum:.2f} donum), vertex uncertainty {self.vertex_uncertainty_m:.2f} m",
        ]
        for c in self.corners:
            flag = "  [flagged: not PPK]" if c.flagged else ""
            out.append(
                f"  corner {c.corner_no}: {c.source}, {c.uncertainty_m:.2f} m "
                f"({c.lat:.8f}, {c.lon:.8f}){flag}"
            )
        if self.record is not None:
            r = self.record
            what = "created" if r.created else "unchanged, existing"
            out.append(f"boundary version {r.version} {what} ({r.boundary_id})")
        out.extend(f"warning: {w}" for w in self.warnings)
        return out


# --- corner list ---------------------------------------------------------------------


@dataclass(frozen=True)
class SessionEvent:
    id: str
    event_type: str
    payload: str
    gps_time_ns: int
    time_source: str
    phone_time: datetime
    data: dict[str, Any] | None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> SessionEvent:
        return cls(
            id=str(row["id"]),
            event_type=row["event_type"],
            payload=row.get("payload") or "",
            gps_time_ns=int(row["gps_time_ns"]),
            time_source=row["time_source"],
            phone_time=datetime.fromisoformat(str(row["phone_time"]).replace("Z", "+00:00")),
            data=row.get("data"),
        )

    def key(self) -> tuple[int, datetime, str]:
        return (self.gps_time_ns, self.phone_time, self.id)

    @property
    def corner_no(self) -> int | None:
        no = (self.data or {}).get("corner_no")
        if isinstance(no, int):
            return no
        try:
            return int(self.payload)
        except ValueError:
            return None


@dataclass
class ListedCorner:
    event: SessionEvent
    note: str | None = None
    markers: list[str] = field(default_factory=list)


def read_session_events(client, session_id: str) -> list[SessionEvent]:
    rows = client.select(
        "session_event",
        {
            "session_id": f"eq.{session_id}",
            "event_type": f"in.({','.join(EVENT_TYPES)})",
            "select": "id,event_type,payload,gps_time_ns,time_source,phone_time,data",
        },
    )
    return [SessionEvent.from_row(r) for r in rows]


def corner_list(events: list[SessionEvent]) -> tuple[list[ListedCorner], SessionEvent | None]:
    """The session's corners in walking order and the boundary_corners event used."""
    corners = sorted((e for e in events if e.event_type == "corner"), key=SessionEvent.key)
    lists = [e for e in events if e.event_type == "boundary_corners"]
    if not lists:
        return [ListedCorner(c) for c in corners], None
    latest = max(lists, key=SessionEvent.key)
    by_id = {c.id: c for c in corners}
    items = (latest.data or {}).get("corners")
    if not isinstance(items, list):
        raise BoundaryError(f"boundary_corners event {latest.id} has no corner list")
    out: list[ListedCorner] = []
    for item in items:
        event = by_id.get(str(item.get("event_id")))
        if event is None:
            raise BoundaryError(
                f"boundary_corners event {latest.id} lists corner event "
                f"{item.get('event_id')}, which is not in the database"
            )
        out.append(ListedCorner(event, item.get("note"), list(item.get("markers") or [])))
    listed = {c.event.id for c in out}
    out += [ListedCorner(c) for c in corners if c.key() > latest.key() and c.id not in listed]
    return out, latest


# --- positions -------------------------------------------------------------------------


def _logger_corner_times(ctx: RunContext) -> list[tuple[str, int]]:
    """(payload, GPS time) of the logger's corner rows in events.csv."""
    path = ctx.session_dir / EVENTS_PATH
    if not path.is_file():
        return []
    return [
        (e.payload, e.gps_time_ns)
        for e in read_events(path)
        if e.event_type == "corner" and e.gps_time_ns is not None
    ]


def _match_logger_row(
    rows: list[tuple[str, int]], corner: SessionEvent, max_dt_ns: int
) -> int | None:
    """GPS time of the logger corner row with the same number closest to the event."""
    best = None
    for payload, t in rows:
        if payload.strip() != str(corner.corner_no):
            continue
        dt = abs(t - corner.gps_time_ns)
        if dt <= max_dt_ns and (best is None or dt < best[0]):
            best = (dt, t)
    return None if best is None else best[1]


class _NavPvtIndex:
    """The logger's NAV-PVT solutions, nearest epoch to a time."""

    def __init__(self, points):
        self.points = points
        self.t = np.array([p.gps_time_ns for p in points], dtype=np.int64)

    def nearest(self, t_ns: int, max_dt_ns: int):
        if not len(self.t):
            return None
        i = int(np.searchsorted(self.t, t_ns))
        cands = [j for j in (i - 1, i) if 0 <= j < len(self.t)]
        j = min(cands, key=lambda j: abs(int(self.t[j]) - t_ns))
        return self.points[j] if abs(int(self.t[j]) - t_ns) <= max_dt_ns else None


def _ppk(ctx: RunContext, warnings: list[str]) -> tuple[TrajectoryInterpolator | None, Any]:
    if not ctx.trajectory_path.is_file():
        warnings.append("no trajectory.json (run the position stage): corners not post-processed")
        return None, None
    traj = read_model(Trajectory, ctx.trajectory_path)
    if traj.ppk_status != PpkStatus.ppk:
        warnings.append(
            f"trajectory is not PPK ({traj.ppk_status.value}): "
            "corners use phone or logger positions"
        )
        return None, traj.ppk_status
    try:
        return TrajectoryInterpolator(
            traj, ctx.params.boundary.trajectory_max_gap_s
        ), traj.ppk_status
    except PositionError as exc:
        warnings.append(f"PPK trajectory unusable: {exc}")
        return None, traj.ppk_status


def _position(
    corner: ListedCorner,
    ppk: TrajectoryInterpolator | None,
    logger_rows: list[tuple[str, int]],
    nav: _NavPvtIndex | None,
    p: BoundaryParams,
    warnings: list[str],
) -> BoundaryCorner:
    ev = corner.event
    max_dt = int(p.logger_match_max_dt_s * 1e9)
    logger_t = _match_logger_row(logger_rows, ev, max_dt)
    if ev.time_source == "phone" and logger_t is not None:
        t, time_source = logger_t, "logger"
    else:
        t, time_source = ev.gps_time_ns, ev.time_source
    common = {
        "event_id": ev.id,
        "corner_no": ev.corner_no,
        "gps_time_ns": t,
        "time_source": time_source,
        "note": corner.note,
        "markers": corner.markers,
    }
    label = f"corner {ev.corner_no} ({ev.id})"

    sample = ppk.sample(t) if ppk is not None else None
    if sample is not None and sample["quality"] == SolutionQuality.fix:
        return BoundaryCorner(
            **common,
            source="ppk",
            lat=sample["lat"],
            lon=sample["lon"],
            height_m=sample["height_m"],
            uncertainty_m=float(sample["sd_h_m"]),
            quality=SolutionQuality.fix.value,
            flagged=False,
        )
    if ppk is not None:
        why = "outside the trajectory" if sample is None else f"{sample['quality'].value}"
        warnings.append(f"{label}: PPK not fixed at its time ({why})")

    floor = p.fallback_min_uncertainty_m
    pos = (ev.data or {}).get("position")
    if isinstance(pos, dict) and pos.get("lat") is not None and pos.get("lon") is not None:
        h_acc = pos.get("h_acc_m")
        return BoundaryCorner(
            **common,
            source="phone",
            lat=float(pos["lat"]),
            lon=float(pos["lon"]),
            height_m=pos.get("height_m"),
            uncertainty_m=max(floor, float(h_acc) if h_acc is not None else floor),
            quality=pos.get("carr_soln"),
            flagged=True,
        )

    if logger_t is None:
        warnings.append(f"{label}: no matching corner row in events.csv")
    pvt = nav.nearest(logger_t, int(p.logger_nav_pvt_max_dt_s * 1e9)) if nav and logger_t else None
    if pvt is not None:
        return BoundaryCorner(
            **{**common, "gps_time_ns": logger_t},
            source="logger",
            lat=pvt.lat,
            lon=pvt.lon,
            height_m=pvt.height_m,
            uncertainty_m=max(floor, math.hypot(pvt.sd_n_m, pvt.sd_e_m)),
            quality=pvt.quality.value,
            flagged=True,
        )
    raise BoundaryError(f"{label} has no position: no fixed PPK, no phone position, no logger fix")


# --- polygon -----------------------------------------------------------------------------


def _cross(o, a, b) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _segments_intersect(p1, p2, q1, q2) -> bool:
    """Closed segments p1-p2 and q1-q2 share a point (touching counts)."""
    d1, d2 = _cross(q1, q2, p1), _cross(q1, q2, p2)
    d3, d4 = _cross(p1, p2, q1), _cross(p1, p2, q2)
    if d1 * d2 < 0 and d3 * d4 < 0:
        return True

    def on(a, b, c, d) -> bool:
        return (
            d == 0
            and min(a[0], b[0]) <= c[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])
        )

    return on(q1, q2, p1, d1) or on(q1, q2, p2, d2) or on(p1, p2, q1, d3) or on(p1, p2, q2, d4)


def check_polygon(en: list[tuple[float, float]]) -> float:
    """Area (m2) of the ring in walking order; BoundaryError when it is not a polygon."""
    n = len(en)
    if n < 3:
        raise BoundaryError(f"{n} corners: a boundary needs at least three")
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue  # neighbouring edges share a corner
            if _segments_intersect(en[i], en[(i + 1) % n], en[j], en[(j + 1) % n]):
                raise BoundaryError(
                    f"self-intersecting boundary: edge {i + 1}-{(i + 1) % n + 1} "
                    f"crosses edge {j + 1}-{(j + 1) % n + 1}"
                )
    area = 0.5 * abs(
        sum(en[i][0] * en[(i + 1) % n][1] - en[(i + 1) % n][0] * en[i][1] for i in range(n))
    )
    if area == 0:
        raise BoundaryError("boundary has no area (all corners on a line)")
    return area


# --- stage -------------------------------------------------------------------------------


def survey(
    ctx: RunContext, session_id: str, parcel_id: str, events: list[SessionEvent]
) -> BoundarySurvey:
    """Position the corners and build the polygon (no database access)."""
    p = ctx.params.boundary
    warnings: list[str] = []
    listed, latest = corner_list(events)
    if len(listed) < 3:
        raise BoundaryError(f"{len(listed)} corners in session {session_id}: need at least three")
    ppk, ppk_status = _ppk(ctx, warnings)
    logger_rows = _logger_corner_times(ctx)
    ubx = ctx.session_dir / UBX_PATH
    nav = _NavPvtIndex(trajectory_from_nav_pvt(ubx.read_bytes())) if ubx.is_file() else None
    corners = [_position(c, ppk, logger_rows, nav, p, warnings) for c in listed]
    for c in corners:
        c.lat, c.lon = round(c.lat, 9), round(c.lon, 9)
        c.uncertainty_m = round(c.uncertainty_m, 3)

    frame = LocalFrame(corners[0].lat, corners[0].lon)
    e, n = frame.to_en([c.lat for c in corners], [c.lon for c in corners])
    area = check_polygon([(float(a), float(b)) for a, b in zip(e, n, strict=True)])
    flagged = sum(c.flagged for c in corners)
    if flagged:
        warnings.append(
            f"{flagged} of {len(corners)} corners are not PPK (phone or logger position, "
            f"uncertainty at least {p.fallback_min_uncertainty_m} m)"
        )
    last = max(c.gps_time_ns for c in corners)
    return BoundarySurvey(
        producer=ctx.producer("boundary"),
        session_id=session_id,
        parcel_id=parcel_id,
        trajectory_ppk_status=ppk_status,
        list_event_id=latest.id if latest else None,
        corners=corners,
        area_m2=round(area, 2),
        area_donum=round(area / DONUM_M2, 3),
        vertex_uncertainty_m=max(c.uncertainty_m for c in corners),
        surveyed_at=gps_ns_to_iso(last),
        warnings=warnings,
    )


def record(client, s: BoundarySurvey) -> BoundaryRecord:
    """The survey as the next boundary version (idempotent; ops token)."""
    res = client.rpc(
        "add_field_survey_boundary",
        {
            "p_session_id": s.session_id,
            "p_ring": s.ring(),
            "p_vertex_uncertainty_m": s.vertex_uncertainty_m,
            "p_surveyed_at": s.surveyed_at,
        },
    )
    return BoundaryRecord(
        boundary_id=str(res["id"]),
        version=int(res["version"]),
        created=bool(res["created"]),
        area_m2=res.get("area_m2"),
    )


def run(
    ctx: RunContext, client, session_id: str, parcel_id: str, write_db: bool = True
) -> BoundarySurvey:
    rows = client.select("session", {"id": f"eq.{session_id}", "select": "id,parcel_id"})
    if not rows:
        raise BoundaryError(f"session {session_id} not found or not visible to this user")
    if str(rows[0]["parcel_id"]) != parcel_id:
        raise BoundaryError(
            f"session {session_id} is on parcel {rows[0]['parcel_id']}, "
            f"session.json says {parcel_id}"
        )
    s = survey(ctx, session_id, parcel_id, read_session_events(client, session_id))
    if write_db:
        s.record = record(client, s)
    write_model(s, ctx.boundary_path)
    return s


__all__ = [
    "BoundaryCorner",
    "BoundaryError",
    "BoundaryRecord",
    "BoundarySurvey",
    "check_polygon",
    "corner_list",
    "run",
    "survey",
]
