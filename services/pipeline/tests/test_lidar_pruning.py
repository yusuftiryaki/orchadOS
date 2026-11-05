"""Pruning analysis (lidar_pruning): the same synthetic trees scanned before and after
prune(), with independent sampling noise in each scan.

Seen while writing these tests (productive + old trees, seeds 1-6, 12 trees per
scenario): cut count within +-1 for 92-100 % of the trees; removed volume biased
low: whole scaffold branches median -22 % (-41 % .. -14 %), three order-2 cuts
median -39 % (-88 % .. +15 %); no cut on an unpruned pair, also with a 3 cm
shift between visits, which the alignment recovers to a few millimetres. About
2 s per tree pair. The asserts below check per tree what holds for all trees
and per scenario what holds for most (median, share).
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from orchados_pipeline import cli
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar.cloud import RegisteredCloud, extract_trees
from orchados_pipeline.lidar.pruning import PruningParams, make_report, propose_status
from orchados_pipeline.lidar.synthetic import make_plot, prune, write_plot_session

P = PruningParams()
SIZES = [["productive", "old"]]
AFTER_ID = "00000000-0000-4000-8000-0000000000a2"


def scans(seed: int, n_cuts: int, orders=(2,), shift=(0.0, 0.0, 0.0)):
    """Before and after plots of the same trees (after: pruned, optionally shifted)."""
    rng = np.random.default_rng(seed)
    before = make_plot(SIZES, rng, leafy=False)
    pruned = {
        tid: prune(t, rng, n_cuts=n_cuts, orders=orders) if n_cuts else t
        for tid, t in before.trees.items()
    }
    after = make_plot(SIZES, rng, leafy=False, trees_override=pruned, session_id=AFTER_ID)
    after.points = after.points + np.asarray(shift)
    return before, after, pruned


def report_for(before, after, params=P):
    tb = extract_trees(RegisteredCloud(before.points, before.meta), before.positions)
    ta = extract_trees(RegisteredCloud(after.points, after.meta), before.positions)
    return make_report(before.meta, after.meta, tb, ta, params)


def _frame_offset(plot, tree_id: str) -> np.ndarray:
    """Truth tree frame (trunk base) -> tree frame of the analysis (inventory position)."""
    pos = next(p for p in plot.positions if p.tree_id == tree_id)
    e, n = LocalFrame(plot.meta.origin_lat, plot.meta.origin_lon).to_en(pos.lat, pos.lon)
    c = plot.true_centers[tree_id]
    return np.array([c[0] - float(e), c[1] - float(n), 0.0])


def removed_truth(tree) -> float:
    return sum(c["removed_wood_volume_m3"] for c in tree.truth()["pruned"])


def by_tree(report, metric):
    return {m.tree_id: m for m in report.measurements if m.metric == metric}


def test_order2_thinning_cuts():
    count_err, vol_ratio, hits = [], [], []
    for seed in (1, 2):
        before, after, pruned = scans(seed, 3, (2,))
        report = report_for(before, after)
        assert report.session_id == AFTER_ID
        assert report.before_session_id == before.meta.session_id
        cuts = by_tree(report, "pruning_cut_count")
        vol = by_tree(report, "pruned_wood_volume")
        frac = by_tree(report, "pruned_wood_fraction")
        status = by_tree(report, "pruning_status")
        for tid, tree in pruned.items():
            count_err.append(cuts[tid].value_numeric - len(tree.pruned))
            vol_ratio.append(vol[tid].value_numeric / removed_truth(tree))
            assert vol[tid].uncertainty > 0 and frac[tid].uncertainty > 0
            assert 0 < frac[tid].value_numeric < 0.1
            assert frac[tid].unit == "ratio" and vol[tid].unit == "m3"
            assert status[tid].value_category in ("done", "partial")
            assert 0.3 <= status[tid].confidence <= 0.9
        for d in report.details:
            assert d.alignment is not None and d.alignment.applied
            assert d.cuts and all(c.order >= 1 and c.diameter_m > 0 for c in d.cuts)
            assert d.growth_parts == 0
            # True cuts with a detected cut nearby (at the fork or a little out
            # along the removed branch).
            found = np.array([c.xyz for c in d.cuts])
            off = _frame_offset(before, d.tree_id)
            for c in pruned[d.tree_id].pruned:
                gap = np.linalg.norm(found - (np.asarray(c["cut_point"]) + off), axis=1).min()
                hits.append(gap < 0.6)
    assert all(abs(e) <= 2 for e in count_err)
    assert np.mean(np.abs(count_err) <= 1) >= 0.75
    assert np.mean(hits) >= 0.5
    assert 0.4 <= np.median(vol_ratio) <= 1.2
    assert all(0.1 <= r <= 1.5 for r in vol_ratio)


def test_scaffold_removal_is_partial():
    before, after, pruned = scans(7, 1, (1,))
    report = report_for(before, after)
    cuts = by_tree(report, "pruning_cut_count")
    vol = by_tree(report, "pruned_wood_volume")
    status = by_tree(report, "pruning_status")
    for tid, tree in pruned.items():
        assert cuts[tid].value_numeric == 1
        truth = removed_truth(tree)
        assert 0.5 * truth <= vol[tid].value_numeric <= 1.1 * truth
        # One of 4-5 scaffold branches cut, the rest of the crown untouched.
        assert status[tid].value_category == "partial"
    for d in report.details:
        assert d.cuts[0].order == 1 and d.cuts[0].scaffold is not None
        assert d.cuts[0].diameter_m > 0.05


@pytest.mark.parametrize("shift", [(0.0, 0.0, 0.0), (0.03, -0.02, 0.01)])
def test_unpruned_pair_is_not_done(shift):
    before, after, _ = scans(5, 0, shift=shift)
    report = report_for(before, after)
    for m in by_tree(report, "pruning_cut_count").values():
        assert m.value_numeric == 0
    for m in by_tree(report, "pruning_status").values():
        assert m.value_category == "not_done"
    for m in by_tree(report, "pruned_wood_fraction").values():
        assert m.value_numeric < 0.005
    for m in by_tree(report, "pruned_wood_volume").values():
        assert m.uncertainty > 0  # never an exact zero
    for d in report.details:
        assert d.alignment.applied
        # The tree frames share the inventory position: the refinement undoes the shift.
        assert np.allclose(d.alignment.shift_m, -np.asarray(shift), atol=0.012)


def test_propose_status_thresholds():
    assert propose_status(0, 0.0, 0.0, 0, P)[0] == "not_done"
    strict = P.model_copy(update={"partial_min_fraction": 0.005})
    assert propose_status(2, 0.001, 0.5, 0, strict)[0] == "not_done"
    assert propose_status(1, 0.001, 0.25, 0, P)[0] == "partial"
    assert propose_status(1, 0.02, 0.25, 0, P)[0] == "partial"
    assert propose_status(2, 0.3, 0.4, 0, P)[0] == "partial"
    assert propose_status(3, 0.02, 0.5, 0, P)[0] == "done"
    assert propose_status(2, 0.3, 2 / 3, 0, P)[0] == "done"
    sure, unsure = propose_status(6, 0.2, 1.0, 0, P)[1], propose_status(6, 0.2, 1.0, 3, P)[1]
    assert sure > unsure >= 0.3


def test_cli_pruning_with_different_origins(tmp_path, capsys):
    """Sessions in the same absolute frame but with different local origins."""
    before, after, pruned = scans(2, 3, (2,))
    # Move the after cloud's origin 40 m east, 25 m north, 3 m up.
    de, dn, du = 40.0, 25.0, 3.0
    lat, lon = LocalFrame(after.meta.origin_lat, after.meta.origin_lon).to_latlon(de, dn)
    after.points = after.points - np.array([de, dn, du])
    after.meta = after.meta.model_copy(
        update={
            "origin_lat": float(lat),
            "origin_lon": float(lon),
            "origin_height_m": after.meta.origin_height_m + du,
        }
    )
    b_dir, a_dir = tmp_path / "before", tmp_path / "after"
    write_plot_session(b_dir, before)
    write_plot_session(a_dir, after)
    trees = b_dir / "trees.json"
    args = ["lidar", "pruning", str(b_dir), str(a_dir), "--trees", str(trees)]
    assert cli.main(args) == 0
    assert "lidar pruning: 2/2 trees compared" in capsys.readouterr().out
    path = tmp_path / "after.processed" / "lidar" / "pruning.json"
    assert cli.main([*args, "--out", str(tmp_path / "again")]) == 0
    assert path.read_bytes() == (tmp_path / "again" / "pruning.json").read_bytes()

    body = json.loads(path.read_text())
    assert body["schema"] == "orchados.lidar_pruning/1"
    assert body["producer"]["stage"] == "lidar_pruning"
    assert body["producer"]["params_hash"] == PruningParams().params_hash()
    assert (body["method"], body["method_version"]) == ("lidar_pruning", "0.1.0")
    assert body["session_id"] == AFTER_ID
    assert body["before_session_id"] == before.meta.session_id
    assert body["cloud_after"]["origin_lat"] != body["cloud_before"]["origin_lat"]
    for d in body["details"]:
        # Different origins are converted exactly: only noise-level refinement remains.
        assert np.linalg.norm(d["alignment"]["shift_m"]) < 0.012
        assert abs(len(d["cuts"]) - len(pruned[d["tree_id"]].pruned)) <= 2
    statuses = {
        m["value_category"] for m in body["measurements"] if m["metric"] == "pruning_status"
    }
    assert statuses <= {"done", "partial"}


def test_cli_synth_pruned_copy(tmp_path, capsys):
    """synth --pruned-copy writes a before/after pair the pruning stage can compare."""
    before, after = tmp_path / "kis-once", tmp_path / "kis-sonra"
    args = ["lidar", "synth", str(before), "--leafless", "--rows", "productive"]
    assert cli.main([*args, "--pruned-copy", str(after), "--cuts", "2"]) == 0
    assert cli.main(["lidar", "pruning", str(before), str(after)]) == 0
    assert "lidar pruning: 1/1 trees compared" in capsys.readouterr().out
    assert (tmp_path / "kis-sonra.processed" / "lidar" / "pruning.json").is_file()
    with pytest.raises(SystemExit):
        cli.main([*args[:3], "--pruned-copy", str(tmp_path / "x")])
