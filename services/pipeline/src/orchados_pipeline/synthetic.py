"""Synthetic session generator for tests and demos (no field data in the repo).

Builds a complete session folder: an equirectangular MP4 drawn with OpenCV
(trees as trunks and crowns at their true bearings, QR time codes at the start
and end, deliberately blurred frames), a NAV-PVT UBX log of the same path,
events.csv, session.json and trees.json. The ground truth is written to
synthetic_truth.json.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from .events import format_events
from .geo import LocalFrame, bearing_deg, wrap180
from .gpstime import utc_to_gps_ns
from .projection import direction_to_pixel
from .sync import encode_qr_payload
from .ubx import build_frame, encode_nav_pvt


@dataclass
class SyntheticConfig:
    session_id: str = "synth-0001"
    parcel_id: str = "parcel-synth"
    lat0: float = 37.0600
    lon0: float = 37.3800
    height0_m: float = 880.0
    start_utc: datetime = field(default_factory=lambda: datetime(2026, 10, 18, 9, 0, tzinfo=UTC))
    # Lawnmower path in local east/north metres.
    waypoints: list[tuple[float, float]] = field(
        default_factory=lambda: [(0.0, 0.0), (0.0, 30.0), (6.0, 30.0), (6.0, 0.0)]
    )
    speed_mps: float = 2.0
    still_s: float = 3.0  # standing still at both ends while the QR is shown
    qr_s: float = 2.5
    qr_refresh_ms: int = 100
    fps: float = 12.0  # not a multiple of the QR refresh, so QR phases vary
    width: int = 960
    camera_height_m: float = 2.0
    clock_drift_ppm: float = 300.0
    gnss_rate_hz: float = 5.0
    gnss_margin_s: float = 2.0
    blur_every: int = 4  # frames where (index // 3) % blur_every == 1 are blurred
    blur_sigma: float = 4.0
    tree_rows_e: tuple[float, ...] = (-3.0, 3.0, 9.0)
    tree_cols_n: tuple[float, ...] = (4.0, 10.0, 16.0, 22.0)
    seed: int = 7


class Path2D:
    def __init__(self, waypoints: list[tuple[float, float]]):
        self.pts = np.array(waypoints, dtype=float)
        seg = np.hypot(*np.diff(self.pts, axis=0).T)
        self.cum = np.concatenate([[0.0], np.cumsum(seg)])
        self.length = float(self.cum[-1])

    def at(self, s: float) -> tuple[float, float]:
        s = min(max(s, 0.0), self.length)
        i = min(int(np.searchsorted(self.cum, s, side="right")) - 1, len(self.pts) - 2)
        w = (s - self.cum[i]) / (self.cum[i + 1] - self.cum[i])
        p = self.pts[i] + w * (self.pts[i + 1] - self.pts[i])
        return float(p[0]), float(p[1])


@dataclass
class SyntheticTruth:
    video_start_gps_ns: int
    clock_offset_ns: int
    clock_drift_ppm: float
    blurred_frames: list[int]
    qr_frames: list[int]
    frame_count: int
    fps: float
    trees: list[dict]
    path_length_m: float


def _render_frame(
    background: np.ndarray, e: float, n: float, heading: float, trees, cam_h: float
) -> np.ndarray:
    img = background.copy()
    h, w = img.shape[:2]
    order = sorted(trees, key=lambda t: -math.hypot(t["e"] - e, t["n"] - n))
    for t in order:
        de, dn = t["e"] - e, t["n"] - n
        d = math.hypot(de, dn)
        if d < 0.5 or d > 25:
            continue
        yaw = wrap180(bearing_deg(de, dn) - heading)
        x, _ = direction_to_pixel(yaw, 0, w, h)
        trunk_half = math.degrees(math.atan2(0.15, d)) / 360 * w
        _, y_ground = direction_to_pixel(0, math.degrees(math.atan2(-cam_h, d)), w, h)
        _, y_top = direction_to_pixel(0, math.degrees(math.atan2(1.4 - cam_h, d)), w, h)
        _, y_crown = direction_to_pixel(0, math.degrees(math.atan2(2.6 - cam_h, d)), w, h)
        r_x = math.degrees(math.atan2(1.4, d)) / 360 * w
        r_y = math.degrees(math.atan2(1.1, d)) / 180 * h
        for shift in (-w, 0, w):  # wrap around the seam
            xs = x + shift
            cv2.rectangle(
                img,
                (int(xs - trunk_half), int(y_top)),
                (int(xs + trunk_half), int(y_ground)),
                (30, 60, 100),
                -1,
            )
            cv2.ellipse(
                img,
                (int(xs), int(y_crown)),
                (max(2, int(r_x)), max(2, int(r_y))),
                0,
                0,
                360,
                (40, 160, 40),
                -1,
            )
    return img


def _background(width: int, height: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.zeros((height, width, 3), np.uint8)
    img[: height // 2] = (235, 200, 150)  # sky (BGR)
    img[height // 2 :] = (90, 130, 160)  # soil
    noise = rng.integers(-40, 40, size=(height, width, 1), dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    for x in range(0, width, 24):  # high-frequency texture for the sharpness score
        cv2.line(img, (x, height // 2), (x, height), (60, 90, 110), 1)
    return img


def _draw_qr(img: np.ndarray, text: str) -> np.ndarray:
    qr = cv2.QRCodeEncoder.create().encode(text)
    h, w = img.shape[:2]
    side = h // 2
    qr = cv2.resize(qr, (side, side), interpolation=cv2.INTER_NEAREST)
    qr = cv2.copyMakeBorder(qr, 16, 16, 16, 16, cv2.BORDER_CONSTANT, value=255)
    y0, x0 = (h - qr.shape[0]) // 2, (w - qr.shape[1]) // 2
    img[y0 : y0 + qr.shape[0], x0 : x0 + qr.shape[1]] = qr[..., None]
    return img


def make_session(dest: Path, cfg: SyntheticConfig | None = None) -> SyntheticTruth:
    cfg = cfg or SyntheticConfig()
    dest = Path(dest)
    (dest / "gnss").mkdir(parents=True, exist_ok=True)
    (dest / "video").mkdir(parents=True, exist_ok=True)
    frame = LocalFrame(cfg.lat0, cfg.lon0)
    path = Path2D(cfg.waypoints)
    move_s = path.length / cfg.speed_mps
    duration_s = 2 * cfg.still_s + move_s
    t0 = utc_to_gps_ns(cfg.start_utc)  # video start, GPS time

    def pos(gps_ns: int) -> tuple[float, float]:
        tau = (gps_ns - t0) / 1e9 - cfg.still_s
        return path.at(tau * cfg.speed_mps)

    def heading(gps_ns: int) -> float:
        window = 1.0
        for _ in range(6):
            a, b = pos(gps_ns - int(window * 1e9)), pos(gps_ns + int(window * 1e9))
            if math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.3:
                return bearing_deg(b[0] - a[0], b[1] - a[1])
            window *= 2
        return 0.0

    trees = []
    for i, e in enumerate(cfg.tree_rows_e):
        for j, n in enumerate(cfg.tree_cols_n):
            lat, lon = frame.to_latlon(e, n)
            trees.append(
                {
                    "tree_id": f"T{i + 1}{j + 1:02d}",
                    "slot_code": f"S{i + 1}-{j + 1}",
                    "lat": float(lat),
                    "lon": float(lon),
                    "e": e,
                    "n": n,
                }
            )

    # Video: camera clock runs (1 + drift) slower than GPS -> gps = t0 + cam * (1 + drift).
    height = cfg.width // 2
    n_frames = int(round(duration_s * cfg.fps))
    bg = _background(cfg.width, height, cfg.seed)
    writer = cv2.VideoWriter(
        str(dest / "video" / "VID_0001.mp4"),
        cv2.VideoWriter_fourcc(*"mp4v"),
        cfg.fps,
        (cfg.width, height),
    )
    blurred, qr_frames = [], []
    k = 1 + cfg.clock_drift_ppm * 1e-6
    tail_start = duration_s - cfg.qr_s
    for idx in range(n_frames):
        cam_s = idx / cfg.fps
        g = t0 + round(cam_s * 1e9 * k)
        e, n = pos(g)
        img = _render_frame(bg, e, n, heading(g), trees, cfg.camera_height_m)
        if cam_s < cfg.qr_s or cam_s >= tail_start:
            shown = (g // 1_000_000) // cfg.qr_refresh_ms * cfg.qr_refresh_ms
            img = _draw_qr(img, encode_qr_payload(int(shown), cfg.session_id))
            qr_frames.append(idx)
        elif (idx // 3) % cfg.blur_every == 1:
            img = cv2.GaussianBlur(img, (0, 0), cfg.blur_sigma)
            blurred.append(idx)
        writer.write(img)
    writer.release()

    # GNSS log: NAV-PVT at gnss_rate_hz, with NMEA noise and a corrupt frame mixed in.
    step = int(1e9 / cfg.gnss_rate_hz)
    first = (t0 - int(cfg.gnss_margin_s * 1e9)) // step * step
    last = t0 + int((duration_s + cfg.gnss_margin_s) * 1e9)
    blob = bytearray(b"$GNGGA,dummy*00\r\n")
    for i, g in enumerate(range(first, last, step)):
        e, n = pos(g)
        lat, lon = frame.to_latlon(e, n)
        payload = encode_nav_pvt(
            gps_time_ns=g,
            lat_deg=float(lat),
            lon_deg=float(lon),
            height_m=cfg.height0_m,
            head_mot_deg=heading(g),
        )
        fr = build_frame(0x01, 0x07, payload)
        if i == 3:
            blob += fr[:-1] + bytes([fr[-1] ^ 0xFF])  # bad checksum, must be skipped
        blob += fr
    (dest / "gnss" / "gnss.ubx").write_bytes(bytes(blob))

    def esp(g: int) -> int:
        return 5_000_000 + (g - first) // 1000

    events = [
        (esp(first), first, "session_start", cfg.session_id),
        (esp(t0 + 10**9), t0 + 10**9, "qr_sync", "start"),
        (esp(t0 + int(tail_start * 1e9)), t0 + int(tail_start * 1e9), "qr_sync", "end"),
        (esp(last), last, "session_stop", ""),
    ]
    (dest / "gnss" / "events.csv").write_text(format_events(events), encoding="utf-8")
    session = {
        "session_id": cfg.session_id,
        "parcel_id": cfg.parcel_id,
        "camera_height_m": cfg.camera_height_m,
        "firmware_version": "synthetic",
        "start_gps_ns": first,
        "stop_gps_ns": last,
    }
    (dest / "session.json").write_text(json.dumps(session, indent=2) + "\n", encoding="utf-8")
    public_trees = [{k2: t[k2] for k2 in ("tree_id", "slot_code", "lat", "lon")} for t in trees]
    (dest / "trees.json").write_text(
        json.dumps({"trees": public_trees}, indent=2) + "\n", encoding="utf-8"
    )
    truth = SyntheticTruth(
        video_start_gps_ns=t0,
        clock_offset_ns=t0,
        clock_drift_ppm=cfg.clock_drift_ppm,
        blurred_frames=blurred,
        qr_frames=qr_frames,
        frame_count=n_frames,
        fps=cfg.fps,
        trees=trees,
        path_length_m=path.length,
    )
    (dest / "synthetic_truth.json").write_text(
        json.dumps(asdict(truth), indent=1) + "\n", encoding="utf-8"
    )
    return truth
