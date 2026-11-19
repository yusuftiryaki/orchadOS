"""The kit's raw LiDAR log (lidar/raw/): segments, stamp checks, restamped copies.

Layout (docs/arayuzler.md, "Kit kaydedicisi"): ros2 bag folders bag/, bag.1/, ...
(one per recorder restart) holding MCAP parts <folder>_<n>.mcap, and
recording.json (may be missing after a power loss). Topics come from
recording.json; without it, from the message types (PointCloud2, Imu).

Times: MCAP log times are the Pi's clock as UNIX ns (UTC), PPS-locked during a
normal recording; segments and keyframes carry GPS ns (docs/arayuzler.md, Zaman).
header.stamp may come from the L2's own clock (unilidar_sdk2 #25); a segment whose
stamps disagree with the log times is restamped (spec 2026-11-18 §5.2): the copy
carries header.stamp := log time, points and their relative times unchanged.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from mcap.exceptions import McapError
from mcap.reader import make_reader
from mcap.writer import CompressionType, Writer

from ..gpstime import GPS_EPOCH, leap_seconds_at
from . import ros2msg
from .models import RegistrationParams

RAW_DIR = Path("lidar") / "raw"
RECORDING_FILE = "recording.json"
DEFAULT_TOPICS = {"points": "/unilidar/cloud", "imu": "/unilidar/imu"}
_NS = 1_000_000_000
_GPS_EPOCH_UNIX_NS = int(GPS_EPOCH.timestamp()) * _NS


def unix_to_gps_ns(unix_ns: int) -> int:
    """UNIX ns (UTC) -> GPS ns (leap seconds at that instant)."""
    utc = datetime.fromtimestamp(unix_ns // _NS, tz=UTC)
    return int(unix_ns) - _GPS_EPOCH_UNIX_NS + leap_seconds_at(utc) * _NS


def gps_to_unix_ns(gps_ns: int) -> int:
    approx = int(gps_ns) + _GPS_EPOCH_UNIX_NS - 18 * _NS
    utc = datetime.fromtimestamp(approx // _NS, tz=UTC)
    return int(gps_ns) + _GPS_EPOCH_UNIX_NS - leap_seconds_at(utc) * _NS


@dataclass
class Segment:
    """A continuous stretch of LiDAR data the front end runs on as one piece."""

    index: int
    bag_dirs: list[Path]
    start_gps_ns: int  # log time of the first cloud message
    end_gps_ns: int  # log time of the last cloud message
    needs_restamp: bool
    imu_rate_hz: float
    skip_reason: str | None  # too_short | imu_rate_low | None (runs)
    cloud_messages: int = 0
    # Median header.stamp - log time (s) and the stamp clock's rate against the log clock.
    stamp_offset_s: float = 0.0
    stamp_rate: float = 1.0

    @property
    def duration_s(self) -> float:
        return (self.end_gps_ns - self.start_gps_ns) / 1e9


@dataclass
class CloudMsg:
    log_gps_ns: int
    stamp_unix_ns: int
    xyz: np.ndarray  # (N, 3) float32, LiDAR frame at each point's own time
    intensity: np.ndarray  # (N,) float32
    rel_time_s: np.ndarray  # (N,) float32, seconds after the stamp


def read_recording(raw_dir: Path) -> dict | None:
    p = Path(raw_dir) / RECORDING_FILE
    try:
        body = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return body if isinstance(body, dict) else None


def _bag_order(path: Path) -> tuple[int, str]:
    m = re.fullmatch(r"bag(?:\.(\d+))?", path.name)
    return (int(m.group(1) or 0) if m else 1 << 30, path.name)


def bag_dirs(raw_dir: Path) -> list[Path]:
    """bag/, bag.1/, bag.2/, ... in recording order (other folders with MCAP files last)."""
    raw_dir = Path(raw_dir)
    if not raw_dir.is_dir():
        return []
    dirs = [p for p in raw_dir.iterdir() if p.is_dir() and any(p.glob("*.mcap"))]
    return sorted(dirs, key=_bag_order)


def mcap_files(bag_dir: Path) -> list[Path]:
    def part(p: Path) -> tuple[int, str]:
        m = re.search(r"_(\d+)\.mcap$", p.name)
        return (int(m.group(1)) if m else 0, p.name)

    return sorted(Path(bag_dir).glob("*.mcap"), key=part)


def _wanted_topics(bag_dir: Path) -> dict[str, str]:
    rec = read_recording(Path(bag_dir).parent)
    topics = dict(DEFAULT_TOPICS)
    if rec and isinstance(rec.get("topics"), dict):
        topics.update({k: v for k, v in rec["topics"].items() if k in topics and v})
    return topics


def _resolve_topics(reader, wanted: dict[str, str]) -> dict[str, str]:
    """Topic per kind present in this file: the wanted name, else by message type."""
    try:
        summary = reader.get_summary()
    except (McapError, OSError, ValueError):
        summary = None
    if summary is None:
        return wanted
    present = {c.topic: summary.schemas.get(c.schema_id) for c in summary.channels.values()}
    out = {}
    for kind, schema in (("points", ros2msg.POINTCLOUD2), ("imu", ros2msg.IMU)):
        if wanted[kind] in present:
            out[kind] = wanted[kind]
            continue
        by_type = [t for t, s in present.items() if s is not None and s.name == schema]
        out[kind] = by_type[0] if by_type else wanted[kind]
    return out


def _iter_raw(
    bag_dirs_: list[Path],
    kinds: tuple[str, ...],
    start_unix: int | None = None,
    end_unix: int | None = None,
) -> Iterator[tuple[str, str, object, bytes, int, int]]:
    """(kind, topic, schema, data, log_time, publish_time) of the given kinds, file by file
    in recording order; unreadable or empty files are skipped (power loss)."""
    for bag in bag_dirs_:
        wanted = _wanted_topics(bag)
        for path in mcap_files(bag):
            if path.stat().st_size == 0:
                continue
            try:
                with open(path, "rb") as f:
                    reader = make_reader(f)
                    topics = _resolve_topics(reader, wanted)
                    kind_of = {topics[k]: k for k in kinds}
                    for schema, channel, msg in reader.iter_messages(
                        topics=list(kind_of), starting_at=start_unix, ending_at=end_unix
                    ):
                        yield (
                            kind_of[channel.topic],
                            channel.topic,
                            schema,
                            msg.data,
                            msg.log_time,
                            msg.publish_time,
                        )
            except (McapError, OSError, ValueError, EOFError) as exc:
                # A truncated last part (power loss) still yields what came before it.
                if isinstance(exc, OSError) and not path.exists():
                    raise
                continue


def _scan_bag(bag: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cloud log times (GPS ns), cloud stamps - log times (ns), IMU log times (GPS ns)."""
    cloud_log, cloud_off, imu_log = [], [], []
    for kind, _topic, _schema, data, log_time, _pub in _iter_raw([bag], ("points", "imu")):
        if kind == "points":
            cloud_log.append(log_time)
            cloud_off.append(ros2msg.stamp_ns(data) - log_time)
        else:
            imu_log.append(log_time)
    if not cloud_log:
        return np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0, np.int64)
    shift = unix_to_gps_ns(cloud_log[0]) - cloud_log[0]
    cl = np.asarray(cloud_log, dtype=np.int64) + shift
    off = np.asarray(cloud_off, dtype=np.int64)
    il = np.asarray(imu_log, dtype=np.int64) + shift
    order = np.argsort(cl, kind="stable")
    return cl[order], off[order], np.sort(il)


def plan_segments(session_dir: Path, params: RegistrationParams) -> list[Segment]:
    """Segments of the session's raw LiDAR log, skipped ones included (with skip_reason).

    A new segment starts at each bag folder and after each gap between cloud messages
    longer than params.gap_split_s (the gaps of recording.json are such gaps). [] when
    there is no lidar/raw or no cloud message in it.
    """
    raw = Path(session_dir) / RAW_DIR
    out: list[Segment] = []
    for bag in bag_dirs(raw):
        cl, off, il = _scan_bag(bag)
        if len(cl) == 0:
            continue
        breaks = np.nonzero(np.diff(cl) > params.gap_split_s * _NS)[0]
        bounds = zip(np.r_[0, breaks + 1], np.r_[breaks, len(cl) - 1], strict=True)
        for a, b in bounds:
            start, end = int(cl[a]), int(cl[b])
            dur = (end - start) / 1e9
            n_imu = int(np.searchsorted(il, end, "right") - np.searchsorted(il, start, "left"))
            rate = n_imu / dur if dur > 0 else 0.0
            o = off[a : b + 1] / 1e9
            if b - a >= 2 and dur > 0:
                x = (cl[a : b + 1] - start) / 1e9
                slope = float(np.polyfit(x, x + o, 1)[0])
            else:
                slope = 1.0
            restamp = bool(
                np.abs(o).max() > params.restamp_max_offset_s
                or abs(slope - 1.0) > params.restamp_max_slope_dev
            )
            skip = None
            if dur < params.min_segment_s:
                skip = "too_short"
            elif rate < params.min_imu_rate_ratio * params.expected_imu_hz:
                skip = "imu_rate_low"
            out.append(
                Segment(
                    index=len(out),
                    bag_dirs=[bag],
                    start_gps_ns=start,
                    end_gps_ns=end,
                    needs_restamp=restamp,
                    imu_rate_hz=round(rate, 3),
                    skip_reason=skip,
                    cloud_messages=int(b - a + 1),
                    stamp_offset_s=round(float(np.median(o)), 6),
                    stamp_rate=round(slope, 9),
                )
            )
    return out


def _window_unix(segment: Segment) -> tuple[int, int]:
    return gps_to_unix_ns(segment.start_gps_ns), gps_to_unix_ns(segment.end_gps_ns)


def iter_clouds(segment: Segment) -> Iterator[CloudMsg]:
    """The segment's cloud messages in log time order, decoded."""
    lo, hi = _window_unix(segment)
    shift = segment.start_gps_ns - lo
    for _k, _t, _s, data, log_time, _p in _iter_raw(segment.bag_dirs, ("points",), lo, hi):
        stamp, pts = ros2msg.decode_pointcloud2(data)
        names = pts.dtype.names or ()
        xyz = np.column_stack([pts["x"], pts["y"], pts["z"]]).astype(np.float32)
        inten = (
            pts["intensity"].astype(np.float32)
            if "intensity" in names
            else np.zeros(len(pts), np.float32)
        )
        rel = pts["time"].astype(np.float32) if "time" in names else np.zeros(len(pts), np.float32)
        yield CloudMsg(log_time + shift, stamp, xyz, inten, rel)


def write_restamped(segment: Segment, out: Path) -> Path:
    """MCAP of the segment's window with header.stamp := log time on clouds and IMU.

    out is the MCAP file (when it ends in .mcap) or a folder for <out>/seg<index>_0.mcap.
    Schemas, channels, log and publish times and every other byte are kept.
    """
    out = Path(out)
    path = out if out.suffix == ".mcap" else out / f"seg{segment.index}_0.mcap"
    path.parent.mkdir(parents=True, exist_ok=True)
    lo, hi = _window_unix(segment)
    with open(path, "wb") as f:
        w = Writer(f, compression=CompressionType.ZSTD)
        w.start(profile="ros2", library="orchados-pipeline rawlog.write_restamped")
        schema_ids: dict[tuple[str, bytes], int] = {}
        channels: dict[str, int] = {}
        seq: dict[str, int] = {}
        for _kind, topic, schema, data, log_time, pub in _iter_raw(
            segment.bag_dirs, ("points", "imu"), lo, hi
        ):
            if topic not in channels:
                key = (schema.name, schema.data)
                if key not in schema_ids:
                    schema_ids[key] = w.register_schema(schema.name, schema.encoding, schema.data)
                channels[topic] = w.register_channel(topic, "cdr", schema_ids[key])
                seq[topic] = 0
            w.add_message(
                channels[topic],
                log_time=log_time,
                data=ros2msg.with_stamp(data, log_time),
                publish_time=pub,
                sequence=seq[topic],
            )
            seq[topic] += 1
        w.finish()
    return path
