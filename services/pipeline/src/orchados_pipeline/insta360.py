"""Insta360 `.insv` recordings through the vendor's Media SDK.

The SDK is not part of this repository (no licence file came with it). It is
found through ORCHADOS_INSTA360_SDK, the directory that holds the SDK's
`MediaSDKTest` tool (e.g. /opt/MediaSDK-3.1.5-linux/bin), or at the default
location the SDK's .deb installs to.

Only the selected frames are stitched: `MediaSDKTest -image_sequence_dir <dir>
-export_frame_index 12-57-103` writes one equirectangular image per frame
index. The pipeline never exports the whole 8K video.

Status: built against the SDK's documented command line (example/main.cc in
MediaSDK 3.1.5); NOT yet run on a real `.insv` file. Two things are assumed and
must be checked on the first real recording (docs/gorevler/insta360-sdk.md):
- the exported images sort in frame order by the number in their file name;
- the image's centre column faces the camera front (FlowState and direction
  lock are left off so the orientation follows the camera, as `heading_deg`
  assumes).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

from .params import Insta360Params

DEFAULT_SDK_BIN = Path("/opt/MediaSDK-3.1.5-linux/bin")
TOOL = "MediaSDKTest"
INSV = ".insv"
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


class Insta360Error(RuntimeError):
    pass


def is_insv(path: str | Path) -> bool:
    return Path(path).suffix.lower() == INSV


def find_tool() -> Path | None:
    """MediaSDKTest from ORCHADOS_INSTA360_SDK, else the .deb's location; None if absent."""
    env = os.environ.get("ORCHADOS_INSTA360_SDK")
    candidates = [Path(env)] if env else []
    candidates.append(DEFAULT_SDK_BIN)
    for c in candidates:
        tool = c if c.is_file() else c / TOOL
        if tool.is_file() and os.access(tool, os.X_OK):
            return tool
    return None


def require_tool() -> Path:
    tool = find_tool()
    if tool is None:
        raise Insta360Error(
            ".insv recordings need the Insta360 Media SDK: install it or set "
            "ORCHADOS_INSTA360_SDK to the directory holding MediaSDKTest"
        )
    return tool


def _frame_number(path: Path) -> int:
    nums = re.findall(r"\d+", path.stem)
    return int(nums[-1]) if nums else -1


def export_frames(
    inputs: list[Path], indices: list[int], out_dir: Path, params: Insta360Params
) -> dict[int, Path]:
    """Stitches the given frame indices; returns {frame index: equirectangular image}."""
    wanted = sorted(set(indices))
    if not wanted:
        return {}
    tool = require_tool()
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    w, h = params.output_size
    cmd = [str(tool), "-inputs", *[str(p) for p in inputs]]
    cmd += ["-image_sequence_dir", str(out_dir), "-image_type", "jpg"]
    cmd += ["-export_frame_index", "-".join(str(i) for i in wanted)]
    cmd += ["-output_size", f"{w}x{h}"]
    if params.stitch_type != "template":
        cmd += ["-stitch_type", params.stitch_type]
    if not params.cuda:
        cmd += ["-disable_cuda"]
    if params.model_root_dir:
        cmd += ["-model_root_dir", params.model_root_dir.rstrip("/") + "/"]
    try:
        done = subprocess.run(
            cmd, capture_output=True, text=True, timeout=params.timeout_s, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise Insta360Error(f"{TOOL} did not finish in {params.timeout_s} s") from exc
    if done.returncode != 0 or "error:" in done.stdout:
        tail = (done.stdout + done.stderr).strip().splitlines()[-5:]
        raise Insta360Error(f"{TOOL} failed ({done.returncode}): " + " | ".join(tail))
    images = sorted(
        (p for p in out_dir.rglob("*") if p.suffix.lower() in _IMAGE_SUFFIXES),
        key=lambda p: (_frame_number(p), p.name),
    )
    if len(images) != len(wanted):
        raise Insta360Error(f"{TOOL} wrote {len(images)} images for {len(wanted)} requested frames")
    return dict(zip(wanted, images, strict=True))
