"""Coverage quality gate: sides seen, view spread, parcel threshold, blind spot cells."""

from __future__ import annotations

import math

import pytest

from orchados_pipeline.coverage import (
    EARTH_R,
    cell_corners,
    cell_frame,
    cell_of,
    compute_coverage,
    view_spread,
)
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.models import (
    CoverageReport,
    FileRef,
    PanoramaRecord,
    PanoramaSet,
    Pose,
    Producer,
    Tree,
    TreeList,
    read_model,
)
from orchados_pipeline.params import CoverageParams, CropParams, PipelineParams

LAT0, LON0 = 37.06, 37.38
FRAME = LocalFrame(LAT0, LON0)
PRODUCER = Producer(pipeline="t", version="0", params_hash="x", stage="panoramas")
REF = FileRef(path="p", sha256="0" * 64, size=1, media_type="image/webp")


def pano(e: float, n: float, quality: float = 1.0, i: int = 0) -> PanoramaRecord:
    lat, lon = FRAME.to_latlon(e, n)
    return PanoramaRecord(
        panorama_id=f"p{i}",
        session_id="s",
        gps_time_ns=i,
        utc="",
        pose=Pose(
            lat=float(lat), lon=float(lon), height_m=0, heading_deg=0, sd_h_m=0.02, quality="fix"
        ),
        quality_score=quality,
        sharpness=1,
        source_video="v",
        source_video_sha256="0" * 64,
        frame_index=i,
        camera_s=0,
        image=REF,
        preview=REF,
        producer=PRODUCER,
    )


def aisle(e: float, n0: float, n1: float, step: float = 3.5) -> list[PanoramaRecord]:
    k = int((n1 - n0) / step) + 1
    return [pano(e, n0 + j * step, i=int(e * 1000) + j) for j in range(k)]


def tree(code: str, e: float, n: float) -> Tree:
    lat, lon = FRAME.to_latlon(e, n)
    return Tree(tree_id=f"t-{code}", slot_code=code, lat=float(lat), lon=float(lon))


def row_trees(e: float, row: int, n_trees: int = 5, spacing: float = 8.0) -> list[Tree]:
    return [tree(f"S{row}-{j + 1}", e, 4.0 + j * spacing) for j in range(n_trees)]


def cover(trees, panoramas, p: CoverageParams | None = None, bbox=None):
    tlist = TreeList(trees=trees, boundary_bbox=bbox)
    res = compute_coverage(
        tlist,
        PanoramaSet(producer=PRODUCER, panoramas=panoramas, sidecars=[]),
        2.0,
        CropParams(),
        p or CoverageParams(),
    )
    assert res is not None
    return res


def test_view_spread():
    assert view_spread([]) is None and view_spread([10]) is None
    assert view_spread([0, 90]) == pytest.approx(90)
    assert view_spread([350, 170]) == pytest.approx(180)
    assert view_spread([0, 100, 200]) == pytest.approx(160)
    assert view_spread([10, 20, 30]) == pytest.approx(20)


def test_tree_seen_from_both_aisles_is_covered():
    # A row of trees along north at e = 0; aisles 4 m either side (8 m rows).
    trees = row_trees(0.0, 1)
    trees_, summary, cells, _ = cover(trees, aisle(-4, -4, 44) + aisle(4, -4, 44))
    assert all(t.covered for t in trees_)
    assert all({"E", "W"} <= set(t.sufficient_directions) for t in trees_)
    assert all(t.view_spread_deg >= 170 for t in trees_)
    assert (summary.ratio, summary.passed, summary.rescan_needed) == (1.0, True, False)
    assert cells == []


def test_one_aisle_does_not_cover_even_with_oblique_sides():
    trees = row_trees(0.0, 1)
    trees_, summary, _, _ = cover(trees, aisle(4, -4, 44))
    # The crops come from three sides, but all views are from the east aisle.
    t = trees_[2]
    assert set(t.crop_directions) == {"N", "E", "S"}
    assert len(t.sufficient_directions) >= 2
    assert t.view_spread_deg < 120 and not t.covered
    assert summary.covered_trees == 0 and not summary.passed and summary.rescan_needed


def test_far_or_low_quality_views_are_not_sufficient():
    t = [tree("S1-1", 0, 0)]
    # 10 m away: in the crop range (crop exists) but below the view score.
    trees_, _, _, _ = cover(t, [pano(10, 0, i=1), pano(-10, 0, i=2)])
    assert trees_[0].crop_directions == ["E", "W"] and trees_[0].sufficient_directions == []
    assert trees_[0].nearest_panorama_m == pytest.approx(10, abs=0.01)
    # Out of the crop range entirely: no crop, but the nearest panorama is reported.
    trees_, _, _, _ = cover(t, [pano(30, 0, i=1)])
    assert trees_[0].directions == [] and trees_[0].nearest_panorama_m == pytest.approx(
        30, abs=0.05
    )
    assert trees_[0].best_crop_score is None and not trees_[0].covered


def test_threshold_and_skipped_corridor_blind_spot():
    # Three rows (e = 0, 8, 16), aisles at -4, 4, 12, 20; the aisle at 12 is skipped:
    # row 2 is only seen from the west, row 3 only from the east.
    trees = row_trees(0, 1) + row_trees(8, 2) + row_trees(16, 3)
    panos = aisle(-4, -4, 44) + aisle(4, -4, 44) + aisle(20, -4, 44)
    trees_, summary, cells, frame = cover(trees, panos)
    covered = {t.slot_code for t in trees_ if t.covered}
    assert covered == {f"S1-{j}" for j in range(1, 6)}
    assert (summary.active_trees, summary.covered_trees, summary.missing_trees) == (15, 5, 10)
    assert summary.ratio == pytest.approx(1 / 3, abs=1e-4) and not summary.passed
    assert summary.blind_spots >= 1 and all(c.uncovered > 0 for c in cells)
    blind = [c for c in cells if c.blind_spot]
    assert {code for c in blind for code in c.uncovered_slot_codes} <= {
        t.slot_code for t in trees_ if not t.covered
    }
    assert frame.source == "trees"

    # All aisles: everything covered; a threshold of 1 still passes.
    trees_, summary, cells, _ = cover(
        trees, panos + aisle(12, -4, 44), CoverageParams(parcel_threshold=1.0)
    )
    assert summary.passed and cells == []


def test_single_uncovered_tree_is_not_a_blind_spot():
    trees = row_trees(0, 1)
    panos = aisle(-4, -4, 44) + aisle(4, -4, 44)
    # Remove the east-side panoramas near the middle tree (n = 20): one tree uncovered.
    panos = [
        q
        for q in panos
        if not (q.pose.lon > LON0 and abs(FRAME.to_en(q.pose.lat, q.pose.lon)[1] - 20) < 9)
    ]
    trees_, summary, cells, _ = cover(trees, panos)
    missing = [t.slot_code for t in trees_ if not t.covered]
    assert missing == ["S1-3"]
    assert summary.ratio == pytest.approx(0.8) and not summary.passed
    assert len(cells) == 1 and not cells[0].blind_spot and summary.blind_spots == 0
    assert summary.rescan_needed  # below the threshold all the same
    # A looser threshold: passes, no blind spot -> no extra visit.
    _, summary, _, _ = cover(trees, panos, CoverageParams(parcel_threshold=0.8))
    assert summary.passed and not summary.rescan_needed
    # One uncovered tree is a blind spot if the rule says so.
    _, summary, cells, _ = cover(
        trees, panos, CoverageParams(blind_spot_min_trees=1, blind_spot_min_share=0.1)
    )
    assert summary.blind_spots == 1 and cells[0].blind_spot


def test_cells_follow_the_database_rule():
    # docs/arayuzler.md: metres from the south-west corner of the box, R = 6 371 008.8 m.
    bbox = (37.3790, 37.0590, 37.3830, 37.0620)
    tlist = TreeList(trees=[tree("S1-1", 0, 0)], boundary_bbox=bbox)
    frame = cell_frame(tlist, 10.0)
    assert (frame.source, frame.west, frame.south) == ("boundary", 37.3790, 37.0590)
    lat, lon = (
        37.0590 + math.degrees(25 / EARTH_R),
        37.3790 + math.degrees(37 / (EARTH_R * math.cos(math.radians(37.0590)))),
    )
    assert cell_of(lat, lon, frame) == (3, 2)
    c = cell_corners((3, 2), frame)
    assert c["south"] < lat < c["north"] and c["west"] < lon < c["east"]
    assert cell_of(c["south"] + 1e-9, c["west"] + 1e-9, frame) == (3, 2)
    # Without a boundary: the trees' box.
    assert cell_frame(TreeList(trees=[]), 10.0) is None


def test_coverage_params_are_in_the_params_hash():
    a = PipelineParams()
    b = PipelineParams()
    b.coverage.parcel_threshold = 0.9
    assert a.params_hash() != b.params_hash()
    assert "coverage" in a.model_dump()


def test_processed_run_writes_coverage(processed_run):
    ctx, _, truth = processed_run
    rep = read_model(CoverageReport, ctx.coverage_path)
    assert rep.status == "ok" and rep.producer.stage == "coverage"
    assert rep.rule == ctx.params.coverage.model_dump(mode="json")
    assert len(rep.trees) == len(truth.trees) == rep.summary.active_trees
    # The default scene drives the aisles either side of the middle row only:
    # the outer rows are seen from one side.
    covered = {t.slot_code for t in rep.trees if t.covered}
    assert covered == {f"S2-{j}" for j in range(1, 5)}
    assert rep.summary.rescan_needed and not rep.summary.passed


def test_synthetic_scan_skipping_an_aisle(tmp_path):
    from conftest import fast_params

    from orchados_pipeline.context import RunContext
    from orchados_pipeline.pipeline import run_all
    from orchados_pipeline.synthetic import SyntheticConfig, make_session

    # The east aisle (e = 6) is skipped: the middle row is seen from one side only,
    # the east row from 9 m away.
    truth = make_session(tmp_path / "s", SyntheticConfig(skip_aisles=(2,)))
    assert truth.path_length_m == pytest.approx(30.0)
    ctx = RunContext.create(tmp_path / "s", tmp_path / "out", fast_params())
    run_all(ctx)
    rep = read_model(CoverageReport, ctx.coverage_path)
    assert rep.summary.covered_trees == 0 and rep.summary.rescan_needed
    east = [t for t in rep.trees if t.slot_code.startswith("S3-")]
    assert all(t.nearest_panorama_m > 8.5 and not t.sufficient_directions for t in east)
    blind = {code for c in rep.cells if c.blind_spot for code in c.uncovered_slot_codes}
    assert {t.slot_code for t in east} <= blind
