"""Tree presence signal on crops: clear synthetic views, ambiguous ones, winter, saplings."""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from orchados_pipeline.models import CropRecord, FileRef, Producer
from orchados_pipeline.params import CropParams, PresenceParams
from orchados_pipeline.presence import (
    box,
    project,
    slot_decision,
    slot_view,
    tree_decision,
    tree_view,
    vegetation_mask,
)
from orchados_pipeline.projection import gnomonic_crop

P = PresenceParams()
CAM_H = 2.0
SIZE = 512
SKY, SOIL, GREEN, TRUNK = (235, 200, 150), (90, 130, 160), (40, 160, 40), (30, 60, 100)


def rec(distance: float = 4.0, direction: str = "N", score: float = 0.9) -> CropRecord:
    """A crop sidecar as the crops stage writes it (target 1.5 m, 5 m crown)."""
    cp = CropParams()
    pitch = np.degrees(np.arctan2(cp.target_height_m - CAM_H, distance))
    half = np.degrees(np.arctan2(cp.crown_width_m / 2, distance))
    fov = min(max(2 * half * 1.2, cp.min_fov_deg), cp.max_fov_deg)
    ref = FileRef(path="c.jpg", sha256=direction * 64, size=1, media_type="image/jpeg")
    return CropRecord(
        tree_id="t1",
        slot_code="S1-1",
        direction=direction,
        panorama_id="p",
        panorama_sha256="0" * 64,
        gps_time_ns=0,
        distance_m=distance,
        azimuth_deg=0,
        yaw_in_panorama_deg=0,
        pitch_deg=float(pitch),
        fov_deg=float(fov),
        score=score,
        image=ref,
        producer=Producer(pipeline="t", version="0", params_hash="x", stage="crops"),
    )


def scene(r: CropRecord, trees: list[tuple[float, float, float, float]], noise: int = 20):
    """A crop of a flat world: sky above the horizon, soil below, and trees as
    (distance, crown centre height, crown radius, trunk top) straight ahead."""
    img = np.zeros((SIZE, SIZE, 3), np.uint8)
    _, horizon = project(r, SIZE, CAM_H, 0.0, CAM_H)
    img[: max(0, int(horizon))] = SKY
    img[max(0, int(horizon)) :] = SOIL
    for dist, centre, radius, trunk_top in sorted(trees, key=lambda t: -t[0]):
        far = r.model_copy(update={"distance_m": dist})
        x, y = project(far, SIZE, CAM_H, 0.0, centre)
        xr, _ = project(far, SIZE, CAM_H, radius, centre)
        _, yt = project(far, SIZE, CAM_H, 0.0, centre + radius * 0.8)
        _, yg = project(far, SIZE, CAM_H, 0.0, 0.0)
        _, ytt = project(far, SIZE, CAM_H, 0.0, trunk_top)
        xw, _ = project(far, SIZE, CAM_H, 0.15, centre)
        cv2.rectangle(img, (int(2 * x - xw), int(ytt)), (int(xw), int(yg)), TRUNK, -1)
        cv2.ellipse(img, (int(x), int(y)), (int(xr - x), int(y - yt)), 0, 0, 360, GREEN, -1)
    rng = np.random.default_rng(1)
    n = rng.integers(-noise, noise, size=(SIZE, SIZE, 1), dtype=np.int16)
    return np.clip(img.astype(np.int16) + n, 0, 255).astype(np.uint8)


GROWN = (4.0, 2.8, 1.4, 1.6)  # the target tree: crown 1.4-4.2 m


def test_projection_matches_the_crop_geometry():
    # A crop of a panorama with a marker at a known height must put it where
    # project() says.
    r = rec(5.0)
    w, h = 2048, 1024
    pano = np.zeros((h, w, 3), np.uint8)
    elev = np.degrees(np.arctan2(3.5 - CAM_H, 5.0))
    y = int(round((0.5 - elev / 180) * h))
    pano[y - 1 : y + 2, w // 2 - 1 : w // 2 + 2] = 255
    crop = gnomonic_crop(pano, 0.0, r.pitch_deg, r.fov_deg, SIZE)
    ys, xs = np.nonzero(crop[..., 0] > 100)
    px, py = project(r, SIZE, CAM_H, 0.0, 3.5)
    assert abs(xs.mean() - px) < 2 and abs(ys.mean() - py) < 2


def test_vegetation_mask():
    img = np.array([[SKY, SOIL, GREEN, (10, 30, 10)]], np.uint8)
    assert vegetation_mask(img, P).tolist() == [[False, False, True, False]]  # dark green: no


def test_boxes_are_inside_the_crop_and_ordered():
    r = rec(4.0)
    upper = box(r, SIZE, CAM_H, P.upper_box_m, P.box_half_width_m)
    whole = box(r, SIZE, CAM_H, P.whole_box_m, P.box_half_width_m)
    assert upper[2] < upper[3] <= whole[3] and whole[2] <= upper[2]
    # Same width at the tree; perspective shifts it by a few pixels.
    assert abs(upper[0] - whole[0]) < 8 and abs(upper[1] - whole[1]) < 8
    assert 0 <= whole[0] < whole[1] <= SIZE and 0 <= upper[2] < whole[3] <= SIZE


def test_grown_tree_is_present():
    r = rec(4.0)
    v = tree_view(scene(r, [GROWN]), r, CAM_H, P)
    assert v.state == "present" and v.upper_share > 0.4


def test_missing_tree_on_open_ground_is_absent():
    r = rec(4.0)
    v = tree_view(scene(r, []), r, CAM_H, P)
    assert v.state == "absent" and v.whole_share < 0.01


def test_missing_tree_with_the_next_row_behind_is_ambiguous_not_absent():
    # The neighbour row's tree 8 m further away fills part of the box.
    r = rec(4.0)
    v = tree_view(scene(r, [(12.0, 2.8, 1.4, 1.6)]), r, CAM_H, P)
    assert v.state == "ambiguous"
    assert v.upper_share < P.present_min_share and v.whole_share > P.absent_max_share


def test_young_tree_is_not_absent():
    r = rec(4.0)
    v = tree_view(scene(r, [(4.0, 1.4, 0.6, 0.8)]), r, CAM_H, P)
    assert v.state == "ambiguous"


def test_weak_dark_or_burnt_views_are_unusable():
    r = rec(4.0)
    assert tree_view(scene(r, []), rec(4.0, score=0.1), CAM_H, P).state == "unusable"
    dark = (scene(r, []) * 0.1).astype(np.uint8)
    assert tree_view(dark, r, CAM_H, P).state == "unusable"
    white = np.full((SIZE, SIZE, 3), 252, np.uint8)
    assert tree_view(white, r, CAM_H, P).state == "unusable"


def _views(*states_dirs):
    r = rec(4.0)
    img = {
        "present": scene(r, [GROWN]),
        "absent": scene(r, []),
        "ambiguous": scene(r, [(12.0, 2.8, 1.4, 1.6)]),
    }
    out = []
    for state, d in states_dirs:
        rr = rec(4.0, direction=d, score=0.1 if state == "unusable" else 0.9)
        out.append(tree_view(img.get(state, img["absent"]), rr, CAM_H, P))
        assert out[-1].state == state
    return out


@pytest.mark.parametrize(
    ("views", "expected"),
    [
        ([("present", "N"), ("absent", "S")], "yes"),
        ([("absent", "N"), ("absent", "S")], "no"),
        ([("absent", "N"), ("absent", "N")], "unsure"),  # one side only
        ([("absent", "N")], "unsure"),
        ([("absent", "N"), ("ambiguous", "S")], "unsure"),
        # Two empty sides; the third sees the next row behind: still "no".
        ([("absent", "N"), ("absent", "W"), ("ambiguous", "S")], "no"),
        ([("absent", "N"), ("absent", "W"), ("present", "S")], "yes"),
        ([("absent", "N"), ("absent", "S"), ("unusable", "E")], "no"),
        ([("unusable", "N"), ("unusable", "S")], "unsure"),
    ],
)
def test_tree_decision(views, expected):
    value, _ = tree_decision(_views(*views), leafy=True, p=P)
    assert value == expected


def test_winter_is_always_unsure():
    views = _views(("absent", "N"), ("absent", "S"))
    assert tree_decision(views, leafy=False, p=P) == ("unsure", "leafless_season")
    assert tree_decision(_views(("present", "N")), leafy=False, p=P)[0] == "unsure"


def test_sapling_in_an_empty_slot():
    r = rec(4.0)
    sapling = (4.0, 0.9, 0.5, 0.6)
    planted = [slot_view(scene(r, [sapling]), rec(4.0, direction=d), CAM_H, P) for d in "NS"]
    assert [v.state for v in planted] == ["present", "present"]
    assert slot_decision(planted, True, P)[0] == "yes"
    empty = [slot_view(scene(r, []), rec(4.0, direction=d), CAM_H, P) for d in "NS"]
    assert slot_decision(empty, True, P)[0] == "no"
    assert slot_decision(planted[:1] + empty[:1], True, P)[0] == "unsure"
    assert slot_decision(planted, False, P) == ("unsure", "leafless_season")


def test_processed_run_sees_every_drawn_tree(processed_run):
    from orchados_pipeline.models import PresenceReport, read_model
    from orchados_pipeline.presence import METHOD, METHOD_VERSION

    ctx, _, truth = processed_run
    rep = read_model(PresenceReport, ctx.presence_path)
    assert (rep.method, rep.method_version, rep.status) == (METHOD, METHOD_VERSION, "ok")
    assert rep.leafy and rep.month == 10  # the synthetic visit is in October
    assert {r.slot_code for r in rep.trees} == {t["slot_code"] for t in truth.trees}
    # Every tree is drawn, so none is "no"; most are clearly seen.
    assert all(r.value != "no" for r in rep.trees)
    assert sum(r.value == "yes" for r in rep.trees) >= len(rep.trees) - 1
    assert rep.slots == []  # the default trees file has no empty slots


def _run_synthetic(tmp_path, **cfg_kw):
    from conftest import fast_params

    from orchados_pipeline.context import RunContext
    from orchados_pipeline.models import PresenceReport, read_model
    from orchados_pipeline.pipeline import run_all
    from orchados_pipeline.synthetic import SyntheticConfig, make_session

    make_session(tmp_path / "s", SyntheticConfig(**cfg_kw))
    ctx = RunContext.create(tmp_path / "s", tmp_path / "out", fast_params())
    run_all(ctx)
    return {
        r.slot_code: r for r in read_model(PresenceReport, ctx.presence_path).trees
    }, read_model(PresenceReport, ctx.presence_path)


def test_synthetic_cut_trees_and_a_planted_slot(tmp_path):
    # S1-1 and S3-2 stand in the open (outer rows): seen empty from two sides.
    # S2-3 is cut too, but the trees around it make every side ambiguous.
    trees, rep = _run_synthetic(tmp_path, missing=("S1-1", "S2-3", "S3-2"), planted=("S2-2",))
    assert trees["S1-1"].value == "no" and trees["S3-2"].value == "no"
    assert trees["S2-3"].value == "unsure"
    assert all(
        r.value == "yes" for code, r in trees.items() if code not in ("S1-1", "S2-3", "S3-2")
    )
    assert "S2-2" not in trees  # an empty slot now
    (slot,) = rep.slots
    assert (slot.slot_code, slot.subject, slot.value) == ("S2-2", "slot", "yes")


def test_synthetic_winter_scan_is_unsure(tmp_path):
    from datetime import UTC, datetime

    trees, rep = _run_synthetic(
        tmp_path, missing=("S1-1",), start_utc=datetime(2027, 1, 15, 9, 0, tzinfo=UTC)
    )
    assert not rep.leafy and rep.month == 1
    assert {r.value for r in trees.values()} == {"unsure"}
    assert {r.reason for r in trees.values()} == {"leafless_season"}
