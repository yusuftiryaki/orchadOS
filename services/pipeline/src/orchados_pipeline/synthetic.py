"""Synthetic session generator for tests and demos (no field data in the repo).

Builds a complete session folder: an equirectangular MP4 drawn with OpenCV
(trees as trunks and crowns at their true bearings, QR time codes at the start
and end, deliberately blurred frames), a NAV-PVT UBX log of the same path,
and the logger's gnss/events.csv and gnss/session.json in the İP2 format (see
docs/arayuzler.md), the root session.json and trees.json. The ground truth is
written to synthetic_truth.json. With boundary_walk, the logger log starts with
a walk around the scan area before the video: corner rows in events.csv and the
phone's session events (corner, boundary_corners) in phone_events.json, ready
to insert into public.session_event. The scene is a 3 x 4 tree grid, or a parcel's
real tree positions (SyntheticConfig.parcel_trees, e.g. from the database).
"""

from __future__ import annotations

import json
import math
import uuid
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from .events import format_events
from .geo import LocalFrame, bearing_deg, wrap180
from .gpstime import gps_ns_to_iso, utc_to_gps_ns
from .models import EmptySlot, Tree
from .projection import direction_to_pixel
from .sync import encode_qr_payload
from .trees_db import slot_order
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
    # Phone -> logger delay of the qr_sync command (BLE), added to the event time.
    qr_event_latency_ms: int = 30
    # Fit the scene to a parcel (synth --trees-from-db / --trees): all of its trees
    # are drawn and the path drives the aisles around the chosen rows and positions
    # (inclusive ranges; None = all). Without parcel trees, the 3 x 4 grid above.
    parcel_trees: list[Tree] | None = None
    rows: tuple[int, int] | None = None
    positions: tuple[int, int] | None = None
    aisle_end_margin_m: float = 4.0  # path runs this far past the first and last tree
    default_row_spacing_m: float = 8.0  # when the parcel has a single row
    # Boundary walk before the scan: a rectangle around the scan path, this far
    # outside it, walked at walk_speed_mps with a pause at each corner. A corner
    # pressed by mistake is deleted with a boundary_corners event.
    boundary_walk: bool = False
    boundary_margin_m: float = 3.0
    walk_speed_mps: float = 1.2
    corner_pause_s: float = 4.0
    # Phone clock error of the corner with time_source = phone.
    phone_clock_error_ms: int = 300
    # Coverage and presence checks: trees of the list that are not drawn (cut),
    # empty slots with a sapling drawn (newly planted; a grid code moves from the
    # trees to empty_slots), and aisles the path skips (1-based, in driving
    # order: the default grid has the aisles e = 0 and e = 6).
    missing: tuple[str, ...] = ()
    planted: tuple[str, ...] = ()
    skip_aisles: tuple[int, ...] = ()
    # Empty slots of the parcel (synth --trees-from-db), for planted.
    parcel_empty_slots: list[EmptySlot] | None = None


def parse_range(text: str) -> tuple[int, int]:
    """'1-2' -> (1, 2); '3' -> (3, 3)."""
    a, _, b = text.partition("-")
    lo, hi = int(a), int(b or a)
    if lo < 1 or hi < lo:
        raise ValueError(f"bad range {text!r}; use e.g. 1-2")
    return lo, hi


def _in(value: int, rng: tuple[int, int] | None) -> bool:
    return rng is None or rng[0] <= value <= rng[1]


def fit_to_parcel(
    cfg: SyntheticConfig,
) -> tuple[float, float, list[tuple[float, float]], list[dict]]:
    """Origin, waypoints and scene trees from the parcel's tree positions.

    Rows come from the slot codes (S<row>-<position>[suffix]). The row direction
    is the mean direction from the first to the last tree of each chosen row; the
    path drives the aisles half a row spacing beside each chosen row, back and
    forth (lawnmower), so every chosen tree is seen from both sides.
    """
    trees = cfg.parcel_trees or []
    coded = []
    for t in trees:
        row, pos, _ = slot_order(t.slot_code)
        coded.append((t, row, pos))
    chosen = [(t, r, q) for t, r, q in coded if _in(r, cfg.rows) and _in(q, cfg.positions)]
    if not chosen:
        raise ValueError(
            f"no trees in rows {cfg.rows or 'all'}, positions {cfg.positions or 'all'} "
            f"among {len(trees)} parcel trees"
        )
    lat0 = float(np.mean([t.lat for t, _, _ in chosen]))
    lon0 = float(np.mean([t.lon for t, _, _ in chosen]))
    frame = LocalFrame(lat0, lon0)
    en = {t.tree_id: np.array(frame.to_en(t.lat, t.lon), dtype=float) for t in trees}

    axis = np.zeros(2)
    for row in sorted({r for _, r, _ in chosen}):
        in_row = sorted((q, t.tree_id) for t, r, q in chosen if r == row)
        if len(in_row) >= 2:
            d = en[in_row[-1][1]] - en[in_row[0][1]]
            axis += d / np.linalg.norm(d)
    if not axis.any():
        # A single tree per row: take the direction of the whole parcel row.
        for row in sorted({r for _, r, _ in chosen}):
            in_row = sorted((q, t.tree_id) for t, r, q in coded if r == row)
            if len(in_row) >= 2:
                d = en[in_row[-1][1]] - en[in_row[0][1]]
                axis += d / np.linalg.norm(d)
    axis = axis / np.linalg.norm(axis) if axis.any() else np.array([1.0, 0.0])
    across = np.array([-axis[1], axis[0]])  # left of the row direction

    def uv(tree_id: str) -> tuple[float, float]:
        p = en[tree_id]
        return float(p @ axis), float(p @ across)

    row_v = {}
    for row in sorted({r for _, r, _ in coded}):
        row_v[row] = float(np.median([uv(t.tree_id)[1] for t, r, _ in coded if r == row]))
    ordered = sorted(row_v.values())
    gaps = [b - a for a, b in zip(ordered, ordered[1:], strict=False) if b - a > 0.5]
    spacing = float(np.median(gaps)) if gaps else cfg.default_row_spacing_m

    vs = sorted(row_v[r] for r in {r for _, r, _ in chosen})
    aisles = [vs[0] - spacing / 2] + [(a + b) / 2 for a, b in zip(vs, vs[1:], strict=False)]
    aisles.append(vs[-1] + spacing / 2)
    us = [uv(t.tree_id)[0] for t, _, _ in chosen]
    u0, u1 = min(us) - cfg.aisle_end_margin_m, max(us) + cfg.aisle_end_margin_m

    aisles = [v for k, v in enumerate(aisles, 1) if k not in cfg.skip_aisles]
    if not aisles:
        raise ValueError("every aisle is skipped")
    waypoints = []
    for k, v in enumerate(aisles):
        for u in (u0, u1) if k % 2 == 0 else (u1, u0):
            e, n = u * axis + v * across
            waypoints.append((float(e), float(n)))

    planted = [e for e in cfg.parcel_empty_slots or [] if e.slot_code in cfg.planted]
    unknown = set(cfg.planted) - {e.slot_code for e in planted}
    if unknown:
        raise ValueError(f"planted slots are not empty slots of the parcel: {sorted(unknown)}")
    for e in planted:
        en[f"slot:{e.slot_code}"] = np.array(frame.to_en(e.lat, e.lon), dtype=float)
    subjects = [(t.tree_id, t.slot_code, t.lat, t.lon, None) for t in trees]
    subjects += [(f"slot:{e.slot_code}", e.slot_code, e.lat, e.lon, "sapling") for e in planted]
    scene = []
    for key, code, lat, lon, kind in subjects:
        u, v = uv(key)
        if u0 - 25 <= u <= u1 + 25 and min(aisles) - 25 <= v <= max(aisles) + 25:
            e, n = en[key]
            scene.append(
                {
                    "tree_id": None if kind else key,
                    "slot_code": code,
                    "lat": lat,
                    "lon": lon,
                    "e": float(e),
                    "n": float(n),
                    **({"kind": kind} if kind else {}),
                }
            )
    return lat0, lon0, waypoints, scene


def boundary_rectangle(cfg: SyntheticConfig) -> list[tuple[float, float]]:
    """Four corners (local e/n) around the scan path, aligned with its first leg,
    in walking order (counter-clockwise seen from above)."""
    pts = np.array(cfg.waypoints, dtype=float)
    d = pts[1] - pts[0]
    axis = d / np.linalg.norm(d)
    across = np.array([-axis[1], axis[0]])
    u, v = pts @ axis, pts @ across
    m = cfg.boundary_margin_m
    u0, u1, v0, v1 = u.min() - m, u.max() + m, v.min() - m, v.max() + m
    corners = [(u0, v1), (u0, v0), (u1, v0), (u1, v1)]
    return [tuple(float(x) for x in a * axis + b * across) for a, b in corners]


@dataclass
class BoundaryWalk:
    """Keyframes (seconds from the walk start, e, n) and the corner presses."""

    keys: list[tuple[float, float, float]]
    # (corner_no, press time from walk start, e, n, kept in the final list)
    presses: list[tuple[int, float, float, float, bool]]
    list_event_s: float  # boundary_corners event, after the mistaken press
    duration_s: float


def plan_boundary_walk(cfg: SyntheticConfig) -> BoundaryWalk:
    """Corners 1-3, a mistaken corner 4 inside the area (deleted by the list
    event), the last real corner as 5, then on to the scan start."""
    rect = boundary_rectangle(cfg)
    c3, c4 = np.array(rect[2]), np.array(rect[3])
    centre = np.mean(np.array(rect), axis=0)
    mid = (c3 + c4) / 2
    mistake = mid + 3.0 * (centre - mid) / np.linalg.norm(centre - mid)
    stops = [
        (1, rect[0], True),
        (2, rect[1], True),
        (3, rect[2], True),
        (4, (float(mistake[0]), float(mistake[1])), False),
        (5, rect[3], True),
    ]
    keys: list[tuple[float, float, float]] = []
    presses = []
    t = 0.0
    here = np.array(rect[0])
    list_event_s = 0.0
    for no, (e, n), kept in stops:
        t += float(np.linalg.norm(np.array((e, n)) - here)) / cfg.walk_speed_mps
        keys.append((t, e, n))
        presses.append((no, t + cfg.corner_pause_s / 2, e, n, kept))
        t += cfg.corner_pause_s
        keys.append((t, e, n))
        if no == 4:
            list_event_s = t + 1.0  # the crew deletes it right after
        here = np.array((e, n))
    start = np.array(cfg.waypoints[0])
    t += float(np.linalg.norm(start - here)) / cfg.walk_speed_mps
    keys.append((t, float(start[0]), float(start[1])))
    return BoundaryWalk(keys, presses, list_event_s, t)


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
    # Boundary walk: final corners in walking order (corner_no, lat, lon) and the
    # local-plane area; empty without boundary_walk.
    boundary_corners: list[dict] = field(default_factory=list)
    boundary_area_m2: float | None = None
    # Trees listed but not drawn, and empty slots with a sapling drawn.
    missing: list[str] = field(default_factory=list)
    planted: list[str] = field(default_factory=list)


def _render_frame(
    background: np.ndarray, e: float, n: float, heading: float, trees, cam_h: float
) -> np.ndarray:
    img = background.copy()
    h, w = img.shape[:2]
    order = sorted(trees, key=lambda t: -math.hypot(t["e"] - e, t["n"] - n))
    for t in order:
        if t.get("missing"):
            continue
        sapling = t.get("kind") == "sapling"
        # (trunk top, crown centre, crown half width, half height), metres
        top, centre, rx, ry = (0.6, 0.9, 0.5, 0.45) if sapling else (1.4, 2.6, 1.4, 1.1)
        de, dn = t["e"] - e, t["n"] - n
        d = math.hypot(de, dn)
        if d < 0.5 or d > 25:
            continue
        yaw = wrap180(bearing_deg(de, dn) - heading)
        x, _ = direction_to_pixel(yaw, 0, w, h)
        trunk_half = math.degrees(math.atan2(0.15, d)) / 360 * w
        _, y_ground = direction_to_pixel(0, math.degrees(math.atan2(-cam_h, d)), w, h)
        _, y_top = direction_to_pixel(0, math.degrees(math.atan2(top - cam_h, d)), w, h)
        _, y_crown = direction_to_pixel(0, math.degrees(math.atan2(centre - cam_h, d)), w, h)
        r_x = math.degrees(math.atan2(rx, d)) / 360 * w
        r_y = math.degrees(math.atan2(ry, d)) / 180 * h
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
    scene_trees = None
    if cfg.parcel_trees is not None:
        lat0, lon0, waypoints, scene_trees = fit_to_parcel(cfg)
        cfg = replace(cfg, lat0=lat0, lon0=lon0, waypoints=waypoints)
    elif cfg.skip_aisles:
        # The default grid's two aisles, minus the skipped ones.
        aisles = [e for k, e in enumerate((0.0, 6.0), 1) if k not in cfg.skip_aisles]
        if not aisles:
            raise ValueError("every aisle is skipped")
        ends = [cfg.waypoints[0][1], cfg.waypoints[1][1]]
        waypoints = []
        for k, e in enumerate(aisles):
            for n in ends if k % 2 == 0 else ends[::-1]:
                waypoints.append((e, n))
        cfg = replace(cfg, waypoints=waypoints)
    frame = LocalFrame(cfg.lat0, cfg.lon0)
    path = Path2D(cfg.waypoints)
    move_s = path.length / cfg.speed_mps
    duration_s = 2 * cfg.still_s + move_s
    t0 = utc_to_gps_ns(cfg.start_utc)  # video start, GPS time
    walk = plan_boundary_walk(cfg) if cfg.boundary_walk else None
    # The walk ends one second before the video starts.
    walk_t0 = t0 - int((walk.duration_s + 1.0) * 1e9) if walk else t0

    def pos(gps_ns: int) -> tuple[float, float]:
        if walk is not None and gps_ns < t0 - 1_000_000_000:
            tw = (gps_ns - walk_t0) / 1e9
            kt = [k[0] for k in walk.keys]
            return (
                float(np.interp(tw, kt, [k[1] for k in walk.keys])),
                float(np.interp(tw, kt, [k[2] for k in walk.keys])),
            )
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

    trees = scene_trees or []
    for i, e in enumerate(cfg.tree_rows_e if scene_trees is None else ()):
        for j, n in enumerate(cfg.tree_cols_n):
            lat, lon = frame.to_latlon(e, n)
            code = f"S{i + 1}-{j + 1}"
            planted_here = code in cfg.planted
            trees.append(
                {
                    "tree_id": None if planted_here else f"T{i + 1}{j + 1:02d}",
                    "slot_code": code,
                    "lat": float(lat),
                    "lon": float(lon),
                    "e": e,
                    "n": n,
                    **({"kind": "sapling"} if planted_here else {}),
                }
            )
    codes = {t["slot_code"] for t in trees if t["tree_id"] is not None}
    unknown = set(cfg.missing) - codes
    if unknown:
        raise ValueError(f"missing trees are not trees of the scene: {sorted(unknown)}")
    for t in trees:
        if t["slot_code"] in cfg.missing:
            t["missing"] = True

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
    first = (walk_t0 - int(cfg.gnss_margin_s * 1e9)) // step * step
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
        # ESP32 boot clock; runs exactly at GPS rate here.
        return 5_000_000 + (g - first) // 1000

    def row(g: int, kind: str, payload: str, pps_ok: bool = True, anchor_s: int = 0):
        """events.csv row; the anchor is the last PPS edge, `anchor_s` seconds older."""
        a = (g // 10**9 - anchor_s) * 10**9
        return (esp(g), g if pps_ok else None, kind, payload, esp(a), a)

    def qr_event(cam_s: float) -> tuple[int, str]:
        g = t0 + round(cam_s * 1e9 * k)
        shown = int((g // 1_000_000) // cfg.qr_refresh_ms * cfg.qr_refresh_ms)
        return shown * 1_000_000 + cfg.qr_event_latency_ms * 1_000_000, encode_qr_payload(
            shown, cfg.session_id
        )

    g_start_qr, start_qr = qr_event(0.5)
    g_end_qr, end_qr = qr_event(tail_start + 0.5)
    g_lost = g_end_qr - 1_600_000_000
    events = [
        row(first, "session_start", f"parcel_id={cfg.parcel_id}"),
        row(g_start_qr, "qr_sync", start_qr),
        # PPS outage around the end QR: its GPS time must be rebuilt from the anchor.
        row(g_lost, "pps_lost", "", anchor_s=1),
        row(g_end_qr, "qr_sync", end_qr, pps_ok=False, anchor_s=3),
        row(g_end_qr + 1_200_000_000, "pps_regained", ""),
        row(last, "session_stop", "command"),
    ]
    boundary_truth: list[dict] = []
    boundary_area = None
    if walk is not None:
        phone_events, boundary_truth, boundary_area = _boundary_events(cfg, walk, walk_t0, frame)
        for ev in phone_events:
            if ev["event_type"] == "corner":
                # The logger marks the corner when the command arrives (BLE latency).
                g = ev["logger_gps_time_ns"]
                events.append(row(g, "corner", ev["payload"]))
        for ev in phone_events:
            ev.pop("logger_gps_time_ns", None)
        events.sort(key=lambda r: r[0])
        (dest / "phone_events.json").write_text(
            json.dumps(phone_events, indent=2) + "\n", encoding="utf-8"
        )
    (dest / "gnss" / "events.csv").write_text(format_events(events), encoding="utf-8")
    logger_session = {
        "format_version": 1,
        "session_id": cfg.session_id,
        "parcel_id": cfg.parcel_id,
        "firmware_version": "0.1.0",
        "receiver": {
            "model": "ZED-F9P",
            "port": "UART1",
            "baud": 460800,
            "meas_period_ms": 200,
            "rawx_rate_hz": 1,
            "nav_pvt_rate_hz": 5,
            "messages": ["RXM-RAWX", "RXM-SFRBX", "NAV-PVT"],
            "nmea": False,
            "timepulse_grid": "GPS",
            "config_status": "ok",
            "detected_baud": 460800,
        },
        "gps_utc_leap_seconds": 18,
        "start": {"esp_micros": esp(first), "gps_time_ns": first, "utc": gps_ns_to_iso(first)},
        "stop": {"esp_micros": esp(last), "gps_time_ns": last, "utc": gps_ns_to_iso(last)},
        "stop_reason": "command",
        "gnss_bytes": len(blob),
        "dropped_bytes": 0,
    }
    (dest / "gnss" / "session.json").write_text(
        json.dumps(logger_session, indent=2) + "\n", encoding="utf-8"
    )
    session = {
        "session_id": cfg.session_id,
        "parcel_id": cfg.parcel_id,
        "kind": "scan",
        "methodology_version": "scan-v1",
        "rig_id": "rig-synth",
        "calibration_id": "cal-synth-1",
        "camera_height_m": cfg.camera_height_m,
        "camera_yaw_offset_deg": 0.0,
        "lead_user_id": "00000000-0000-0000-0000-000000000003",
        "app_version": "synthetic",
    }
    (dest / "session.json").write_text(json.dumps(session, indent=2) + "\n", encoding="utf-8")
    keys = ("tree_id", "slot_code", "lat", "lon")
    public_trees = [{k2: t[k2] for k2 in keys} for t in trees if t["tree_id"] is not None]
    empty = [{k2: t[k2] for k2 in keys[1:]} for t in trees if t["tree_id"] is None]
    listing: dict = {"trees": public_trees}
    if empty:
        listing["empty_slots"] = empty
    (dest / "trees.json").write_text(json.dumps(listing, indent=2) + "\n", encoding="utf-8")
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
        boundary_corners=boundary_truth,
        boundary_area_m2=boundary_area,
        missing=sorted(cfg.missing),
        planted=sorted(cfg.planted),
    )
    (dest / "synthetic_truth.json").write_text(
        json.dumps(asdict(truth), indent=1) + "\n", encoding="utf-8"
    )
    return truth


def _boundary_events(
    cfg: SyntheticConfig, walk: BoundaryWalk, walk_t0: int, frame: LocalFrame
) -> tuple[list[dict], list[dict], float]:
    """The phone's session events of the walk (docs/arayuzler.md, "Sınır köşeleri ve
    kapsama"), the final corners and their area.

    Corner 2 has no logger position on the phone (falls back to the logger's own
    log); corner 5 is timed by the phone clock, off by phone_clock_error_ms.
    """
    ns = uuid.UUID("6f1d0a52-8c4e-4b0e-9a57-2d3c1b0e7f10")

    def event_id(name: str) -> str:
        return str(uuid.uuid5(ns, f"{cfg.session_id}/{name}"))

    def phone_time(g: int) -> str:
        return gps_ns_to_iso(g)

    events: list[dict] = []
    final: list[dict] = []
    latency = cfg.qr_event_latency_ms * 1_000_000
    for no, t, e, n, kept in walk.presses:
        g = walk_t0 + int(round(t * 1e9))
        lat, lon = frame.to_latlon(e, n)
        lat, lon = float(lat), float(lon)
        position = None
        if no != 2:
            position = {
                "lat": lat,
                "lon": lon,
                "height_m": cfg.height0_m,
                "h_acc_m": 0.02,
                "fix_type": 3,
                "num_sv": 18,
                "carr_soln": "fixed",
                "status_gps_time_ns": str(g - 400_000_000),
                "age_ms": 400,
            }
        phone_clock = no == 5
        events.append(
            {
                "id": event_id(f"corner/{no}"),
                "event_type": "corner",
                "payload": str(no),
                "gps_time_ns": g + (cfg.phone_clock_error_ms * 1_000_000 if phone_clock else 0),
                "time_source": "phone" if phone_clock else "gps",
                "phone_time": phone_time(g),
                "logger_result": "ok",
                "data": {"corner_no": no, "position": position},
                "logger_gps_time_ns": g + latency,
            }
        )
        if kept:
            final.append({"corner_no": no, "lat": lat, "lon": lon, "e": e, "n": n})
    g_list = walk_t0 + int(round(walk.list_event_s * 1e9))
    listed = [ev for ev in events if ev["data"]["corner_no"] in (1, 2, 3)]
    events.append(
        {
            "id": event_id("boundary_corners/1"),
            "event_type": "boundary_corners",
            "payload": str(len(listed)),
            "gps_time_ns": g_list,
            "time_source": "gps",
            "phone_time": phone_time(g_list),
            "logger_result": "none",
            "data": {
                "version": 1,
                "corners": [
                    {
                        "event_id": ev["id"],
                        "corner_no": ev["data"]["corner_no"],
                        "note": "sinir tasi" if ev["data"]["corner_no"] == 1 else None,
                        "markers": ["stone"] if ev["data"]["corner_no"] == 1 else [],
                        "photos": [],
                    }
                    for ev in listed
                ],
            },
        }
    )
    events.sort(key=lambda ev: ev["gps_time_ns"])
    en = [(c["e"], c["n"]) for c in final]
    area = 0.5 * abs(
        sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(en, en[1:] + en[:1], strict=True))
    )
    for c in final:
        del c["e"], c["n"]
    return events, final, area
