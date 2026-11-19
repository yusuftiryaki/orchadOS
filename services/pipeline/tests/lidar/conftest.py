"""Synthetic moving scans shared by the registration tests (made once per test run).

Tests that register write into their own copy: link_session() makes a session folder
whose raw files are symlinks to a shared one, with its own <copy>.processed/.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from orchados_pipeline.lidar.frontend.fake import FakeFrontend
from orchados_pipeline.lidar.registration import run as register
from orchados_pipeline.lidar.synth_moving import PPK_DIR, MovingConfig, make_moving_session

# 18 trees, every one passed on both sides; enough for accepted_auto (>= 10 trees checked).
# IMU at 150 Hz (above half the expected 250 Hz) keeps the MCAP quick to read.
GOOD = MovingConfig(rows=3, trees_per_row=6, speed_mps=3.0, points_per_s=6000, imu_hz=150.0)
# 8 trees: too few for accepted_auto, quick.
SMALL = MovingConfig(rows=2, trees_per_row=4, points_per_s=2000, imu_hz=150.0)


@pytest.fixture(scope="session")
def good_session(tmp_path_factory):
    dest = tmp_path_factory.mktemp("good") / "session"
    return dest, make_moving_session(dest, GOOD)


@pytest.fixture(scope="session")
def good_registration(good_session, tmp_path_factory):
    """The good session registered once, in a linked copy."""
    src, truth = good_session
    dest = link_session(src, tmp_path_factory.mktemp("good-reg") / "session")
    folder, report = register(dest, frontend=FakeFrontend())
    return dest, truth, folder, report


@pytest.fixture(scope="session")
def small_ppk(tmp_path_factory):
    dest = tmp_path_factory.mktemp("small-ppk") / "session"
    return dest, make_moving_session(dest, SMALL)


@pytest.fixture(scope="session")
def small_nav(tmp_path_factory):
    dest = tmp_path_factory.mktemp("small-nav") / "session"
    cfg = MovingConfig(**{**SMALL.__dict__, "ppk": False})
    return dest, make_moving_session(dest, cfg)


def link_session(
    src: Path,
    dest: Path,
    *,
    recording: dict | None | bool = True,
    trees: bool = True,
    ppk_points=None,
) -> Path:
    """A session folder linking src's files. recording: True keeps recording.json, False
    drops it, a dict replaces it. ppk_points: a function filtering the PPK trajectory's
    points (a copy is written), None links it unchanged."""
    dest.mkdir(parents=True)
    for name in ("session.json", "truth.json", "gnss"):
        (dest / name).symlink_to(src / name)
    if trees:
        (dest / "trees.json").symlink_to(src / "trees.json")
    raw = dest / "lidar" / "raw"
    raw.mkdir(parents=True)
    for bag in (src / "lidar" / "raw").iterdir():
        if bag.is_dir():
            (raw / bag.name).symlink_to(bag)
    rec_src = src / "lidar" / "raw" / "recording.json"
    if recording is True:
        shutil.copy(rec_src, raw / "recording.json")
    elif isinstance(recording, dict):
        (raw / "recording.json").write_text(json.dumps(recording))
    ppk_src = src.parent / f"{src.name}.processed" / PPK_DIR
    if ppk_src.is_dir():
        ppk_dest = dest.parent / f"{dest.name}.processed" / PPK_DIR
        ppk_dest.parent.mkdir(parents=True)
        if ppk_points is None:
            ppk_dest.symlink_to(ppk_src)
        else:
            ppk_dest.mkdir()
            body = json.loads((ppk_src / "trajectory.json").read_text())
            body["points"] = [p for p in body["points"] if ppk_points(p)]
            (ppk_dest / "trajectory.json").write_text(json.dumps(body))
    return dest
