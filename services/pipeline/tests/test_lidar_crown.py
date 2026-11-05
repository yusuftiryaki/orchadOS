"""Leafy-season crown stage on synthetic clouds with known truth."""

from __future__ import annotations

import json

import numpy as np
import pytest

from orchados_pipeline.cli import main
from orchados_pipeline.lidar.cloud import (
    RegisteredCloud,
    TreeCloud,
    extract_trees,
    sector_coverage,
)
from orchados_pipeline.lidar.crown import (
    LEAFLESS_WARNING,
    CrownParams,
    CrownReport,
    class_probabilities,
    fibonacci_directions,
    hull_volume,
    measure,
    measure_tree,
)
from orchados_pipeline.lidar.synthetic import (
    SIZE_PRESETS,
    make_plot,
    make_tree,
    occlude_sector,
    sample_tree,
)

P = CrownParams()
D_TOL, H_TOL, V_TOL = 0.05, 0.03, 0.10


def run_plot(plot, params: CrownParams = P) -> CrownReport:
    tcs = extract_trees(RegisteredCloud(plot.points, plot.meta), plot.positions)
    return measure(tcs, plot.meta.point_sigma_m, params, session_id="s", parcel_id="p")


def by_tree(report: CrownReport, tree_id: str):
    row = next(d for d in report.details if d.tree_id == tree_id)
    q = next(t for t in report.trees if t.tree_id == tree_id)
    ms = {m.metric: m for m in report.measurements if m.tree_id == tree_id}
    return row, q, ms


def assert_close_to_truth(row, ms, truth) -> None:
    assert row.status == "ok"
    assert ms["crown_diameter"].value_numeric == pytest.approx(truth["crown_diameter_m"], rel=D_TOL)
    assert ms["tree_height"].value_numeric == pytest.approx(truth["height_m"], rel=H_TOL)
    assert ms["crown_volume"].value_numeric == pytest.approx(truth["crown_volume_m3"], rel=V_TOL)
    assert row.crown_base_m == pytest.approx(truth["crown_base_m"], abs=0.3)


def tree_cloud(points: np.ndarray, tree_id: str = "t1", neighbours=()) -> TreeCloud:
    pts = points[points[:, 2] >= 0.25]
    return TreeCloud(
        tree_id=tree_id,
        slot_code="S1-1",
        points=pts,
        ground_z=0.0,
        center_en=(0.0, 0.0),
        sector_coverage=sector_coverage(pts[:, :2]),
        neighbours_en=list(neighbours),
    )


@pytest.fixture(scope="module")
def presets_report():
    """One row of every preset, 9 m apart, default noise and position error."""
    plot = make_plot([list(SIZE_PRESETS)], np.random.default_rng(11), leafy=True, spacing_m=9.0)
    return plot, run_plot(plot)


@pytest.mark.parametrize("size", list(SIZE_PRESETS))
def test_presets_match_truth(presets_report, size):
    plot, report = presets_report
    col = list(SIZE_PRESETS).index(size) + 1
    tid = f"t-r1-p{col}"
    row, q, ms = by_tree(report, tid)
    truth = plot.trees[tid].truth()
    assert_close_to_truth(row, ms, truth)
    assert q.status == "ok" and q.sector_coverage == 1.0
    # Away from the thresholds the class is the preset's, with high confidence.
    assert ms["size_class"].value_category == size
    assert ms["size_class"].confidence >= 0.8
    for metric, unit in (
        ("tree_height", "m"),
        ("crown_diameter", "m"),
        ("crown_volume", "m3"),
        ("crown_base_height", "m"),
    ):
        m = ms[metric]
        assert m.unit == unit and m.uncertainty > 0 and m.value_category is None
        assert m.method == "lidar_crown" and m.method_version == "0.2.0"
    assert ms["size_class"].value_numeric is None and ms["size_class"].unit is None
    assert not report.warnings


def test_slope_position_error_grass_and_noise():
    rng = np.random.default_rng(23)
    plot = make_plot(
        [["sapling", "young"], ["productive", "old"]],
        rng,
        leafy=True,
        spacing_m=8.5,
        slope=(0.08, -0.05),
        position_error_m=0.3,
        grass_height_m=0.35,
        ground_density_per_m2=150.0,
    )
    # Isolated stray returns in the air (dust, insects, multipath).
    lo, hi = plot.points.min(axis=0), plot.points.max(axis=0)
    stray = rng.uniform(lo, hi + np.array([0, 0, 2.0]), (80, 3))
    plot.points = np.vstack([plot.points, stray])
    report = run_plot(plot)
    for tid, tree in plot.trees.items():
        row, _, ms = by_tree(report, tid)
        assert_close_to_truth(row, ms, tree.truth())
        size = next(k for k, v in SIZE_PRESETS.items() if v is tree.spec)
        assert ms["size_class"].value_category == size


def test_disconnected_fragment_is_dropped():
    tree = make_tree(SIZE_PRESETS["young"], np.random.default_rng(3))
    pts = sample_tree(tree, np.random.default_rng(4), leafy=True)
    base = measure_tree(tree_cloud(pts), 0.02, P)[1]
    # A neighbour's crown fragment 3.5 m east, not touching this crown.
    frag = np.random.default_rng(5).normal([3.5, 0.0, 2.0], [0.3, 0.6, 0.4], (1500, 3))
    q, row, _ = measure_tree(tree_cloud(np.vstack([pts, frag])), 0.02, P)
    assert q.status == "ok"
    assert row.n_points_raw == base.n_points_raw + 1500
    assert row.n_points == base.n_points
    assert row.crown_diameter_m == base.crown_diameter_m


def test_one_sided_tree_gives_height_only():
    tree = make_tree(SIZE_PRESETS["productive"], np.random.default_rng(7))
    pts = occlude_sector(sample_tree(tree, np.random.default_rng(8), leafy=True), 90, 270)
    q, row, ms = measure_tree(tree_cloud(pts), 0.02, P)
    assert q.status == "one_sided" and row.status == "one_sided"
    assert q.sector_coverage < P.min_sector_coverage
    assert [m.metric for m in ms] == ["tree_height"]
    assert row.crown_diameter_m is None and row.crown_volume_m3 is None
    assert row.size_class is None
    assert any("one-sided" in n for n in q.notes)


def test_no_points_and_too_few_points():
    q, row, ms = measure_tree(tree_cloud(np.zeros((0, 3))), 0.02, P)
    assert (q.status, ms, row.n_points) == ("no_points", [], 0)
    few = np.random.default_rng(1).normal([0, 0, 0.8], [0.1, 0.1, 0.3], (60, 3))
    q, _, ms = measure_tree(tree_cloud(few), 0.02, P)
    assert q.status == "too_few_points" and ms == []
    # Points, but nothing near the trunk: not this tree's points.
    far = np.random.default_rng(2).normal([3.0, 3.0, 2.0], 0.3, (2000, 3))
    q, _, ms = measure_tree(tree_cloud(far), 0.02, P)
    assert q.status == "no_points" and ms == [] and q.notes


def test_touching_crowns_note_and_lower_confidence():
    plot = make_plot(
        [["productive", "productive", "productive"]],
        np.random.default_rng(31),
        leafy=True,
        spacing_m=4.5,
        position_error_m=0.1,
    )
    report = run_plot(plot)
    row, q, ms = by_tree(report, "t-r1-p2")
    assert row.status == "ok" and row.touches_neighbour
    assert "touches_neighbour" in row.flags
    note = next(n for n in q.notes if "touches" in n)
    assert "E" in note and "W" in note and "lower bound" in note
    assert ms["size_class"].confidence <= P.size_class_max_confidence * P.touch_confidence_factor
    assert ms["crown_diameter"].confidence < 1.0
    # Cut half way to the neighbours: the measured diameter is below the truth.
    assert ms["crown_diameter"].value_numeric < plot.trees["t-r1-p2"].truth()["crown_diameter_m"]
    # Height is not affected by the split.
    assert ms["tree_height"].confidence == 1.0

    alone = run_plot(
        make_plot([["productive"]], np.random.default_rng(31), leafy=True, position_error_m=0.1)
    )
    arow, aq, ams = by_tree(alone, "t-r1-p1")
    assert not arow.touches_neighbour and not any("touches" in n for n in aq.notes)
    assert ams["size_class"].confidence > ms["size_class"].confidence


def test_leafless_cloud_warns():
    plot = make_plot([["productive", "old"]], np.random.default_rng(41), leafy=False)
    report = run_plot(plot)
    assert len(report.warnings) == 1 and report.warnings[0].startswith(LEAFLESS_WARNING)
    ok = [d for d in report.details if d.status == "ok"]
    assert ok
    for d in ok:
        assert "low_foliage" in d.flags and d.size_class_confidence <= 0.5


def test_class_confidence_near_threshold():
    cls, prob = class_probabilities(2.98, 0.05, P)
    assert cls == "young" and 0.5 < prob < 0.7
    cls, prob = class_probabilities(3.02, 0.05, P)
    assert cls == "productive" and 0.5 < prob < 0.7
    assert class_probabilities(4.5, 0.05, P) == ("productive", pytest.approx(1.0))
    assert class_probabilities(0.4, 0.05, P)[0] == "sapling"
    assert class_probabilities(6.5, 0.05, P)[0] == "old"


def test_hull_volume_of_a_sphere_and_a_box():
    dirs = fibonacci_directions(1000)
    vol = hull_volume(dirs, np.full(len(dirs), 2.0), (-2, -2, 2, 2), 120)
    assert vol == pytest.approx(4 / 3 * np.pi * 8, rel=0.01)
    corners = np.array([[x, y, z] for x in (0, 2) for y in (0, 1) for z in (0, 3)], float)
    h = (corners @ dirs.T).max(axis=0)
    assert hull_volume(dirs, h, (0, 0, 2, 1), 120) == pytest.approx(6.0, rel=0.02)


def test_cli_end_to_end_deterministic(tmp_path, capsys):
    sess = tmp_path / "sess"
    assert main(["lidar", "synth", str(sess), "--rows", "young,productive", "--seed", "3"]) == 0
    out1, out2 = tmp_path / "o1", tmp_path / "o2"
    assert main(["lidar", "crown", str(sess), "--out", str(out1)]) == 0
    assert main(["lidar", "crown", str(sess), "--out", str(out2)]) == 0
    b1, b2 = (out1 / "crown.json").read_bytes(), (out2 / "crown.json").read_bytes()
    assert b1 == b2
    lines = capsys.readouterr().out.strip().splitlines()
    assert lines[-1].startswith("crown: 2 trees") and "ok 2" in lines[-1]

    body = json.loads(b1)
    assert body["schema"] == "orchados.lidar_crown/1"
    report = CrownReport.model_validate(body)
    assert report.producer.stage == "lidar_crown"
    assert report.producer.params_hash == CrownParams().params_hash()
    assert report.method == "lidar_crown"
    truth = json.loads((sess / "lidar" / "truth.json").read_text())
    for tid, t in truth.items():
        row, _, ms = by_tree(report, tid)
        assert_close_to_truth(row, ms, t)

    # Default output folder and a parameter override (changes the hash).
    params = tmp_path / "params.json"
    params.write_text(json.dumps({"min_points": 10_000_000}))
    assert main(["lidar", "crown", str(sess), "--params", str(params)]) == 0
    default = tmp_path / "sess.processed" / "lidar" / "crown.json"
    other = CrownReport.model_validate_json(default.read_text())
    assert other.producer.params_hash != report.producer.params_hash
    assert {t.status for t in other.trees} == {"too_few_points"}
    assert other.measurements == []
