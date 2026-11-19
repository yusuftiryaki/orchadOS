#!/usr/bin/env python3
"""segments.json for a session folder: one segment per lidar/raw/bag*/ folder.

For the smoke test only; the pipeline plans the real segments (gaps, restarts,
restamping). The window is the bag's span from its metadata.yaml.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml

GPS_MINUS_UNIX_NS = -315_964_800 * 10**9 + 18 * 10**9


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("session", type=Path)
    ap.add_argument("out", type=Path, help="segments.json to write")
    ap.add_argument("--rate", type=float, default=1.0)
    args = ap.parse_args()

    segments = []
    for i, bag in enumerate(sorted((args.session / "lidar" / "raw").glob("bag*/"))):
        meta = yaml.safe_load((bag / "metadata.yaml").read_text())["rosbag2_bagfile_information"]
        start = int(meta["starting_time"]["nanoseconds_since_epoch"])
        end = start + int(meta["duration"]["nanoseconds"])
        mcaps = sorted(str(p.relative_to(args.session)) for p in bag.glob("*.mcap"))
        segments.append(
            {
                "index": i,
                "mcap": mcaps,
                "start_gps_ns": start + GPS_MINUS_UNIX_NS,
                "end_gps_ns": end + GPS_MINUS_UNIX_NS,
            }
        )
    if not segments:
        raise SystemExit(f"no lidar/raw/bag*/ folder under {args.session}")
    doc = {"segments": segments, "rate": args.rate, "keyframe": {"dist_m": 0.5, "angle_deg": 10, "dt_s": 1.0}}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"{len(segments)} segment(s) -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
