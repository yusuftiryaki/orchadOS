"""`.insv` input through the Insta360 Media SDK, with a fake MediaSDKTest.

The fake follows the documented command line (MediaSDK 3.1.5 example/main.cc):
it decodes the requested frames of the input with OpenCV and writes them as
JPEGs. The real SDK has not been run here; see insta360.py for what is assumed.
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import sys
from pathlib import Path

import pytest
from conftest import fast_params

from orchados_pipeline.context import RunContext
from orchados_pipeline.insta360 import Insta360Error, export_frames, find_tool
from orchados_pipeline.params import Insta360Params
from orchados_pipeline.pipeline import run_all

FAKE = r"""#!{python}
import sys, os, cv2
args = sys.argv[1:]
log = os.environ.get("FAKE_SDK_LOG")
if log:
    with open(log, "a") as f:
        f.write(" ".join(args) + "\n")
if os.environ.get("FAKE_SDK_FAIL"):
    print("error: decoder failed")
    sys.exit(0)
def opt(name):
    return args[args.index(name) + 1]
inp, out = opt("-inputs"), opt("-image_sequence_dir")
want = [int(x) for x in opt("-export_frame_index").split("-")]
skip = int(os.environ.get("FAKE_SDK_SKIP", "0"))
cap = cv2.VideoCapture(inp)
i = 0
while want and cap.grab():
    if i in want:
        ok, frame = cap.retrieve()
        if skip:
            skip -= 1
        else:
            cv2.imwrite(os.path.join(out, "frame_%06d.jpg" % i), frame)
        want.remove(i)
    i += 1
print("process = 100%")
"""


@pytest.fixture
def fake_sdk(tmp_path, monkeypatch):
    bindir = tmp_path / "sdk"
    bindir.mkdir()
    tool = bindir / "MediaSDKTest"
    tool.write_text(FAKE.replace("{python}", sys.executable))
    tool.chmod(tool.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / "sdk.log"
    monkeypatch.setenv("ORCHADOS_INSTA360_SDK", str(bindir))
    monkeypatch.setenv("FAKE_SDK_LOG", str(log))
    return log


@pytest.fixture
def insv_session(synthetic_session, tmp_path):
    """The synthetic session with its video renamed to .insv (the fake SDK decodes it)."""
    src, truth = synthetic_session
    dst = tmp_path / "insv_session"
    shutil.copytree(src, dst)
    (dst / "video" / "VID_0001.mp4").rename(dst / "video" / "VID_0001.insv")
    return dst, truth


def test_no_sdk_means_none(monkeypatch, tmp_path):
    monkeypatch.setenv("ORCHADOS_INSTA360_SDK", str(tmp_path / "nowhere"))
    if not Path("/opt/MediaSDK-3.1.5-linux/bin/MediaSDKTest").exists():
        assert find_tool() is None
        with pytest.raises(Insta360Error, match="Media SDK"):
            export_frames([tmp_path / "a.insv"], [1], tmp_path / "o", Insta360Params())


def test_export_maps_images_to_frame_indices(fake_sdk, synthetic_session, tmp_path):
    session, _ = synthetic_session
    video = session / "video" / "VID_0001.mp4"
    images = export_frames([video], [40, 5, 20, 5], tmp_path / "o", Insta360Params(cuda=False))
    assert sorted(images) == [5, 20, 40]
    assert images[20].name == "frame_000020.jpg"
    call = fake_sdk.read_text()
    assert "-export_frame_index 5-20-40" in call
    assert "-output_size 3840x1920" in call
    assert "-disable_cuda" in call and "-stitch_type optflow" in call


def test_missing_images_and_sdk_errors_are_reported(fake_sdk, synthetic_session, tmp_path):
    session, _ = synthetic_session
    video = session / "video" / "VID_0001.mp4"
    os.environ["FAKE_SDK_SKIP"] = "1"
    try:
        with pytest.raises(Insta360Error, match="wrote 1 images for 2"):
            export_frames([video], [1, 2], tmp_path / "o", Insta360Params())
    finally:
        del os.environ["FAKE_SDK_SKIP"]
    os.environ["FAKE_SDK_FAIL"] = "1"
    try:
        with pytest.raises(Insta360Error, match="decoder failed"):
            export_frames([video], [1], tmp_path / "o", Insta360Params())
    finally:
        del os.environ["FAKE_SDK_FAIL"]


def test_insv_session_is_stitched_frame_by_frame(fake_sdk, insv_session, tmp_path):
    session, _ = insv_session
    ctx = RunContext.create(session, tmp_path / "out", fast_params())
    out = run_all(ctx)
    panos = [a for a in out.assets if a.kind == "panorama"]
    assert panos and (panos[0].file.width, panos[0].file.height) == (3840, 1920)
    side = json.loads((ctx.run_dir / panos[0].sidecar.path).read_text())
    assert side["source_video"] == "video/VID_0001.insv"
    assert any(a.kind == "tree_crop" for a in out.assets)
    # One SDK call per video, for the selected frames only; nothing left behind.
    calls = fake_sdk.read_text().splitlines()
    assert len(calls) == 1
    assert len(calls[0].split("-export_frame_index ")[1].split()[0].split("-")) == len(panos)
    assert not (ctx.run_dir / "tmp" / "stitch").exists()


def test_insv_without_sdk_is_an_ingest_problem(insv_session, tmp_path, monkeypatch):
    if Path("/opt/MediaSDK-3.1.5-linux/bin/MediaSDKTest").exists():
        pytest.skip("a real SDK is installed here")
    monkeypatch.setenv("ORCHADOS_INSTA360_SDK", str(tmp_path / "nowhere"))
    session, _ = insv_session
    from orchados_pipeline.ingest import IngestError

    with pytest.raises(IngestError, match="Media SDK"):
        run_all(RunContext.create(session, tmp_path / "out", fast_params()))
