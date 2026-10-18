"""Video access via OpenCV. Videos are equirectangular MP4 exported by the camera software.

Several parts of one recording are treated as consecutive chapters in file-name
order; camera time runs continuously across them.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .models import VideoInfo


class VideoError(RuntimeError):
    pass


def probe(path: Path) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise VideoError(f"{path.name}: cannot open video")
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if width <= 0 or height <= 0 or fps <= 0:
            raise VideoError(f"{path.name}: no video stream")
        ok, _ = cap.read()
        if not ok:
            raise VideoError(f"{path.name}: first frame cannot be decoded")
        return VideoInfo(
            width=width,
            height=height,
            fps=fps,
            frame_count=count,
            duration_s=count / fps if count > 0 else 0.0,
        )
    finally:
        cap.release()


@dataclass(frozen=True)
class VideoPart:
    path: Path
    rel: str  # path relative to the session directory
    info: VideoInfo
    start_camera_s: float  # camera time of this part's first frame

    def camera_s(self, frame_index: int) -> float:
        return self.start_camera_s + frame_index / self.info.fps

    @property
    def end_camera_s(self) -> float:
        return self.start_camera_s + self.info.frame_count / self.info.fps


def layout_parts(session_dir: Path, files: list[tuple[str, VideoInfo]]) -> list[VideoPart]:
    parts, t = [], 0.0
    for rel, info in sorted(files, key=lambda x: x[0]):
        parts.append(VideoPart(session_dir / rel, rel, info, t))
        t += info.frame_count / info.fps
    return parts


def iter_frames(
    path: Path, indices: set[int] | None = None, start: int = 0, stop: int | None = None
) -> Iterator[tuple[int, np.ndarray]]:
    """Decode sequentially and yield (index, BGR frame) for the wanted indices.

    Sequential grab() is used instead of seeking because seeking in long-GOP
    MP4s is not frame-accurate.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise VideoError(f"{path}: cannot open video")
    try:
        idx = 0
        if start > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, start)
            if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) == start:
                idx = start
            else:  # backend cannot seek exactly: reopen and skip forward
                cap.release()
                cap = cv2.VideoCapture(str(path))
        while idx < start and cap.grab():
            idx += 1
        last = max(indices) if indices else None
        while stop is None or idx < stop:
            if last is not None and idx > last:
                break
            if not cap.grab():
                break
            if indices is None or idx in indices:
                ok, frame = cap.retrieve()
                if not ok:
                    raise VideoError(f"{path}: frame {idx} cannot be decoded")
                yield idx, frame
            idx += 1
    finally:
        cap.release()
