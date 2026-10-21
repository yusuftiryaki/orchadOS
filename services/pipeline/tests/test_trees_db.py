"""Tree positions from the database, crop status and the synthetic parcel fit (no Supabase)."""

from __future__ import annotations

import json
import math
import shutil

import numpy as np
import pytest
from test_upload import PARCEL, SESSION, TREES, FakeCatalog

from orchados_pipeline.cli import main
from orchados_pipeline.crops import load_trees, make_crops
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.media import LocalMediaStore
from orchados_pipeline.models import CropSet, Tree, TreeList, read_model
from orchados_pipeline.synthetic import Path2D, SyntheticConfig, fit_to_parcel, parse_range
from orchados_pipeline.trees_db import parcel_tree_list, session_tree_list, slot_order
from orchados_pipeline.upload import UploadError, UploadOptions, upload_run


def _point(lat, lon):
    return {
        "type": "Point",
        "crs": {"type": "name", "properties": {"name": "EPSG:4326"}},
        "coordinates": [lon, lat],
    }


class FakeClient:
    """PostgREST select over in-memory tables (equality filters only)."""

    def __init__(self, tables):
        self.tables = tables

    def select(self, table, params):
        rows = self.tables[table]
        for k, v in params.items():
            if k in ("select", "order"):
                continue
            assert v.startswith("eq.")
            rows = [r for r in rows if str(r[k]) == v[3:]]
        return [dict(r) for r in rows]


def _slot(code, lat=None, lon=None, sd=0.2):
    return {
        "id": f"slot-{code}",
        "parcel_id": PARCEL,
        "code": code,
        "position": None if lat is None else _point(lat, lon),
        "position_uncertainty_m": None if lat is None else sd,
        "local_x_m": 1.0,
        "local_y_m": 2.0,
    }


def _tables(slots, trees):
    return {
        "session": [{"id": SESSION, "parcel_id": PARCEL, "kind": "periodic_scan"}],
        "slot": slots,
        "tree": [
            {"id": tid, "slot_id": f"slot-{code}", "parcel_id": PARCEL, "status": status}
            for code, tid, status in trees
        ],
    }


def test_parcel_tree_list_reads_active_trees_with_positions():
    slots = [
        _slot("S2-1", 37.0001, 37.45),
        _slot("S1-10", 37.0, 37.4502),
        _slot("S1-2", 37.0, 37.4501, sd=0.35),
        _slot("S1-2a", 37.0, 37.45015),
        _slot("S1-1", 37.0, 37.45),
        _slot("S3-1"),  # no position yet
        _slot("S3-2", 37.0002, 37.4501),  # empty
    ]
    trees = [
        ("S2-1", "t21", "active"),
        ("S1-10", "t110", "active"),
        ("S1-2", "t12", "active"),
        ("S1-2a", "t12a", "active"),
        ("S1-1", "t11-old", "lost"),
        ("S1-1", "t11", "active"),
        ("S3-1", "t31", "active"),
        ("S3-2", "t32-old", "lost"),
    ]
    tlist = session_tree_list(FakeClient(_tables(slots, trees)), SESSION)
    assert tlist.source == "database"
    assert (tlist.session_id, tlist.parcel_id, tlist.session_kind) == (
        SESSION,
        PARCEL,
        "periodic_scan",
    )
    assert [t.slot_code for t in tlist.trees] == ["S1-1", "S1-2", "S1-2a", "S1-10", "S2-1"]
    assert [t.tree_id for t in tlist.trees] == ["t11", "t12", "t12a", "t110", "t21"]
    s12 = tlist.trees[1]
    assert (s12.lat, s12.lon, s12.position_uncertainty_m) == (37.0, 37.4501, 0.35)
    assert (s12.local_x_m, s12.local_y_m) == (1.0, 2.0)
    assert tlist.unlocated_slots == ["S3-1"]


def test_parcel_without_positions_has_no_trees():
    tlist = parcel_tree_list(
        FakeClient(_tables([_slot("S1-1"), _slot("S1-2")], [("S1-1", "a", "active")])), PARCEL
    )
    assert tlist.trees == [] and tlist.unlocated_slots == ["S1-1"]
    assert parcel_tree_list(FakeClient(_tables([], [])), PARCEL).trees == []


def test_slot_order():
    codes = ["S10-1", "S2-11", "S2-2a", "S2-2", "X"]
    assert sorted(codes, key=slot_order) == ["S2-2", "S2-2a", "S2-11", "S10-1", "X"]


def test_tree_list_file_round_trip(tmp_path):
    tlist = TreeList(
        source="database",
        parcel_id=PARCEL,
        trees=[Tree(tree_id="a", slot_code="S1-1", lat=37.0, lon=37.4, position_uncertainty_m=0.2)],
    )
    path = tmp_path / "trees.json"
    path.write_text(tlist.model_dump_json(by_alias=True), encoding="utf-8")
    assert load_trees(path) == tlist
    # Hand-written files: a list or {"trees": [...]}.
    path.write_text(json.dumps([{"tree_id": "a", "slot_code": "S1-1", "lat": 1, "lon": 2}]))
    assert load_trees(path).source == "file"
    path.write_text(
        json.dumps({"trees": [{"tree_id": "a", "slot_code": "S1-1", "lat": 1, "lon": 2}] * 2})
    )
    with pytest.raises(ValueError, match="duplicate"):
        load_trees(path)


@pytest.mark.parametrize(
    "session_kind,manifest_kind,trees,status",
    [
        ("inventory", None, True, "inventory_session"),
        (None, "inventory", True, "inventory_session"),
        ("periodic_scan", "scan", False, "no_tree_positions"),
    ],
)
def test_panoramas_only(processed_run, session_kind, manifest_kind, trees, status):
    from orchados_pipeline.models import Manifest, PanoramaSet

    ctx, _, truth = processed_run
    manifest = read_model(Manifest, ctx.manifest_path)
    manifest.session.kind = manifest_kind
    pset = read_model(PanoramaSet, ctx.panoramas_path)
    tlist = TreeList(
        source="database",
        session_kind=session_kind,
        trees=[
            Tree(**{k: t[k] for k in ("tree_id", "slot_code", "lat", "lon")}) for t in truth.trees
        ]
        if trees
        else [],
        unlocated_slots=[] if trees else ["S1-1"],
    )
    cset = make_crops(ctx, manifest, pset, tlist)
    assert cset.status == status and cset.crops == [] and cset.trees_source == "database"


def test_file_trees_report_status(processed_run):
    ctx, out, _ = processed_run
    cset = read_model(CropSet, ctx.crops_path)
    assert (cset.status, cset.trees_source, out.crops_status) == ("ok", "file", "ok")
    # The list the crops were cut from is kept in the run folder.
    assert len(load_trees(ctx.trees_path).trees) == 12


def _db_run(run_dir, dest, tree_of):
    """A copy of the synthetic run as if its crops were cut from the database trees."""
    shutil.copytree(run_dir, dest)
    crops = json.loads((dest / "crops.json").read_text())
    crops["trees_source"] = "database"
    (dest / "crops.json").write_text(json.dumps(crops))
    outputs = json.loads((dest / "outputs.json").read_text())
    for a in outputs["assets"]:
        if a["kind"] == "tree_crop":
            a["subject"]["tree_id"] = tree_of(a["subject"]["slot_code"])
    (dest / "outputs.json").write_text(json.dumps(outputs))
    return dest


def test_upload_matches_database_crops_by_tree_id(processed_run, tmp_path):
    ctx, out, _ = processed_run
    # S1-1 got a new tree after processing: its crops belong to the old one.
    run_dir = _db_run(
        ctx.run_dir,
        tmp_path / "run",
        lambda code: "old-tree" if code == "S1-1" else TREES.get(code, "gone"),
    )
    opts = UploadOptions(station="ist-01", session_dir=ctx.session_dir, require_db_trees=True)
    cat = FakeCatalog()
    rep = upload_run(run_dir, SESSION, cat, LocalMediaStore(tmp_path / "bucket"), opts)
    crops = [r for r in cat.asset_rows if r["kind"] == "tree_crop"]
    codes = {r["pose"]["slot_code"] for r in crops}
    assert crops and "S1-1" not in codes and "S2-3" not in codes
    assert all(r["tree_id"] == TREES[r["pose"]["slot_code"]] for r in crops)
    assert any("changed since processing" in w and "S1-1" in w for w in rep.warnings)
    assert any("no active tree" in w and "S2-3" in w for w in rep.warnings)
    assert rep.status_after == "processed"


def test_upload_can_require_database_crops(processed_run, tmp_path):
    ctx, _, _ = processed_run
    opts = UploadOptions(session_dir=ctx.session_dir, require_db_trees=True)
    cat = FakeCatalog()
    with pytest.raises(UploadError, match="trees-from-db"):
        upload_run(ctx.run_dir, SESSION, cat, LocalMediaStore(tmp_path / "bucket"), opts)
    assert cat.asset_rows == [] and cat.capture_rows == []


def _grid(rows=4, positions=6, spacing=8.0, azimuth=75.0):
    """Seed-like grid: rows along `azimuth`, 8 m apart, plus one interstitial tree."""
    frame = LocalFrame(37.0, 37.45)
    a = math.radians(azimuth)
    along, across = np.array([math.sin(a), math.cos(a)]), np.array([-math.cos(a), math.sin(a)])
    trees = []
    for r in range(1, rows + 1):
        for p in range(1, positions + 1):
            for suffix, shift in (("", 0.0), ("a", 0.5)):
                if suffix and (r, p) != (2, 3):
                    continue
                e, n = (p - 1 + shift) * spacing * along + (r - 1) * spacing * across
                lat, lon = frame.to_latlon(e, n)
                code = f"S{r}-{p}{suffix}"
                trees.append(
                    Tree(tree_id=f"t-{code}", slot_code=code, lat=float(lat), lon=float(lon))
                )
    return trees


def _distance_to_path(path: Path2D, e: float, n: float) -> float:
    s = np.linspace(0, path.length, 4000)
    pts = np.array([path.at(x) for x in s])
    return float(np.min(np.hypot(pts[:, 0] - e, pts[:, 1] - n)))


def test_fit_to_parcel_drives_both_sides_of_the_chosen_rows():
    trees = _grid()
    cfg = SyntheticConfig(parcel_trees=trees, rows=(2, 3), positions=(2, 4))
    lat0, lon0, waypoints, scene = fit_to_parcel(cfg)
    assert len(waypoints) == 6  # three aisles, there and back
    path = Path2D(waypoints)
    frame = LocalFrame(lat0, lon0)
    chosen = [t for t in trees if t.slot_code in {"S2-2", "S2-3", "S2-3a", "S2-4", "S3-2", "S3-4"}]
    for t in chosen:
        e, n = frame.to_en(t.lat, t.lon)
        assert _distance_to_path(path, float(e), float(n)) == pytest.approx(4.0, abs=0.05)
    # Aisles are 4 m beside the rows: 3 aisles x (16 m + 2 x 4 m margin) + 2 x 8 m turns.
    assert path.length == pytest.approx(3 * 24 + 2 * 8, abs=0.1)
    # Every parcel tree near the path is drawn, with its own id.
    assert {s["tree_id"] for s in scene} == {t.tree_id for t in trees}
    by_id = {s["tree_id"]: s for s in scene}
    t = trees[0]
    e, n = frame.to_en(t.lat, t.lon)
    assert (by_id[t.tree_id]["e"], by_id[t.tree_id]["n"]) == pytest.approx((float(e), float(n)))


def test_fit_to_parcel_needs_trees_in_range():
    with pytest.raises(ValueError, match="no trees"):
        fit_to_parcel(SyntheticConfig(parcel_trees=_grid(), rows=(9, 9)))


def test_parse_range():
    assert parse_range("1-2") == (1, 2) and parse_range("3") == (3, 3)
    with pytest.raises(ValueError):
        parse_range("2-1")


def test_synth_rows_need_a_tree_source(tmp_path, capsys):
    with pytest.raises(SystemExit):
        main(["synth", str(tmp_path / "s"), "--rows", "1-2"])
    assert "--rows and --positions need" in capsys.readouterr().err


def test_synth_from_trees_file(tmp_path, capsys):
    trees = tmp_path / "trees.json"
    tlist = TreeList(parcel_id=PARCEL, trees=_grid(rows=2, positions=3))
    trees.write_text(tlist.model_dump_json(by_alias=True))
    dest = tmp_path / "s"
    args = ["synth", str(dest), "--trees", str(trees), "--parcel-id", PARCEL, "--rows", "1"]
    assert main([*args, "--positions", "1-2", "--start-utc", "2026-10-20T08:00:00"]) == 0
    assert "7 trees" in capsys.readouterr().out
    written = json.loads((dest / "trees.json").read_text())["trees"]
    assert {t["tree_id"] for t in written} == {t.tree_id for t in tlist.trees}
    session = json.loads((dest / "gnss" / "session.json").read_text())
    # The logger starts 2 s before the video.
    assert session["parcel_id"] == PARCEL and session["start"]["utc"].startswith(
        "2026-10-20T07:59:5"
    )
