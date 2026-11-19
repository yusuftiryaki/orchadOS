#!/usr/bin/env python3
"""Check a front-end output folder against orchados.lio_frontend/1.

Exit 1 on a layout error or when a segment failed. With --truth (the smoke
fixture's truth.json) also prints how far each segment's keyframe track is
from the true LiDAR track, both expressed relative to the segment's first
keyframe (Point-LIO's odometry frame starts at the segment start).
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

KF_HEADER = ["segment", "index", "gps_time_ns", "x", "y", "z", "qx", "qy", "qz", "qw", "scan"]
GPS_MINUS_UNIX_NS = -315_964_800 * 10**9 + 18 * 10**9
EXT_T = np.array([0.007698, 0.014655, -0.00667])


def quat_to_rot(q):
    x, y, z, w = np.asarray(q, float) / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def rotz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("out", type=Path)
    ap.add_argument("--truth", type=Path)
    args = ap.parse_args()
    errors: list[str] = []

    fj = json.loads((args.out / "frontend.json").read_text())
    for key in ("schema", "method", "method_version", "config_hash", "segments", "imu_rate_hz", "points_total"):
        if key not in fj:
            errors.append(f"frontend.json: missing {key}")
    if fj.get("schema") != "orchados.lio_frontend/1":
        errors.append(f"frontend.json: schema {fj.get('schema')!r}")
    print(
        f"frontend.json: method={fj.get('method')} version={fj.get('method_version')} "
        f"config_hash={str(fj.get('config_hash'))[:12]}… imu_rate_hz={fj.get('imu_rate_hz')} "
        f"points_total={fj.get('points_total')}"
    )
    for s in fj.get("segments", []):
        for key in ("index", "start_gps_ns", "end_gps_ns", "keyframe_count", "status", "message"):
            if key not in s:
                errors.append(f"segment {s.get('index')}: missing {key}")
        print(
            f"  segment {s['index']}: {s['status']} keyframes={s['keyframe_count']} "
            f"imu_rate_hz={s.get('imu_rate_hz')} points={s.get('points_total')} message={s.get('message')}"
        )
        if s.get("status") != "ok":
            errors.append(f"segment {s['index']} failed: {s.get('message')}")

    with open(args.out / "keyframes.csv", newline="") as fh:
        rows = list(csv.reader(fh))
    if rows[0] != KF_HEADER:
        errors.append(f"keyframes.csv header {rows[0]}")
    rows = rows[1:]
    by_seg: dict[int, list] = {}
    for r in rows:
        seg, idx = int(r[0]), int(r[1])
        s = next((x for x in fj["segments"] if x["index"] == seg), None)
        t = int(r[2])
        if s is None or not (s["start_gps_ns"] <= t <= s["end_gps_ns"]):
            errors.append(f"keyframe {seg}/{idx}: time {t} outside its segment")
        q = np.array([float(v) for v in r[6:10]])
        if abs(np.linalg.norm(q) - 1.0) > 1e-4:
            errors.append(f"keyframe {seg}/{idx}: quaternion not unit")
        if r[10] != f"{seg}_{idx}.npz":
            errors.append(f"keyframe {seg}/{idx}: scan name {r[10]}")
        scan = args.out / "scans" / r[10]
        if not scan.is_file():
            errors.append(f"missing {scan}")
        else:
            with np.load(scan) as z:
                xyz, inten = z["xyz"], z["intensity"]
            if xyz.dtype != np.float32 or xyz.ndim != 2 or xyz.shape[1] != 3:
                errors.append(f"{scan.name}: xyz {xyz.dtype} {xyz.shape}")
            if inten.dtype != np.float32 or inten.shape != (len(xyz),):
                errors.append(f"{scan.name}: intensity {inten.dtype} {inten.shape}")
            if len(xyz) == 0:
                errors.append(f"{scan.name}: empty")
        by_seg.setdefault(seg, []).append((idx, t, np.array([float(v) for v in r[3:6]]), q))
    for s in fj["segments"]:
        n = len(by_seg.get(s["index"], []))
        if n != s["keyframe_count"]:
            errors.append(f"segment {s['index']}: keyframe_count {s['keyframe_count']} but {n} rows")
    scans = sorted(p.name for p in (args.out / "scans").glob("*.npz"))
    if len(scans) != len(rows):
        errors.append(f"{len(scans)} scan files for {len(rows)} keyframes")
    print(f"keyframes.csv: {len(rows)} rows, scans/: {len(scans)} files")

    if args.truth and args.truth.exists():
        truth = json.loads(args.truth.read_text())["imu_poses"]
        tt = np.array([p["unix_ns"] for p in truth], dtype=np.int64)
        txyz = np.array([p["xyz"] for p in truth])
        tyaw = np.array([p["yaw"] for p in truth])

        def true_lidar(unix_ns):
            i = int(np.clip(np.searchsorted(tt, unix_ns), 1, len(tt) - 1))
            w = (unix_ns - tt[i - 1]) / (tt[i] - tt[i - 1])
            p = txyz[i - 1] * (1 - w) + txyz[i] * w
            yw = tyaw[i - 1] * (1 - w) + tyaw[i] * w
            return p + rotz(yw) @ EXT_T, rotz(yw)

        for seg, kfs in sorted(by_seg.items()):
            kfs.sort()
            _, t0, p0, q0 = kfs[0]
            r0 = quat_to_rot(q0)
            tp0, tr0 = true_lidar(t0 - GPS_MINUS_UNIX_NS)
            errs = []
            for _, t, p, _q in kfs:
                est = r0.T @ (p - p0)
                tp, _ = true_lidar(t - GPS_MINUS_UNIX_NS)
                tru = tr0.T @ (tp - tp0)
                errs.append(np.linalg.norm(est - tru))
            dist = np.linalg.norm(tr0.T @ (true_lidar(kfs[-1][1] - GPS_MINUS_UNIX_NS)[0] - tp0))
            print(
                f"  truth, segment {seg}: travelled {dist:.2f} m over {len(kfs)} keyframes; "
                f"position error vs truth (relative to first keyframe) mean {np.mean(errs):.3f} m, "
                f"max {np.max(errs):.3f} m"
            )

    if errors:
        print("FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("OK: output follows orchados.lio_frontend/1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
