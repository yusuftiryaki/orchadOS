#!/usr/bin/env python3
"""Tiny synthetic L2-like recording for the image's plumbing smoke test.

Writes, inside the image (needs rclpy + rosbag2_py):

  <session>/lidar/raw/bag/           ros2 bag (MCAP): /unilidar/cloud, /unilidar/imu
  <session>/truth.json               true IMU poses (not part of any contract)
  <in>/segments.json                 two overlapping windows over the recording

Scene: a closed hall (24 x 14 x 5 m) with two rows of square pillars along x,
a little like tree rows. The sensor stands still for 2 s, then moves along +x
at up to 0.6 m/s with a gentle yaw sway. Scans: 10 Hz, 6400 points, hemisphere
above -40 deg elevation, per-point relative `time` in seconds, `ring`.
IMU: 250 Hz specific force (m/s^2) and angular rate, with small noise.
This is a smoke-test fixture, not the pipeline's `lidar synth --moving`.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

UNIX_START_NS = 1_795_000_000 * 10**9  # 2026-11-18
GPS_MINUS_UNIX_NS = -315_964_800 * 10**9 + 18 * 10**9
G = 9.81
EXT_T = np.array([0.007698, 0.014655, -0.00667])  # LiDAR in IMU frame (config)

ROOM_MIN = np.array([-12.0, -7.0, -1.0])
ROOM_MAX = np.array([12.0, 7.0, 4.0])
PILLARS = [
    (np.array([x - 0.2, y - 0.2, -1.0]), np.array([x + 0.2, y + 0.2, 2.5]))
    for x in np.arange(-10.0, 11.0, 4.0)
    for y in (-3.0, 3.0)
]


def smoothstep(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * (3 - 2 * u)


def speed(t):
    return 0.6 * smoothstep((t - 2.0) / 2.0)


def yaw(t):
    return 0.25 * math.sin(0.5 * max(t - 2.0, 0.0)) * float(smoothstep((t - 2.0) / 2.0))


class Trajectory:
    """IMU pose: position from integrated speed along +x, yaw only."""

    def __init__(self, duration: float):
        self.dt = 1e-3
        self.t = np.arange(0.0, duration + 1.0, self.dt)
        v = speed(self.t)
        self.x = -6.0 + np.concatenate([[0.0], np.cumsum((v[1:] + v[:-1]) / 2 * self.dt)])

    def pos(self, t):
        x = np.interp(t, self.t, self.x)
        t = np.asarray(t, dtype=float)
        return np.stack([x, np.zeros_like(x), np.zeros_like(x)], axis=-1)

    def acc(self, t):
        h = 1e-3
        a = (speed(t + h) - speed(t - h)) / (2 * h)
        return np.array([a, 0.0, 0.0])

    def yaw(self, t):
        return yaw(t)

    def yaw_rate(self, t):
        h = 1e-4
        return (yaw(t + h) - yaw(t - h)) / (2 * h)


def rotz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def raycast(origins, dirs):
    """Distance from each origin along each unit dir to the first surface."""
    with np.errstate(divide="ignore", invalid="ignore"):
        inv = 1.0 / dirs
        t1 = (ROOM_MIN - origins) * inv
        t2 = (ROOM_MAX - origins) * inv
        best = np.min(np.where(np.isfinite(np.maximum(t1, t2)), np.maximum(t1, t2), np.inf), axis=1)
        for lo, hi in PILLARS:
            a = (lo - origins) * inv
            b = (hi - origins) * inv
            tmin = np.max(np.minimum(a, b), axis=1)
            tmax = np.min(np.maximum(a, b), axis=1)
            hit = (tmax >= tmin) & (tmin > 0.0)
            best = np.where(hit & (tmin < best), tmin, best)
    return best


def make_cloud_msg(stamp_ns, xyz, intensity, ring, rel_time):
    from sensor_msgs.msg import PointCloud2, PointField

    n = len(xyz)
    dtype = np.dtype(
        {
            "names": ["x", "y", "z", "intensity", "ring", "time"],
            "formats": ["<f4", "<f4", "<f4", "<f4", "<u2", "<f4"],
            "offsets": [0, 4, 8, 16, 20, 24],
            "itemsize": 32,
        }
    )
    arr = np.zeros(n, dtype=dtype)
    arr["x"], arr["y"], arr["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    arr["intensity"] = intensity
    arr["ring"] = ring
    arr["time"] = rel_time
    msg = PointCloud2()
    msg.header.stamp.sec = stamp_ns // 10**9
    msg.header.stamp.nanosec = stamp_ns % 10**9
    msg.header.frame_id = "unilidar_lidar"
    msg.height = 1
    msg.width = n
    msg.fields = [
        PointField(name="x", offset=0, datatype=PointField.FLOAT32, count=1),
        PointField(name="y", offset=4, datatype=PointField.FLOAT32, count=1),
        PointField(name="z", offset=8, datatype=PointField.FLOAT32, count=1),
        PointField(name="intensity", offset=16, datatype=PointField.FLOAT32, count=1),
        PointField(name="ring", offset=20, datatype=PointField.UINT16, count=1),
        PointField(name="time", offset=24, datatype=PointField.FLOAT32, count=1),
    ]
    msg.is_bigendian = False
    msg.point_step = 32
    msg.row_step = 32 * n
    msg.is_dense = True
    msg.data = arr.tobytes()
    return msg


def make_imu_msg(stamp_ns, gyro, acc):
    from sensor_msgs.msg import Imu

    msg = Imu()
    msg.header.stamp.sec = stamp_ns // 10**9
    msg.header.stamp.nanosec = stamp_ns % 10**9
    msg.header.frame_id = "unilidar_imu"
    msg.orientation.w = 1.0
    msg.angular_velocity.x, msg.angular_velocity.y, msg.angular_velocity.z = map(float, gyro)
    msg.linear_acceleration.x, msg.linear_acceleration.y, msg.linear_acceleration.z = map(float, acc)
    return msg


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("session", type=Path)
    ap.add_argument("--in-dir", type=Path, required=True, help="where segments.json goes")
    ap.add_argument("--duration", type=float, default=24.0)
    ap.add_argument("--points", type=int, default=6400, help="points per 0.1 s scan")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    import rosbag2_py
    from rclpy.serialization import serialize_message

    rng = np.random.default_rng(args.seed)
    traj = Trajectory(args.duration)
    bag_dir = args.session / "lidar" / "raw" / "bag"
    bag_dir.parent.mkdir(parents=True, exist_ok=True)
    writer = rosbag2_py.SequentialWriter()
    writer.open(
        rosbag2_py.StorageOptions(uri=str(bag_dir), storage_id="mcap"),
        rosbag2_py.ConverterOptions(input_serialization_format="cdr", output_serialization_format="cdr"),
    )
    writer.create_topic(rosbag2_py.TopicMetadata(name="/unilidar/cloud", type="sensor_msgs/msg/PointCloud2", serialization_format="cdr"))
    writer.create_topic(rosbag2_py.TopicMetadata(name="/unilidar/imu", type="sensor_msgs/msg/Imu", serialization_format="cdr"))

    msgs = []
    # IMU at 250 Hz.
    for k in range(int(args.duration * 250)):
        t = k / 250.0
        r = rotz(traj.yaw(t))
        f = r.T @ (traj.acc(t) + np.array([0.0, 0.0, G]))
        gyro = np.array([0.0, 0.0, traj.yaw_rate(t)]) + rng.normal(0, 0.002, 3)
        msgs.append((UNIX_START_NS + int(round(t * 1e9)), "/unilidar/imu", make_imu_msg(UNIX_START_NS + int(round(t * 1e9)), gyro, f + rng.normal(0, 0.02, 3))))
    # Scans at 10 Hz; each point measured at its own time.
    n = args.points
    for k in range(int(args.duration * 10)):
        t0 = k / 10.0
        rel = np.arange(n) / n * 0.1
        tp = t0 + rel
        az = rng.uniform(-math.pi, math.pi, n)
        el = np.arcsin(rng.uniform(math.sin(math.radians(-40)), 1.0, n))
        d_l = np.stack([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)], axis=1)
        yaws = np.array([traj.yaw(x) for x in tp])
        c, s = np.cos(yaws), np.sin(yaws)
        # world dir = Rz(yaw) d (LiDAR axes = IMU axes)
        d_w = np.stack([c * d_l[:, 0] - s * d_l[:, 1], s * d_l[:, 0] + c * d_l[:, 1], d_l[:, 2]], axis=1)
        p_imu = traj.pos(tp)
        origin = p_imu + np.stack([c * EXT_T[0] - s * EXT_T[1], s * EXT_T[0] + c * EXT_T[1], np.full(n, EXT_T[2])], axis=1)
        rng_m = raycast(origin, d_w) + rng.normal(0, 0.01, n)
        xyz = d_l * rng_m[:, None]
        intensity = (50 + 100 * (np.abs(d_w[:, 2]) > 0.5)).astype(np.float32)
        ring = (np.arange(n) % 18).astype(np.uint16)
        stamp = UNIX_START_NS + int(round(t0 * 1e9))
        msgs.append((stamp, "/unilidar/cloud", make_cloud_msg(stamp, xyz.astype(np.float32), intensity, ring, rel.astype(np.float32))))

    msgs.sort(key=lambda m: m[0])
    for stamp, topic, msg in msgs:
        writer.write(topic, serialize_message(msg), stamp)
    del writer

    truth = [
        {"unix_ns": UNIX_START_NS + int(t * 1e9), "xyz": traj.pos(t).tolist(), "yaw": traj.yaw(t)}
        for t in np.arange(0.0, args.duration, 0.05)
    ]
    (args.session / "truth.json").write_text(json.dumps({"imu_poses": truth}) + "\n")

    def gps(sec):
        return UNIX_START_NS + int(sec * 1e9) + GPS_MINUS_UNIX_NS

    mcaps = sorted(str(p.relative_to(args.session)) for p in bag_dir.glob("*.mcap"))
    half = args.duration / 2
    segments = {
        "segments": [
            {"index": 0, "mcap": mcaps, "start_gps_ns": gps(0.0), "end_gps_ns": gps(half + 1.0)},
            {"index": 1, "mcap": mcaps, "start_gps_ns": gps(half - 1.0), "end_gps_ns": gps(args.duration)},
        ],
        "rate": 1.0,
        "keyframe": {"dist_m": 0.5, "angle_deg": 10, "dt_s": 1.0},
    }
    args.in_dir.mkdir(parents=True, exist_ok=True)
    (args.in_dir / "segments.json").write_text(json.dumps(segments, indent=2) + "\n")
    print(f"wrote {bag_dir} ({len(msgs)} messages), truth.json, {args.in_dir / 'segments.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
