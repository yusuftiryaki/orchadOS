import cv2
import numpy as np

from orchados_pipeline.frames import select_slices, sharpness
from orchados_pipeline.models import FrameCandidate, FrameSelection, SolutionQuality, read_model
from orchados_pipeline.params import FrameParams


def _cand(i, slice_index, sharp, eligible=True):
    return FrameCandidate(
        video="v.mp4",
        frame_index=i,
        camera_s=i / 10,
        gps_time_ns=i,
        lat=0,
        lon=0,
        height_m=0,
        heading_deg=0,
        along_track_m=slice_index * 3.5,
        position_quality=SolutionQuality.fix,
        sd_h_m=0.01,
        sharpness=sharp,
        eligible=eligible,
        slice_index=slice_index,
    )


def test_sharpness_ranks_blur_lower():
    rng = np.random.default_rng(3)
    img = rng.integers(0, 255, size=(480, 960, 3), dtype=np.uint8)
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    p = FrameParams()
    assert sharpness(blurred, p) < 0.1 * sharpness(img, p)


def test_sharpness_independent_of_resolution():
    rng = np.random.default_rng(4)
    small = cv2.GaussianBlur(rng.integers(0, 255, (480, 960, 3), dtype=np.uint8), (0, 0), 1)
    large = cv2.resize(small, (1920, 960), interpolation=cv2.INTER_LINEAR)
    p = FrameParams()
    assert abs(sharpness(small, p) - sharpness(large, p)) / sharpness(small, p) < 0.25


def test_select_one_per_slice_and_report_gaps():
    cands = [
        _cand(0, 0, 10),
        _cand(1, 0, 30),
        _cand(2, 0, 50, eligible=False),
        _cand(3, 1, 5),
        _cand(4, 3, 7),
        _cand(5, 3, 9),
    ]
    empty = select_slices(cands, 3.5)
    assert [c.frame_index for c in cands if c.selected] == [1, 3, 5]
    assert empty == [2]


def test_selection_on_synthetic_session(processed_run):
    ctx, _, truth = processed_run
    sel = read_model(FrameSelection, ctx.frames_path)
    chosen = sel.selected()
    blurred = set(truth.blurred_frames)
    # Blurred frames are among the candidates but never chosen.
    assert any(c.frame_index in blurred for c in sel.candidates)
    assert not any(c.frame_index in blurred for c in chosen)
    blurred_scores = [c.sharpness for c in sel.candidates if c.frame_index in blurred]
    sharp_scores = [c.sharpness for c in sel.candidates if c.frame_index not in blurred]
    assert max(blurred_scores) < min(sharp_scores)
    # One panorama per 3.5 m slice over the whole path, none missing.
    slices = [c.slice_index for c in chosen]
    assert slices == sorted(set(slices))
    assert sel.empty_slices == []
    assert len(chosen) == int(truth.path_length_m // 3.5) + 1
    # No QR frames inside the scan window.
    assert not set(truth.qr_frames) & {c.frame_index for c in sel.candidates}


def test_heading_follows_direction_of_travel(processed_run):
    ctx, _, _ = processed_run
    sel = read_model(FrameSelection, ctx.frames_path)
    north = [c for c in sel.candidates if 5 < c.along_track_m < 25]
    south = [c for c in sel.candidates if 41 < c.along_track_m < 61]
    assert all(min(c.heading_deg, 360 - c.heading_deg) < 3 for c in north)
    assert all(abs(c.heading_deg - 180) < 3 for c in south)
