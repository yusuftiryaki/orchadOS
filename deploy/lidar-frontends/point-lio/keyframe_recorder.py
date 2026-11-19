#!/usr/bin/env python3
"""Keyframe recorder and helpers for the orchadOS Point-LIO front-end image.

Subcommands (called by entrypoint.sh):

  plan      Read /in/segments.json, resolve each segment's MCAP files and their
            playback start offsets, write one work folder per segment.
  record    ROS 2 node for one segment: pairs Point-LIO's odometry with its
            body-frame scan of the same stamp, deskews the scan, and writes a
            keyframe whenever the LiDAR moved >= dist_m, turned >= angle_deg
            or dt_s passed. Also measures the IMU rate and counts input points.
  finalize  Merge the per-segment results into the orchados.lio_frontend/1
            layout: frontend.json, keyframes.csv, scans/<segment>_<index>.npz.

Frames: Point-LIO's state is the IMU pose in its odometry frame (T_WI) and
/cloud_registered_body carries the scan in the IMU frame. The LiDAR pose in
the IMU frame comes from the config (p_imu = R_ext p_lidar + T_ext). Keyframe
poses and scans are written for the LiDAR body, as the contract asks; the
segment's frame keeps Point-LIO's gravity-aligned axes with its origin moved
to the first keyframe's LiDAR position.

Times: bag stamps are Unix (UTC) ns; contract times are GPS ns.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import time
from collections import OrderedDict
from pathlib import Path

import numpy as np

SCHEMA = "orchados.lio_frontend/1"
METHOD = "point_lio"
# gps_ns = unix_ns - 315964800e9 + 18e9 (GPS epoch 1980-01-06, 18 leap seconds).
GPS_MINUS_UNIX_NS = -315_964_800 * 10**9 + 18 * 10**9

ODOM_TOPIC = "/aft_mapped_to_init"
BODY_TOPIC = "/cloud_registered_body"
IMU_TOPIC = "/unilidar/imu"
CLOUD_TOPIC = "/unilidar/cloud"

KF_HEADER = ["segment", "index", "gps_time_ns", "x", "y", "z", "qx", "qy", "qz", "qw", "scan"]


def gps_to_unix_ns(gps_ns: int) -> int:
    return int(gps_ns) - GPS_MINUS_UNIX_NS


def unix_to_gps_ns(unix_ns: int) -> int:
    return int(unix_ns) + GPS_MINUS_UNIX_NS


# --------------------------------------------------------------------------- math


def quat_to_rot(q: np.ndarray) -> np.ndarray:
    """xyzw quaternion -> 3x3 rotation."""
    x, y, z, w = np.asarray(q, dtype=float) / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def rot_to_quat(r: np.ndarray) -> np.ndarray:
    """3x3 rotation -> xyzw quaternion with w >= 0."""
    m = np.asarray(r, dtype=float)
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    q /= np.linalg.norm(q)
    return -q if q[3] < 0 else q


def rot_log(r: np.ndarray) -> np.ndarray:
    """Rotation matrix -> rotation vector (axis * angle)."""
    cos = max(-1.0, min(1.0, (np.trace(r) - 1.0) / 2.0))
    angle = math.acos(cos)
    if angle < 1e-9:
        return np.zeros(3)
    v = np.array([r[2, 1] - r[1, 2], r[0, 2] - r[2, 0], r[1, 0] - r[0, 1]])
    if math.pi - angle < 1e-6:
        # Near 180 degrees: take the axis from the symmetric part.
        axis = np.sqrt(np.maximum((np.diag(r) + 1.0) / 2.0, 0.0))
        axis = axis * np.sign(np.where(v == 0, 1.0, v))
        return axis / np.linalg.norm(axis) * angle
    return v / (2.0 * math.sin(angle)) * angle


def rot_angle_deg(r: np.ndarray) -> float:
    return math.degrees(np.linalg.norm(rot_log(r)))


def rotate_by_rotvec(points: np.ndarray, rotvecs: np.ndarray) -> np.ndarray:
    """Rotate each point by its own rotation vector (Rodrigues), vectorised."""
    theta = np.linalg.norm(rotvecs, axis=1, keepdims=True)
    small = theta[:, 0] < 1e-12
    k = np.divide(rotvecs, theta, out=np.zeros_like(rotvecs), where=theta > 0)
    cos = np.cos(theta)
    sin = np.sin(theta)
    kxp = np.cross(k, points)
    kdp = np.sum(k * points, axis=1, keepdims=True)
    out = points * cos + kxp * sin + k * kdp * (1.0 - cos)
    out[small] = points[small]
    return out


def deskew(points: np.ndarray, dt_before_end: np.ndarray, omega_b: np.ndarray, v_b: np.ndarray) -> np.ndarray:
    """Move every point to the body frame at scan end (constant body velocity).

    The body moves with constant body-frame twist (omega, v_b) over the scan, so
    T_end^-1 T_point = exp(-xi dt). A point measured dt seconds before the scan
    end becomes p' = Exp(-omega dt) p - (v_b dt - dt^2/2 omega x v_b)
    (left Jacobian to second order; ~0.1 mm at 1 m/s and 0.5 rad/s over 0.1 s).
    """
    dt = dt_before_end.reshape(-1, 1)
    omega = omega_b.reshape(1, 3)
    v = v_b.reshape(1, 3)
    rotated = rotate_by_rotvec(points, -omega * dt)
    return rotated - (v * dt - 0.5 * dt * dt * np.cross(omega, v))


# --------------------------------------------------------------------------- config


def read_extrinsics(config_path: Path) -> tuple[np.ndarray, np.ndarray]:
    import yaml

    doc = yaml.safe_load(config_path.read_text())
    params = next(iter(doc.values()))["ros__parameters"]
    mapping = params.get("mapping", {})
    t = np.array(mapping.get("extrinsic_T", [0.0, 0.0, 0.0]), dtype=float)
    r = np.array(mapping.get("extrinsic_R", [1, 0, 0, 0, 1, 0, 0, 0, 1]), dtype=float).reshape(3, 3)
    return r, t


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------------------- plan


def first_stamp_ns(mcap: Path) -> int | None:
    import rosbag2_py

    reader = rosbag2_py.SequentialReader()
    reader.open(
        rosbag2_py.StorageOptions(uri=str(mcap), storage_id="mcap"),
        rosbag2_py.ConverterOptions(input_serialization_format="", output_serialization_format=""),
    )
    if not reader.has_next():
        return None
    _topic, _data, stamp = reader.read_next()
    return int(stamp)


def cmd_plan(args: argparse.Namespace) -> int:
    spec = json.loads(Path(args.segments).read_text())
    session = Path(args.session)
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    rate = float(spec.get("rate", 1.0))
    if not rate > 0:
        raise SystemExit(f"segments.json: rate must be > 0, got {rate}")
    (work / "rate").write_text(f"{rate}\n")
    indices = []
    for seg in spec["segments"]:
        idx = int(seg["index"])
        start_unix = gps_to_unix_ns(int(seg["start_gps_ns"]))
        end_unix = gps_to_unix_ns(int(seg["end_gps_ns"]))
        sdir = work / f"seg_{idx}"
        sdir.mkdir(parents=True, exist_ok=True)
        (sdir / "window.env").write_text(f"START_UNIX_NS={start_unix}\nEND_UNIX_NS={end_unix}\n")
        files = []
        problems = []
        for raw in seg.get("mcap", []):
            p = Path(raw)
            if not p.is_absolute():
                p = session / p
            if not p.is_file():
                problems.append(f"missing MCAP {raw}")
                continue
            try:
                first = first_stamp_ns(p)
            except Exception as exc:  # noqa: BLE001 - reported per segment
                problems.append(f"unreadable MCAP {raw}: {exc}")
                continue
            if first is None or first > end_unix:
                continue
            files.append((first, p))
        files.sort()
        with open(sdir / "files.tsv", "w") as fh:
            for first, p in files:
                offset_s = max(0.0, (start_unix - first) / 1e9)
                fh.write(f"{p}\t{offset_s:.6f}\n")
        if problems:
            (sdir / "skip").write_text("; ".join(problems) + "\n")
        elif not files:
            (sdir / "skip").write_text("no MCAP data in the segment window\n")
        indices.append(idx)
    print("\n".join(str(i) for i in indices))
    return 0


# --------------------------------------------------------------------------- record


def cloud_fields(msg) -> np.ndarray:
    """PointCloud2 -> numpy structured array (float fields only as needed)."""
    type_map = {1: "i1", 2: "u1", 3: "i2", 4: "u2", 5: "i4", 6: "u4", 7: "f4", 8: "f8"}
    names, formats, offsets = [], [], []
    for f in msg.fields:
        if f.count != 1 or f.datatype not in type_map:
            continue
        names.append(f.name)
        formats.append(("<" if not msg.is_bigendian else ">") + type_map[f.datatype])
        offsets.append(f.offset)
    dtype = np.dtype({"names": names, "formats": formats, "offsets": offsets, "itemsize": msg.point_step})
    n = msg.width * msg.height
    return np.frombuffer(bytes(msg.data), dtype=dtype, count=n)


def stamp_ns(stamp) -> int:
    return int(stamp.sec) * 10**9 + int(stamp.nanosec)


class Recorder:
    def __init__(self, args: argparse.Namespace):
        import rclpy
        from nav_msgs.msg import Odometry
        from rclpy.node import Node
        from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy
        from rosgraph_msgs.msg import Clock
        from sensor_msgs.msg import Imu, PointCloud2

        self.args = args
        self.segment = int(args.index)
        self.start_ns = int(args.start_ns)
        self.end_ns = int(args.end_ns)
        self.out = Path(args.out)
        self.work = Path(args.work)
        self.scans_dir = self.out / "scans"
        self.scans_dir.mkdir(parents=True, exist_ok=True)
        self.r_ext, self.t_ext = read_extrinsics(Path(args.config))
        self.dist_m = float(args.dist_m)
        self.angle_deg = float(args.angle_deg)
        self.dt_ns = int(float(args.dt_s) * 1e9)

        rclpy.init()
        self.rclpy = rclpy
        self.node = Node(f"orchados_keyframe_recorder_{self.segment}")
        def qos(depth: int, reliable: bool) -> QoSProfile:
            return QoSProfile(
                depth=depth,
                history=HistoryPolicy.KEEP_LAST,
                reliability=ReliabilityPolicy.RELIABLE if reliable else ReliabilityPolicy.BEST_EFFORT,
            )

        sub = self.node.create_subscription
        # Point-LIO's outputs: reliable, nothing may be lost.
        sub(Odometry, ODOM_TOPIC, self.on_odom, qos(1000, True))
        sub(PointCloud2, BODY_TOPIC, self.on_body, qos(50, True))
        # Played inputs and clock: only counted, best effort is enough.
        sub(Imu, IMU_TOPIC, self.on_imu, qos(1000, False))
        sub(PointCloud2, CLOUD_TOPIC, self.on_cloud, qos(20, False))
        sub(Clock, "/clock", self.on_clock, qos(100, False))

        self.odoms: OrderedDict[int, tuple] = OrderedDict()
        self.bodies: OrderedDict[int, object] = OrderedDict()
        self.prev: tuple | None = None  # (stamp_ns, R_wi, p_wi)
        self.last_kf: tuple | None = None  # (stamp_ns, R_wl, t_wl)
        self.origin: np.ndarray | None = None  # first keyframe's LiDAR position
        self.kf_index = 0
        self.kf_csv = open(self.work / "keyframes.csv", "w", newline="")
        self.kf_writer = csv.writer(self.kf_csv)
        self.kf_writer.writerow(KF_HEADER)

        self.odom_count = 0
        self.odom_in_window = 0
        self.body_count = 0
        self.imu_count = 0
        self.imu_first = None
        self.imu_last = None
        self.cloud_msgs = 0
        self.points_total = 0
        self.deskew_from_twist = 0
        self.past_end_written = False
        self.last_activity = time.monotonic()
        self.play_done_seen_at: float | None = None
        self.ready_written = False

    # -- callbacks
    def on_clock(self, msg) -> None:
        if not self.past_end_written and stamp_ns(msg.clock) > self.end_ns + 500_000_000:
            (self.work / "past_end").touch()
            self.past_end_written = True

    def on_imu(self, msg) -> None:
        t = stamp_ns(msg.header.stamp)
        if self.start_ns <= t <= self.end_ns:
            self.imu_count += 1
            self.imu_first = t if self.imu_first is None else min(self.imu_first, t)
            self.imu_last = t if self.imu_last is None else max(self.imu_last, t)

    def on_cloud(self, msg) -> None:
        t = stamp_ns(msg.header.stamp)
        if self.start_ns <= t <= self.end_ns:
            self.cloud_msgs += 1
            self.points_total += int(msg.width) * int(msg.height)

    def on_odom(self, msg) -> None:
        self.last_activity = time.monotonic()
        self.odom_count += 1
        t = stamp_ns(msg.header.stamp)
        p = msg.pose.pose.position
        q = msg.pose.pose.orientation
        tw = msg.twist.twist
        self.odoms[t] = (
            quat_to_rot([q.x, q.y, q.z, q.w]),
            np.array([p.x, p.y, p.z]),
            np.array([tw.linear.x, tw.linear.y, tw.linear.z]),
            np.array([tw.angular.x, tw.angular.y, tw.angular.z]),
        )
        while len(self.odoms) > 200:
            self.odoms.popitem(last=False)
        self.match()

    def on_body(self, msg) -> None:
        self.last_activity = time.monotonic()
        self.body_count += 1
        self.bodies[stamp_ns(msg.header.stamp)] = msg
        while len(self.bodies) > 50:
            self.bodies.popitem(last=False)
        self.match()

    # -- pairing and keyframes
    def match(self) -> None:
        for t in sorted(set(self.odoms) & set(self.bodies)):
            body = self.bodies.pop(t)
            odom = self.odoms.pop(t)
            # Drop older unmatched entries: Point-LIO publishes both per scan, in order.
            for k in [k for k in self.bodies if k < t]:
                del self.bodies[k]
            for k in [k for k in self.odoms if k < t]:
                del self.odoms[k]
            self.process(t, odom, body)

    def process(self, t: int, odom: tuple, body) -> None:
        r_wi, p_wi, v_w, omega_twist = odom
        if self.start_ns <= t <= self.end_ns:
            self.odom_in_window += 1
            r_wl = r_wi @ self.r_ext
            t_wl = p_wi + r_wi @ self.t_ext
            if self.is_keyframe(t, r_wl, t_wl):
                omega_b, v_b = self.body_velocity(t, r_wi, p_wi, v_w, omega_twist)
                self.write_keyframe(t, r_wl, t_wl, body, omega_b, v_b)
        self.prev = (t, r_wi, p_wi)

    def is_keyframe(self, t: int, r_wl: np.ndarray, t_wl: np.ndarray) -> bool:
        if self.last_kf is None:
            return True
        t0, r0, p0 = self.last_kf
        return (
            np.linalg.norm(t_wl - p0) >= self.dist_m
            or rot_angle_deg(r0.T @ r_wl) >= self.angle_deg
            or t - t0 >= self.dt_ns
        )

    def body_velocity(self, t, r_wi, p_wi, v_w, omega_twist) -> tuple[np.ndarray, np.ndarray]:
        """Body-frame angular and linear velocity over the scan.

        From the previous scan's pose when it is close (average over the scan),
        else from Point-LIO's twist (output model: world-frame linear velocity,
        body-frame angular velocity).
        """
        if self.prev is not None:
            tp, rp, pp = self.prev
            dt = (t - tp) / 1e9
            if 0.0 < dt <= 0.3:
                omega_b = rot_log(rp.T @ r_wi) / dt
                v_b = r_wi.T @ (p_wi - pp) / dt
                return omega_b, v_b
        self.deskew_from_twist += 1
        return omega_twist, r_wi.T @ v_w

    def write_keyframe(self, t, r_wl, t_wl, body, omega_b, v_b) -> None:
        pts = cloud_fields(body)
        xyz_i = np.stack([pts["x"], pts["y"], pts["z"]], axis=1).astype(np.float64)
        if "intensity" in pts.dtype.names:
            intensity = pts["intensity"].astype(np.float32)
        else:
            intensity = np.zeros(len(pts), np.float32)
        if "curvature" in pts.dtype.names and len(pts):
            c = pts["curvature"].astype(np.float64)  # ms from scan start
            dt_before_end = np.clip((c.max() - c) / 1000.0, 0.0, 1.0)
            xyz_i = deskew(xyz_i, dt_before_end, omega_b, v_b)
        # IMU body frame -> LiDAR body frame.
        xyz_l = (xyz_i - self.t_ext) @ self.r_ext
        name = f"{self.segment}_{self.kf_index}.npz"
        np.savez(self.scans_dir / name, xyz=xyz_l.astype(np.float32), intensity=intensity)
        q = rot_to_quat(r_wl)
        if self.origin is None:
            self.origin = t_wl.copy()
        row = [
            self.segment,
            self.kf_index,
            unix_to_gps_ns(t),
            *(f"{v:.6f}" for v in t_wl - self.origin),
            *(f"{v:.9f}" for v in q),
            name,
        ]
        self.kf_writer.writerow(row)
        self.kf_csv.flush()
        self.kf_index += 1
        self.last_kf = (t, r_wl, t_wl)

    # -- lifecycle
    def check_ready(self) -> None:
        if self.ready_written:
            return
        n = self.node
        if n.count_publishers(ODOM_TOPIC) > 0 and n.count_publishers(BODY_TOPIC) > 0:
            (self.work / "ready").touch()
            self.ready_written = True

    def should_stop(self) -> tuple[bool, bool]:
        """(stop, timed_out)."""
        if not (self.work / "play_done").exists():
            return False, False
        now = time.monotonic()
        if self.play_done_seen_at is None:
            self.play_done_seen_at = now
            self.last_activity = max(self.last_activity, now)
        if now - self.last_activity >= float(self.args.idle_s):
            return True, False
        if now - self.play_done_seen_at >= float(self.args.max_wait_s):
            return True, True
        return False, False

    def run(self) -> int:
        timed_out = False
        try:
            while self.rclpy.ok():
                self.rclpy.spin_once(self.node, timeout_sec=0.2)
                self.check_ready()
                stop, timed_out = self.should_stop()
                if stop:
                    break
        except KeyboardInterrupt:
            pass
        finally:
            self.kf_csv.close()
            rate = None
            if self.imu_count > 1 and self.imu_last > self.imu_first:
                rate = (self.imu_count - 1) / ((self.imu_last - self.imu_first) / 1e9)
            summary = {
                "index": self.segment,
                "keyframes_recorded": self.kf_index,
                "odom_count": self.odom_count,
                "odom_in_window": self.odom_in_window,
                "body_count": self.body_count,
                "imu_count": self.imu_count,
                "imu_span_s": None if rate is None else (self.imu_last - self.imu_first) / 1e9,
                "imu_rate_hz": rate,
                "cloud_msgs": self.cloud_msgs,
                "points_total": self.points_total,
                "deskew_from_twist": self.deskew_from_twist,
                "timed_out": timed_out,
            }
            (self.work / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
            self.node.destroy_node()
            if self.rclpy.ok():
                self.rclpy.shutdown()
        return 0


def cmd_record(args: argparse.Namespace) -> int:
    return Recorder(args).run()


# --------------------------------------------------------------------------- finalize


def cmd_finalize(args: argparse.Namespace) -> int:
    spec = json.loads(Path(args.segments).read_text())
    work = Path(args.work)
    out = Path(args.out)
    config = Path(args.config)
    commit = os.environ.get("POINT_LIO_COMMIT", "unknown")
    recipe = os.environ.get("ORCHADOS_RECIPE_VERSION", "0")
    segments = []
    rows = []
    imu_n = 0
    imu_span = 0.0
    points_total = 0
    for seg in spec["segments"]:
        idx = int(seg["index"])
        sdir = work / f"seg_{idx}"
        summary = {}
        if (sdir / "summary.json").exists():
            summary = json.loads((sdir / "summary.json").read_text())
        pl_status = (sdir / "pl_status").read_text().strip() if (sdir / "pl_status").exists() else ""
        message = None
        if (sdir / "skip").exists():
            message = (sdir / "skip").read_text().strip()
        elif pl_status and pl_status != "ok":
            message = pl_status
        elif not summary:
            message = "keyframe recorder produced no summary"
        elif summary.get("odom_in_window", 0) == 0:
            message = "no odometry from point_lio in the segment window"
        elif summary.get("keyframes_recorded", 0) == 0:
            message = "no keyframes in the segment window"
        elif summary.get("timed_out"):
            message = f"point_lio still publishing {args.max_wait_s} s after playback ended"
        status = "ok" if message is None else "failed"
        seg_rows = []
        if (sdir / "keyframes.csv").exists():
            with open(sdir / "keyframes.csv", newline="") as fh:
                seg_rows = list(csv.reader(fh))[1:]
        if status == "ok":
            rows.extend(seg_rows)
        if summary.get("imu_span_s"):
            imu_n += summary["imu_count"] - 1
            imu_span += summary["imu_span_s"]
        points_total += int(summary.get("points_total", 0))
        segments.append(
            {
                "index": idx,
                "start_gps_ns": int(seg["start_gps_ns"]),
                "end_gps_ns": int(seg["end_gps_ns"]),
                "keyframe_count": len(seg_rows) if status == "ok" else 0,
                "status": status,
                "message": message,
                "imu_rate_hz": summary.get("imu_rate_hz"),
                "points_total": int(summary.get("points_total", 0)),
                "keyframes_recorded": int(summary.get("keyframes_recorded", 0)),
                "odometry_count": int(summary.get("odom_in_window", 0)),
            }
        )
    rows.sort(key=lambda r: (int(r[0]), int(r[1])))
    with open(out / "keyframes.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(KF_HEADER)
        w.writerows(rows)
    # Scans of failed segments are not part of the output.
    kept = {r[10] for r in rows}
    for f in (out / "scans").glob("*.npz"):
        if f.name not in kept:
            f.unlink()
    frontend = {
        "schema": SCHEMA,
        "method": METHOD,
        "method_version": f"{commit[:7]}-r{recipe}",
        "config_hash": sha256_file(config),
        "segments": segments,
        "imu_rate_hz": (imu_n / imu_span) if imu_span > 0 else None,
        "points_total": points_total,
        "rate": float(spec.get("rate", 1.0)),
        "keyframe": {
            "dist_m": float(args.dist_m),
            "angle_deg": float(args.angle_deg),
            "dt_s": float(args.dt_s),
        },
        "source": {
            "repo": os.environ.get("POINT_LIO_REPO", ""),
            "commit": commit,
            "recipe": recipe,
            "config": config.name,
        },
    }
    (out / "frontend.json").write_text(json.dumps(frontend, indent=2) + "\n")
    ok = sum(1 for s in segments if s["status"] == "ok")
    print(f"frontend: {ok}/{len(segments)} segments ok, {len(rows)} keyframes")
    return 0


# --------------------------------------------------------------------------- cli


def keyframe_params(segments_path: str) -> dict:
    spec = json.loads(Path(segments_path).read_text())
    kf = spec.get("keyframe") or {}
    return {
        "dist_m": float(kf.get("dist_m", 0.5)),
        "angle_deg": float(kf.get("angle_deg", 10.0)),
        "dt_s": float(kf.get("dt_s", 1.0)),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan")
    p.add_argument("--segments", required=True)
    p.add_argument("--session", required=True)
    p.add_argument("--work", required=True)

    r = sub.add_parser("record")
    r.add_argument("--segments", required=True, help="segments.json (keyframe spacing)")
    r.add_argument("--index", required=True)
    r.add_argument("--start-ns", required=True, help="window start, Unix ns")
    r.add_argument("--end-ns", required=True, help="window end, Unix ns")
    r.add_argument("--config", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--work", required=True)
    r.add_argument("--idle-s", type=float, default=5.0)
    r.add_argument("--max-wait-s", type=float, default=600.0)

    f = sub.add_parser("finalize")
    f.add_argument("--segments", required=True)
    f.add_argument("--config", required=True)
    f.add_argument("--out", required=True)
    f.add_argument("--work", required=True)
    f.add_argument("--max-wait-s", type=float, default=600.0)

    args = ap.parse_args(argv)
    if args.cmd in ("record", "finalize"):
        for k, v in keyframe_params(args.segments).items():
            setattr(args, k, v)
    return {"plan": cmd_plan, "record": cmd_record, "finalize": cmd_finalize}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
