"""LiDAR-inertial front ends behind one interface (spec 2026-11-18 §5.3).

A front end turns the raw segments into keyframes: the LiDAR body pose in the
segment's own odometry frame (gravity aligned, origin at the segment's first
keyframe) and the keyframe's scan in the body frame, deskewed to the keyframe
time. It writes them to work_dir/frontend/ (orchados.lio_frontend/1):

- frontend.json: method, method_version, config_hash, segments [{index,
  start_gps_ns, end_gps_ns, keyframe_count, status ok|failed, message}],
  imu_rate_hz, points_total;
- keyframes.csv: segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan;
- scans/<segment>_<index>.npz: xyz (N x 3 float32), intensity (N float32).

Implementations: fake (tests: the synthetic session's truth with drift and
noise), point_lio (Docker image, GPL, called as a process; frontend/point_lio.py).
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np

from ..rawlog import Segment

SCHEMA = "orchados.lio_frontend/1"
FRONTEND_DIR = "frontend"
FRONTEND_FILE = "frontend.json"
KEYFRAMES_FILE = "keyframes.csv"
SCANS_DIR = "scans"
CSV_HEADER = ["segment", "index", "gps_time_ns", "x", "y", "z", "qx", "qy", "qz", "qw", "scan"]


class FrontendError(RuntimeError):
    pass


@dataclass
class Keyframe:
    segment: int
    index: int
    gps_time_ns: int
    t: np.ndarray  # (3,) body position in the segment's odometry frame, metres
    q: np.ndarray  # (4,) body orientation, x y z w
    scan: Path  # .npz with xyz (body frame, deskewed) and intensity


@dataclass
class FrontendResult:
    method: str
    method_version: str
    config_hash: str
    segments: list[dict]
    keyframes: list[Keyframe] = field(default_factory=list)
    imu_rate_hz: float = 0.0
    points_total: int = 0


class Frontend(Protocol):
    method: str

    def run(self, session_dir: Path, segments: list[Segment], work_dir: Path) -> FrontendResult:
        """Run on the segments (only those without skip_reason) and write work_dir/frontend/."""
        ...


def frontend_dir(work_dir: Path) -> Path:
    return Path(work_dir) / FRONTEND_DIR


def scan_path(work_dir: Path, segment: int, index: int) -> Path:
    return frontend_dir(work_dir) / SCANS_DIR / f"{segment}_{index}.npz"


def write_scan(
    work_dir: Path, segment: int, index: int, xyz: np.ndarray, intensity: np.ndarray
) -> Path:
    path = scan_path(work_dir, segment, index)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        path,
        xyz=np.asarray(xyz, dtype=np.float32).reshape(-1, 3),
        intensity=np.asarray(intensity, dtype=np.float32).reshape(-1),
    )
    return path


def load_scan(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with np.load(path) as z:
        xyz = z["xyz"].astype(np.float32).reshape(-1, 3)
        inten = z["intensity"].astype(np.float32) if "intensity" in z else np.zeros(len(xyz))
    return xyz, inten


def write_frontend_output(work_dir: Path, result: FrontendResult) -> Path:
    """frontend.json and keyframes.csv (the scans are written by the front end)."""
    d = frontend_dir(work_dir)
    d.mkdir(parents=True, exist_ok=True)
    body = {
        "schema": SCHEMA,
        "method": result.method,
        "method_version": result.method_version,
        "config_hash": result.config_hash,
        "segments": result.segments,
        "imu_rate_hz": result.imu_rate_hz,
        "points_total": result.points_total,
    }
    (d / FRONTEND_FILE).write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    with open(d / KEYFRAMES_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(CSV_HEADER)
        for k in result.keyframes:
            w.writerow(
                [k.segment, k.index, k.gps_time_ns]
                + [repr(float(v)) for v in k.t]
                + [repr(float(v)) for v in k.q]
                + [Path(k.scan).name]
            )
    return d


def read_frontend_output(work_dir: Path) -> FrontendResult:
    d = frontend_dir(work_dir)
    try:
        body = json.loads((d / FRONTEND_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise FrontendError(f"{d / FRONTEND_FILE}: {exc}") from exc
    if body.get("schema") != SCHEMA:
        raise FrontendError(f"{d / FRONTEND_FILE}: schema {body.get('schema')!r}, want {SCHEMA}")
    keyframes: list[Keyframe] = []
    path = d / KEYFRAMES_FILE
    if path.is_file():
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != CSV_HEADER:
                raise FrontendError(f"{path}: header {reader.fieldnames}, want {CSV_HEADER}")
            for row in reader:
                keyframes.append(
                    Keyframe(
                        segment=int(row["segment"]),
                        index=int(row["index"]),
                        gps_time_ns=int(row["gps_time_ns"]),
                        t=np.array([float(row[c]) for c in ("x", "y", "z")]),
                        q=np.array([float(row[c]) for c in ("qx", "qy", "qz", "qw")]),
                        scan=d / SCANS_DIR / row["scan"],
                    )
                )
    return FrontendResult(
        method=body["method"],
        method_version=str(body["method_version"]),
        config_hash=str(body["config_hash"]),
        segments=list(body.get("segments", [])),
        keyframes=keyframes,
        imu_rate_hz=float(body.get("imu_rate_hz") or 0.0),
        points_total=int(body.get("points_total") or 0),
    )


class PointLioPending:
    """Stand-in until the Point-LIO runner (frontend/point_lio.py, plan Task 9) exists."""

    method = "point_lio"

    def run(self, session_dir: Path, segments: list[Segment], work_dir: Path) -> FrontendResult:
        raise NotImplementedError(
            "the Point-LIO front end runner (lidar/frontend/point_lio.py, its Docker image "
            "deploy/lidar-frontends/point-lio) is not available in this build; "
            "use --frontend fake on synthetic sessions"
        )


def get_frontend(name: str) -> Frontend:
    if name == "fake":
        from .fake import FakeFrontend

        return FakeFrontend()
    if name == "point_lio":
        try:
            from .point_lio import PointLioFrontend  # type: ignore[import-not-found]
        except ImportError:
            return PointLioPending()
        return PointLioFrontend()
    raise ValueError(f"unknown LiDAR front end {name!r} (fake, point_lio)")
