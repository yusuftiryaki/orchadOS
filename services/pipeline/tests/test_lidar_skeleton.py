"""Winter skeleton (lidar_skeleton) on synthetic leafless trees with known truth.

Accuracy seen while writing these tests (12 seeds per preset, inventory offset
~0.3 m, noise 1.5 cm): scaffold count exact for young, productive and old
trees; wood volume young -26 % .. +30 % (thin wood dominates), productive
-12 % .. +1 %, old -9 % .. 0 %; trunk diameter at 0.5 m within -4 % .. +9 %.
The asserted tolerances are a little wider, so the tests check the method, not
one random draw.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from orchados_pipeline import cli
from orchados_pipeline.lidar import skeleton
from orchados_pipeline.lidar.cloud import TreeCloud, sector_coverage
from orchados_pipeline.lidar.skeleton import SkeletonParams, analyze_tree, skeletonize
from orchados_pipeline.lidar.synthetic import (
    SIZE_PRESETS,
    make_plot,
    make_tree,
    occlude_sector,
    sample_wood,
)

P = SkeletonParams()


def tree_cloud(preset: str, seed: int, occlude: tuple[float, float] | None = None):
    """One synthetic winter tree as extract_trees would give it: tree frame around an
    inventory position that is off by a few decimetres, ground (< 0.25 m) removed."""
    rng = np.random.default_rng(seed)
    tree = make_tree(SIZE_PRESETS[preset], rng)
    pts = sample_wood(tree, rng)
    if occlude:
        pts = occlude_sector(pts, *occlude)
    off = rng.normal(0, 0.2, 2)
    pts = pts - np.array([off[0], off[1], 0.0])
    pts = pts[pts[:, 2] >= 0.25]
    tc = TreeCloud(
        tree_id=f"t-{preset}-{seed}",
        slot_code="S1-1",
        points=pts,
        ground_z=850.0,
        center_en=(0.0, 0.0),
        sector_coverage=sector_coverage(pts[:, :2]),
    )
    return tree, tc


CASES = [(preset, seed) for preset in ("young", "productive", "old") for seed in range(4)]


@pytest.mark.parametrize(("preset", "seed"), CASES)
def test_scaffolds_volume_and_trunk_match_truth(preset, seed):
    tree, tc = tree_cloud(preset, seed)
    truth = tree.truth()
    res = analyze_tree(tc, P)
    assert res.quality.status == "ok"
    d = res.detail
    assert d.scaffold_branch_count == truth["scaffold_branch_count"]
    tol = {"young": 0.35, "productive": 0.2, "old": 0.2}[preset]
    assert d.wood_volume_m3 == pytest.approx(truth["wood_volume_m3"], rel=tol)
    # Truth radius tapers linearly from the base to 0.85 of it at the trunk top.
    h = d.trunk_diameter_height_m
    taper = 1 - 0.15 * h / tree.spec.trunk_height_m
    assert d.trunk_diameter_m == pytest.approx(truth["trunk_diameter_m"] * taper, rel=0.12)
    # First branching: where the stems separate, at or a little above the trunk top.
    assert -0.1 < d.first_branching_height_m - tree.spec.trunk_height_m < 0.35
    assert d.branch_count_by_order["0"] == 1
    assert d.branch_count_by_order["1"] >= truth["scaffold_branch_count"]
    assert 1.2 < d.fractal_dimension < 2.2
    assert d.clutter_fraction is not None and d.clutter_fraction < P.leafy_warn_fraction
    # Skeleton: consistent tree, scaffold branches flagged.
    ids = {n.id for n in d.nodes}
    assert sum(1 for n in d.nodes if n.parent is None) == 1
    assert all(n.parent in ids for n in d.nodes if n.parent is not None)
    assert sum(1 for b in d.branches if b.scaffold) == d.scaffold_branch_count
    by_metric = {m.metric: m for m in res.measurements}
    assert set(by_metric) == {"scaffold_branch_count", "wood_volume", "fractal_dimension"}
    for m in res.measurements:
        assert m.uncertainty is not None and m.uncertainty > 0
        assert (m.method, m.method_version) == ("lidar_qsm", "0.1.0")
    assert by_metric["scaffold_branch_count"].unit == "count"
    assert by_metric["wood_volume"].unit == "m3"
    assert by_metric["fractal_dimension"].unit is None


def test_noise_estimate_and_runtime_budget():
    """sigma is estimated from branch tips (true 1.5 cm); an old tree stays fast."""
    import time

    _, tc = tree_cloud("old", 7)
    t0 = time.perf_counter()
    skel = skeletonize(tc.points, P)
    assert time.perf_counter() - t0 < 5.0
    assert 0.011 < skel.sigma < 0.02


def test_one_sided_tree_has_no_measurements():
    _, tc = tree_cloud("productive", 3, occlude=(60, 330))
    res = analyze_tree(tc, P)
    assert res.quality.status == "one_sided"
    assert res.measurements == []
    assert res.detail.nodes  # the skeleton is still described


def test_too_few_points():
    _, tc = tree_cloud("young", 1)
    tc.points = tc.points[:100]
    res = analyze_tree(tc, P)
    assert res.quality.status == "too_few_points"
    assert res.measurements == [] and res.detail.nodes == []


def test_leafy_cloud_gives_warning():
    rng = np.random.default_rng(3)
    plot = make_plot([["young", "young"]], rng, leafy=True)
    from orchados_pipeline.lidar.cloud import RegisteredCloud, extract_trees

    trees = extract_trees(RegisteredCloud(plot.points, plot.meta), plot.positions)
    report = skeleton.make_report(plot.meta, trees, P)
    assert any(w.startswith("leafy_cloud") for w in report.warnings)
    assert all("leafy_clutter" in s.notes for s in report.skeletons)


def test_cli_synth_skeleton_end_to_end_is_deterministic(tmp_path, capsys):
    dest = tmp_path / "s"
    rows = "young,productive;old,"
    assert cli.main(["lidar", "synth", str(dest), "--leafless", "--rows", rows, "--seed", "4"]) == 0
    assert cli.main(["lidar", "skeleton", str(dest)]) == 0
    out = capsys.readouterr().out
    assert "lidar skeleton: 3/3 trees measured" in out
    path = tmp_path / "s.processed" / "lidar" / "skeleton.json"
    assert cli.main(["lidar", "skeleton", str(dest), "--out", str(tmp_path / "again")]) == 0
    assert path.read_bytes() == (tmp_path / "again" / "skeleton.json").read_bytes()

    body = json.loads(path.read_text())
    assert body["schema"] == "orchados.lidar_skeleton/1"
    assert body["producer"]["stage"] == "lidar_skeleton"
    assert body["producer"]["params_hash"] == SkeletonParams().params_hash()
    assert (body["method"], body["method_version"]) == ("lidar_qsm", "0.1.0")
    assert body["warnings"] == []
    truth = json.loads((dest / "lidar" / "truth.json").read_text())
    counts = {
        m["tree_id"]: m["value_numeric"]
        for m in body["measurements"]
        if m["metric"] == "scaffold_branch_count"
    }
    assert counts == {k: float(v["scaffold_branch_count"]) for k, v in truth.items()}

    # Parameter overrides change the hash.
    params = tmp_path / "params.json"
    params.write_text(json.dumps({"skeleton": {"voxel_m": 0.05}}))
    out_dir = tmp_path / "p"
    cmd = ["lidar", "skeleton", str(dest), "--params", str(params), "--out", str(out_dir)]
    assert cli.main(cmd) == 0
    other = json.loads((out_dir / "skeleton.json").read_text())
    assert other["producer"]["params_hash"] != body["producer"]["params_hash"]
    assert other["params"]["voxel_m"] == 0.05
