"""Synthetic LiDAR crown measurements of the demo (demo/lidar.py, dataset version 4):
the values come from the drawn trees, so the portal's crown drawing
(apps/web/src/lib/portal/crown-guide.ts) lands on them."""

from __future__ import annotations

import json
import math

import cv2
import numpy as np
import pytest

from orchados_pipeline.demo import build as demo_build
from orchados_pipeline.demo import dataset, lidar
from orchados_pipeline.demo.render import Ellipsoid, tree_shape
from orchados_pipeline.lidar import crown

RAD = math.pi / 180


@pytest.fixture(scope="module")
def built():
    root, _manifest = demo_build.build("test", log=lambda _m: None)  # reuses the cache
    return root, dataset.load()


def _report(root, visit_key: str) -> dict:
    return json.loads((root / "runs" / visit_key / lidar.REPORT_FILE).read_text("utf-8"))


def _values(report: dict) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for m in report["measurements"]:
        if m["metric"] in lidar.CODES:
            out.setdefault(m["tree_id"], {})[m["metric"]] = m["value_numeric"]
    return out


def project_to_crop(crop: dict, camera_height_m: float, x: float, z: float) -> tuple[float, float]:
    """crown-guide.ts projectToCrop: normalized (u right, v down) of a guide point."""
    up = z - camera_height_m
    p = crop["pitch_deg"] * RAD
    y = -up * math.cos(p) + crop["distance_m"] * math.sin(p)
    depth = up * math.sin(p) + crop["distance_m"] * math.cos(p)
    f = 0.5 / math.tan(crop["fov_deg"] * RAD / 2)
    return 0.5 + f * x / depth, 0.5 + f * y / depth


def test_report_is_the_crown_stage(built):
    root, ds = built
    for v in ds.summer_scans():
        rep = crown.CrownReport.model_validate(_report(root, v.key))
        assert (rep.method, rep.method_version) == ("lidar_crown", crown.METHOD_VERSION)
        assert rep.producer.params_hash == crown.CrownParams().params_hash()
        assert rep.session_id == v.id and rep.parcel_id == v.parcel.id
        assert {d.tree_id for d in rep.details} == {t.id for t in lidar.present_trees(ds, v)}


def test_measuring_does_not_depend_on_workers(built):
    root, ds = built
    v = ds.visit("B-SCN26")
    one = lidar.measure_visit(ds, v, 1).model_dump(mode="json", by_alias=True)
    two = lidar.measure_visit(ds, v, 2).model_dump(mode="json", by_alias=True)
    assert one == two
    assert one["measurements"] == _report(root, v.key)["measurements"]


def test_height_is_the_top_of_the_drawn_crown(built):
    root, ds = built
    for v in ds.summer_scans():
        values = _values(_report(root, v.key))
        classes = ds.classes(v)
        for t in lidar.present_trees(ds, v):
            cls = classes[t.code]
            shape = tree_shape(t, cls, dataset.tree_values(v, t, cls), v.key)
            leaves = [p for p in shape.prims if isinstance(p, Ellipsoid) and p.scale > 0]
            if not leaves:  # dead: bare branches
                continue
            top = max(float(e.c[2] + e.r[2]) for e in leaves)
            assert top - 0.3 <= values[t.id]["tree_height"] <= top + 0.1, (v.key, t.code)


def test_crown_lines_land_on_the_drawn_tree(built):
    """The guide over the built crops of healthy trees seen from 5 m or more: the top
    tick at the highest leaves above the trunk, the bracket ends on the crown."""
    root, ds = built
    tops, ends = [], []
    for v in ds.summer_scans():
        values = _values(_report(root, v.key))
        classes = ds.classes(v)
        crops = json.loads((root / "runs" / v.key / "crops.json").read_text("utf-8"))["crops"]
        for c in crops:
            if classes[c["slot_code"]] != "healthy" or c["distance_m"] < 5.0:
                continue
            val = values[c["tree_id"]]
            img = cv2.imread(str(root / "files" / c["image"]["sha256"])).astype(np.int32)
            n = img.shape[0]
            b, g, r = img[..., 0], img[..., 1], img[..., 2]
            leaf = (g > r * 1.12) & (g > b * 1.3)
            h = dataset.CAMERA_HEIGHT_M
            _u, v_top = project_to_crop(c, h, 0.0, val["tree_height"])
            column = leaf[:, int(n * 0.45) : int(n * 0.55)].any(axis=1)
            tops.append(abs(float(np.argmax(column)) / n - v_top))
            mid = (val["crown_base_height"] + val["tree_height"]) / 2
            for side in (-1, 1):
                u, vm = project_to_crop(c, h, side * val["crown_diameter"] / 2, mid)
                # Leaves within 5 % of the image inwards of the bracket end.
                x0, x1 = sorted((u, u - side * 0.05))
                y = int(vm * n)
                patch = leaf[y - 2 : y + 3, max(0, int(x0 * n)) : int(x1 * n) + 1]
                ends.append(bool(patch.any()))
    assert len(tops) > 100
    assert float(np.median(tops)) < 0.03 and max(tops) < 0.12
    assert sum(ends) / len(ends) > 0.9
