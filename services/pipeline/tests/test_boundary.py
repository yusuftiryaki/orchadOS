"""Boundary stage: corner list rules, corner positions, polygon checks (no Supabase)."""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta

import pytest

from orchados_pipeline import pipeline
from orchados_pipeline.boundary import (
    BoundaryError,
    SessionEvent,
    check_polygon,
    corner_list,
    run,
    survey,
)
from orchados_pipeline.context import RunContext
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.models import PpkStatus, Trajectory, read_model, write_model
from orchados_pipeline.synthetic import SyntheticConfig, make_session

T0 = 1_476_349_000_000_000_000
PHONE_T0 = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)


def _ev(i: int, kind: str = "corner", t_s: float | None = None, data=None, no=None) -> SessionEvent:
    t_s = float(i) if t_s is None else t_s
    no = i if no is None else no
    return SessionEvent(
        id=f"00000000-0000-4000-8000-{i:012d}",
        event_type=kind,
        payload=str(no),
        gps_time_ns=T0 + int(t_s * 1e9),
        time_source="gps",
        phone_time=PHONE_T0 + timedelta(seconds=t_s),
        data={"corner_no": no} if data is None and kind == "corner" else data,
    )


def _list(i: int, t_s: float, corners: list[SessionEvent], note=None) -> SessionEvent:
    items = [
        {"event_id": c.id, "corner_no": c.corner_no, "note": note, "markers": ["fence"]}
        for c in corners
    ]
    return _ev(i, "boundary_corners", t_s, {"version": 1, "corners": items}, no=len(items))


# --- corner list --------------------------------------------------------------------


def test_corner_list_without_edits_is_marking_order():
    a, b, c = _ev(1, t_s=30), _ev(2, t_s=10), _ev(3, t_s=20)
    listed, latest = corner_list([a, b, c])
    assert [x.event.corner_no for x in listed] == [2, 3, 1]
    assert latest is None


def test_corner_list_newest_list_counts():
    c1, c2, c3, c4 = (_ev(i, t_s=10 * i) for i in range(1, 5))
    old = _list(10, 25, [c2, c1])
    new = _list(11, 45, [c3, c1, c2], note="tas")  # c4 deleted, order changed
    c5 = _ev(5, t_s=50)  # after the newest list: appended
    listed, latest = corner_list([c5, new, c1, old, c4, c2, c3])
    assert latest is new
    assert [x.event.corner_no for x in listed] == [3, 1, 2, 5]
    assert listed[0].note == "tas" and listed[0].markers == ["fence"]
    assert listed[3].note is None and listed[3].markers == []


def test_corner_list_tie_on_gps_time_uses_phone_time():
    c1, c2, c3 = (_ev(i, t_s=i) for i in range(1, 4))
    a = _list(10, 10, [c1, c2, c3])
    b = _list(11, 10, [c3, c2, c1])
    b = SessionEvent(**{**b.__dict__, "phone_time": a.phone_time + timedelta(seconds=1)})
    listed, latest = corner_list([b, a, c1, c2, c3])
    assert latest is b and [x.event.corner_no for x in listed] == [3, 2, 1]


def test_corner_list_unknown_event_is_an_error():
    c1 = _ev(1)
    ghost = _ev(9)
    with pytest.raises(BoundaryError, match="not in the database"):
        corner_list([c1, _list(10, 20, [c1, ghost])])


# --- polygon ------------------------------------------------------------------------


def test_check_polygon_area_and_errors():
    assert check_polygon([(0, 0), (10, 0), (10, 20), (0, 20)]) == pytest.approx(200)
    with pytest.raises(BoundaryError, match="at least three"):
        check_polygon([(0, 0), (10, 0)])
    with pytest.raises(BoundaryError, match="self-intersecting.*edge 1-2 crosses edge 3-4"):
        check_polygon([(0, 0), (10, 10), (10, 0), (0, 10)])
    with pytest.raises(BoundaryError, match="self-intersecting"):
        # Touching: corner 4 lies on edge 1-2.
        check_polygon([(0, 0), (10, 0), (10, 10), (5, 0)])
    with pytest.raises(BoundaryError, match="no area"):
        check_polygon([(0, 0), (5, 0), (10, 0)])


# --- survey on a synthetic boundary walk --------------------------------------------


@pytest.fixture(scope="module")
def walk_session(tmp_path_factory):
    root = tmp_path_factory.mktemp("walk")
    cfg = SyntheticConfig(boundary_walk=True)
    truth = make_session(root / "s", cfg)
    ctx = RunContext.create(root / "s", root / "out")
    pipeline.stage_ingest(ctx)
    pipeline.stage_position(ctx)
    rows = json.loads((root / "s" / "phone_events.json").read_text())
    return ctx, truth, rows


def _events(rows) -> list[SessionEvent]:
    return [SessionEvent.from_row(r) for r in rows]


def _distance_m(lat, lon, lat2, lon2) -> float:
    e, n = LocalFrame(lat, lon).to_en(lat2, lon2)
    return math.hypot(float(e), float(n))


def test_synthetic_walk_events(walk_session):
    ctx, truth, rows = walk_session
    kinds = [r["event_type"] for r in rows]
    assert kinds.count("corner") == 5 and kinds.count("boundary_corners") == 1
    assert [c["corner_no"] for c in truth.boundary_corners] == [1, 2, 3, 5]
    assert truth.boundary_area_m2 == pytest.approx(432.0)
    logger_corners = [
        line.split(",")[3]
        for line in (ctx.session_dir / "gnss" / "events.csv").read_text().splitlines()
        if ",corner," in line
    ]
    assert logger_corners == ["1", "2", "3", "4", "5"]


def test_survey_without_ppk_uses_phone_and_logger(walk_session):
    ctx, truth, rows = walk_session
    s = survey(ctx, "synth-0001", "parcel-synth", _events(rows))
    assert [c.corner_no for c in s.corners] == [1, 2, 3, 5]  # mistaken corner 4 deleted
    assert [c.source for c in s.corners] == ["phone", "logger", "phone", "phone"]
    assert all(c.flagged and c.uncertainty_m == 5.0 for c in s.corners)
    assert s.vertex_uncertainty_m == 5.0
    assert s.trajectory_ppk_status == PpkStatus.no_ppk
    # Corner 5 was timed by the phone clock; the logger row's time replaces it.
    assert s.corners[3].time_source == "logger"
    assert s.corners[0].note == "sinir tasi" and s.corners[0].markers == ["stone"]
    for c, t in zip(s.corners, truth.boundary_corners, strict=True):
        assert _distance_m(c.lat, c.lon, t["lat"], t["lon"]) < 0.05
    assert s.area_m2 == pytest.approx(truth.boundary_area_m2, rel=1e-3)
    assert s.area_donum == pytest.approx(s.area_m2 / 1000, abs=1e-3)
    assert any("not PPK" in w for w in s.warnings)
    assert any("4 of 4 corners are not PPK" in w for w in s.warnings)
    lines = "\n".join(s.lines())
    assert "4 corners" in lines and "donum" in lines and "[flagged: not PPK]" in lines


def _ppk_copy(ctx: RunContext, tmp_path, drop_around_ns: int | None = None) -> RunContext:
    """The walk session with its NAV-PVT trajectory relabelled as a PPK solution."""
    out = RunContext.create(ctx.session_dir, tmp_path / "out")
    traj = read_model(Trajectory, ctx.trajectory_path)
    traj = traj.model_copy(update={"ppk_status": PpkStatus.ppk, "source": "rtklib_pos"})
    if drop_around_ns is not None:
        traj.points = [p for p in traj.points if abs(p.gps_time_ns - drop_around_ns) > 3e9]
    write_model(traj, out.trajectory_path)
    return out


def test_survey_with_ppk(walk_session, tmp_path):
    ctx, truth, rows = walk_session
    s = survey(_ppk_copy(ctx, tmp_path), "synth-0001", "parcel-synth", _events(rows))
    assert [c.source for c in s.corners] == ["ppk"] * 4
    assert not any(c.flagged for c in s.corners)
    # NAV-PVT hAcc 0.02 m is split over N and E; the horizontal sd is back to 0.02.
    assert s.vertex_uncertainty_m == pytest.approx(0.02, abs=1e-3)
    for c, t in zip(s.corners, truth.boundary_corners, strict=True):
        assert _distance_m(c.lat, c.lon, t["lat"], t["lon"]) < 0.05
    assert not s.warnings


def test_survey_ppk_gap_falls_back(walk_session, tmp_path):
    ctx, truth, rows = walk_session
    ev = _events(rows)
    corner3 = next(e for e in ev if e.event_type == "corner" and e.corner_no == 3)
    s = survey(_ppk_copy(ctx, tmp_path, corner3.gps_time_ns), "synth-0001", "parcel-synth", ev)
    assert [c.source for c in s.corners] == ["ppk", "ppk", "phone", "ppk"]
    assert s.vertex_uncertainty_m == 5.0
    assert any("corner 3" in w and "PPK not fixed" in w for w in s.warnings)


def test_survey_errors(walk_session):
    ctx, _, rows = walk_session
    ev = _events(rows)
    corners = [e for e in ev if e.event_type == "corner"]
    with pytest.raises(BoundaryError, match="need at least three"):
        survey(ctx, "s", "p", corners[:2])
    # A corner without a phone position and without a logger row has no position.
    no_pos = SessionEvent(**{**corners[1].__dict__, "payload": "77", "data": {"corner_no": 77}})
    with pytest.raises(BoundaryError, match="corner 77 .* has no position"):
        survey(ctx, "s", "p", [corners[0], no_pos, corners[2]])
    # Walking 1 -> 3 -> 2 -> 5 crosses the rectangle.
    c1, c2, c3, _, c5 = corners
    bowtie = _list(50, 999, [c1, c3, c2, c5])
    with pytest.raises(BoundaryError, match="self-intersecting"):
        survey(ctx, "s", "p", [*corners, bowtie])


# --- run with a fake database --------------------------------------------------------


class FakeDb:
    def __init__(self, rows, parcel="parcel-synth"):
        self.rows = rows
        self.parcel = parcel
        self.calls = []
        self.versions: list[dict] = []

    def select(self, table, params):
        if table == "session":
            return [{"id": params["id"][3:], "parcel_id": self.parcel}]
        assert table == "session_event"
        assert params["event_type"] == "in.(corner,boundary_corners)"
        return [r for r in self.rows if r["event_type"] in ("corner", "boundary_corners")]

    def rpc(self, name, args):
        self.calls.append((name, args))
        last = self.versions[-1] if self.versions else None
        if last and last["ring"] == args["p_ring"]:
            return {**last["row"], "created": False}
        row = {"id": f"b-{len(self.versions) + 1}", "version": len(self.versions) + 3}
        row["area_m2"] = 432.1
        self.versions.append({"ring": args["p_ring"], "row": row})
        return {**row, "created": True}


def test_run_records_once(walk_session):
    ctx, _, rows = walk_session
    db = FakeDb(rows + [{**rows[0], "id": "x", "event_type": "qr_sync"}])
    first = run(ctx, db, "synth-0001", "parcel-synth")
    assert first.record is not None and first.record.created and first.record.version == 3
    name, args = db.calls[0]
    assert name == "add_field_survey_boundary"
    assert args["p_session_id"] == "synth-0001"
    assert len(args["p_ring"]) == 4 and args["p_vertex_uncertainty_m"] == 5.0
    assert args["p_surveyed_at"].endswith("Z")
    assert read_model(type(first), ctx.boundary_path) == first

    again = run(ctx, db, "synth-0001", "parcel-synth")
    assert again.record is not None and not again.record.created and again.record.version == 3
    assert db.calls[1][1] == args  # same corners, same request

    dry = run(ctx, FakeDb(rows), "synth-0001", "parcel-synth", write_db=False)
    assert dry.record is None


def test_run_rejects_other_parcel(walk_session):
    ctx, _, rows = walk_session
    with pytest.raises(BoundaryError, match="session.json says parcel-synth"):
        run(ctx, FakeDb(rows, parcel="other"), "synth-0001", "parcel-synth")
