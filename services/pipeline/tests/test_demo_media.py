"""Demo media: determinism, panorama convention, stamps, size budget, build time."""

from __future__ import annotations

import math
import time

import cv2
import numpy as np
import pytest

from orchados_pipeline.demo import build as demo_build
from orchados_pipeline.demo import closeups, dataset, render
from orchados_pipeline.demo.dataset import CAMERA_HEIGHT_M


@pytest.fixture(scope="module")
def fresh_build(tmp_path_factory):
    """The test profile built from scratch, timed."""
    out = tmp_path_factory.mktemp("demo") / "v1-test"
    t0 = time.monotonic()
    root, manifest = demo_build.build("test", out, force=True, log=lambda _m: None)
    return root, manifest, time.monotonic() - t0


def test_test_profile_builds_under_90_s(fresh_build):
    _root, _manifest, seconds = fresh_build
    assert seconds < 90, f"test profile build took {seconds:.0f} s"


def test_test_profile_is_at_most_10_mb(fresh_build):
    _root, manifest, _s = fresh_build
    assert demo_build.total_bytes(manifest) <= 10_000_000


def test_full_profile_estimate_is_at_most_150_mb(fresh_build):
    """Scale the test profile's bytes per kind by the pixel ratio of the full profile.

    JPEG and WebP bytes grow slower than the pixel count on smooth synthetic
    content, so this overestimates (the full build is ~60 MB)."""
    _root, manifest, _s = fresh_build
    test, full = render.PROFILES["test"], render.PROFILES["full"]
    ratio = {
        "panorama": full.full[0] * full.full[1] / (test.full[0] * test.full[1]),
        "preview": full.preview[0] * full.preview[1] / (test.preview[0] * test.preview[1]),
        "tree_crop": full.crop**2 / test.crop**2,
        "closeup": full.closeup[0] * full.closeup[1] / (test.closeup[0] * test.closeup[1]),
    }
    estimate = sum(f["bytes"] * ratio[f["kind"]] ** 0.75 for f in manifest["files"])
    assert estimate <= 150_000_000, f"full profile estimate {estimate / 1e6:.0f} MB"


def test_build_is_deterministic(fresh_build, tmp_path):
    """A second build of one visit gives the same bytes on the same machine."""
    _root, manifest, _s = fresh_build
    _root2, again = demo_build.build(
        "test", tmp_path / "again", force=True, log=lambda _m: None, visits=("B-SCN26",)
    )
    first = {f["key"]: f["sha256"] for f in manifest["files"]}
    second = {f["key"]: f["sha256"] for f in again["files"]}
    b26 = {k for k in second if k.startswith("B26")}
    assert b26 and all(first[k] == second[k] for k in b26)
    assert again["closeups"] == manifest["closeups"]


def test_every_file_is_distinct_and_named(fresh_build):
    _root, manifest, _s = fresh_build
    shas = [f["sha256"] for f in manifest["files"]]
    keys = [f["key"] for f in manifest["files"]]
    assert len(set(shas)) == len(shas)
    assert len(set(keys)) == len(keys)
    assert manifest["dataset_sha256"] == demo_build.manifest_sha(manifest)


def test_sizes_match_the_profile(fresh_build):
    root, manifest, _s = fresh_build
    p = render.PROFILES["test"]
    want = {
        "panorama": p.full,
        "preview": p.preview,
        "tree_crop": (p.crop, p.crop),
        "closeup": p.closeup,
    }
    for f in manifest["files"][::25]:
        img = cv2.imread(str(root / "files" / f["sha256"]), cv2.IMREAD_COLOR)
        assert (img.shape[1], img.shape[0]) == want[f["kind"]] == (f["width"], f["height"])


def _one_tree_scene(theta_deg: float, dist: float = 6.0):
    """The B scan's scene with a single healthy tree at world azimuth theta from (10, 10)."""
    ds = dataset.load()
    v = ds.visit("B-SCN26")
    scene = render.make_scene(ds, v, render.PROFILES["test"])
    tree = ds.trees["B"][5]
    p = v.parcel
    phi = math.radians(theta_deg - p.row_azimuth_deg)
    x, y = 10 + dist * math.cos(phi), 10 - dist * math.sin(phi)
    tree.dx, tree.dy = x - tree.slot.xy[0], y - tree.slot.xy[1]
    scene.shapes = [render.tree_shape(tree, "healthy", {}, v.key)]
    return scene, tree


@pytest.mark.parametrize("theta", [10.0, 100.0, 235.0])
@pytest.mark.parametrize("heading", [0.0, 80.0, 300.0])
def test_tree_lands_at_its_bearing(theta, heading):
    """Centre column faces the heading, azimuth grows to the right (pipeline convention)."""
    scene, tree = _one_tree_scene(theta)
    img = render.render(scene, 10.0, 10.0, heading, "T")
    h, w = img.shape[:2]
    yaw = (theta - heading + 180) % 360 - 180
    col = int((yaw / 360 + 0.5) * w)
    crown_z = tree.height_m - 1.6 * tree.crown_r_m + tree.crown_r_m * 0.75
    el = math.degrees(math.atan2(crown_z - CAMERA_HEIGHT_M, 6.0))
    row = int((0.5 - el / 180) * h)
    patch = img[row - 3 : row + 4, [(col + d) % w for d in range(-3, 4)]].reshape(-1, 3).astype(int)
    b, g, r = patch.mean(axis=0)
    assert g > r and g > b, f"no crown at column {col} (BGR {b:.0f}, {g:.0f}, {r:.0f})"
    # Half a turn away there is no tree.
    far = img[row, (col + w // 2) % w].astype(int)
    assert not (far[1] > far[2] + 10 and far[1] > far[0] + 10)


def test_nadir_stamp():
    scene, _tree = _one_tree_scene(45.0)
    img = render.render(scene, 10.0, 10.0, 0.0, "A26-P00")
    h = img.shape[0]
    disc = img[int(h * (0.5 + 75 / 180)) :]
    assert disc.mean() < 90  # dark disc
    text_rows = img[int(h * (0.5 + 76 / 180)) : int(h * (0.5 + 80 / 180))]
    assert (text_rows > 220).all(axis=2).sum() > 50  # white letters


def test_corner_stamp_differs_by_key():
    base = np.full((256, 256, 3), 120, np.uint8)
    a, b = render.corner_stamp(base, "A26-S1-1-N"), render.corner_stamp(base, "A26-S1-2-N")
    assert not np.array_equal(a, b)
    assert (a[-40:, :] > 220).any()


@pytest.mark.parametrize("kind", closeups.KINDS)
def test_closeups(kind):
    img = closeups.render_closeup(kind, f"T-{kind}", (400, 300))
    assert img.shape == (300, 400, 3)
    again = closeups.render_closeup(kind, f"T-{kind}", (400, 300))
    assert np.array_equal(img, again)
    assert kind in closeups.SHOT_CODE


def test_sun_is_up_in_the_morning_of_july():
    az, el = render.sun_position(dataset.utc("2026-07-14 06:30"), 37.14, 37.56)
    assert 60 < az < 110 and 30 < el < 50
