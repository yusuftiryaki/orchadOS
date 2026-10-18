import math

import cv2
import numpy as np
import pytest

from orchados_pipeline.crops import direction_of, view_geometry
from orchados_pipeline.geo import LocalFrame, bearing_deg
from orchados_pipeline.models import (
    CropSet,
    FileRef,
    PanoramaRecord,
    Pose,
    Producer,
    Tree,
    read_model,
)
from orchados_pipeline.params import CropParams
from orchados_pipeline.projection import direction_to_pixel, gnomonic_crop


def _marker_pano(yaw, pitch, w=2048, h=1024):
    pano = np.zeros((h, w, 3), np.uint8)
    x, y = direction_to_pixel(yaw, pitch, w, h)
    cv2.circle(pano, (int(x), int(y)), 12, (0, 0, 255), -1)
    return pano


def _center_is_red(img):
    c = img.shape[0] // 2
    patch = img[c - 3 : c + 4, c - 3 : c + 4].reshape(-1, 3).mean(axis=0)
    return patch[2] > 200 and patch[0] < 50


@pytest.mark.parametrize("yaw,pitch", [(0, 0), (90, 0), (-135, -10), (179, 5), (45, 20)])
def test_gnomonic_crop_looks_at_requested_direction(yaw, pitch):
    pano = _marker_pano(yaw, pitch)
    crop = gnomonic_crop(pano, yaw, pitch, 60, 256)
    assert _center_is_red(crop)
    # Looking the other way does not see the marker.
    assert not _center_is_red(gnomonic_crop(pano, yaw + 180, pitch, 60, 256))


def test_gnomonic_crop_right_is_clockwise():
    pano = _marker_pano(20, 0)
    crop = gnomonic_crop(pano, 0, 0, 90, 256)
    ys, xs = np.nonzero(crop[..., 2] > 200)
    assert xs.mean() > 128 + 30 and abs(ys.mean() - 128) < 3


def _pano(lat, lon, heading):
    ref = FileRef(path="p.webp", sha256="0" * 64, size=1, media_type="image/webp")
    prod = Producer(pipeline="x", version="0", params_hash="0", stage="t")
    return PanoramaRecord(
        panorama_id="p",
        session_id="s",
        gps_time_ns=0,
        utc="",
        quality_score=1.0,
        sharpness=1,
        pose=Pose(lat=lat, lon=lon, height_m=0, heading_deg=heading, sd_h_m=0.01, quality="fix"),
        source_video="v",
        source_video_sha256="0",
        frame_index=0,
        camera_s=0,
        image=ref,
        preview=ref,
        producer=prod,
    )


def test_view_geometry_angle_and_distance():
    frame = LocalFrame(37.06, 37.38)
    tlat, tlon = frame.to_latlon(3.0, 4.0)  # tree 3 m east, 4 m north of the camera
    tree = Tree(tree_id="t", slot_code="S1-1", lat=float(tlat), lon=float(tlon))
    g = view_geometry(_pano(37.06, 37.38, heading=90.0), tree, 2.0, CropParams(), frame)
    assert g["distance_m"] == pytest.approx(5.0, abs=1e-3)
    assert g["azimuth_deg"] == pytest.approx(bearing_deg(3, 4), abs=1e-3)
    assert g["yaw_deg"] == pytest.approx(math.degrees(math.atan2(3, 4)) - 90, abs=1e-3)
    assert g["pitch_deg"] == pytest.approx(math.degrees(math.atan2(-0.5, 5)), abs=1e-3)
    assert g["direction"] == "S"  # camera is south-west of the tree, mostly south


def test_direction_sectors():
    assert [direction_of(b) for b in (0, 44, 46, 135, 180, 269, 316)] == [
        "N",
        "N",
        "E",
        "S",
        "S",
        "W",
        "N",
    ]


def test_crops_on_synthetic_session(processed_run):
    ctx, _, truth = processed_run
    cset = read_model(CropSet, ctx.crops_path)
    assert cset.trees_without_crops == []
    trees = {t["tree_id"]: t for t in truth.trees}
    # Middle row (between both corridors) is seen from east and west.
    middle = {c.direction for c in cset.crops if trees[c.tree_id]["e"] == 3.0}
    assert {"E", "W"} <= middle
    for c in cset.crops:
        img = cv2.imread(str(ctx.run_dir / c.image.path))
        assert img.shape == (1024, 1024, 3)
        # The synthetic tree trunk is drawn in brown (30, 60, 100) BGR, crown in green:
        # the vertical centre line of the crop must hit the tree.
        column = img[:, 500:524].reshape(-1, 3).astype(int)
        green = (column[:, 1] > 130) & (column[:, 0] < 80) & (column[:, 2] < 80)
        trunk = (
            (abs(column[:, 0] - 30) < 25)
            & (abs(column[:, 1] - 60) < 25)
            & (abs(column[:, 2] - 100) < 25)
        )
        assert green.mean() + trunk.mean() > 0.1, c.image.path
        assert c.distance_m <= CropParams().max_distance_m
