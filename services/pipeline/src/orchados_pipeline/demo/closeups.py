"""Procedural close-up photos (docs/demo-turu.md §9, "Yakın plan fotoğraflar").

Macro scenes tied to finding types: leaflets (healthy, dry, yellowing), psylla
signs on a leaf, a dry twig, bark with a gum drop, an empty nut cluster. Drawn
with OpenCV primitives over a blurred background; each carries the corner stamp
with its asset key. BGR uint8.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from .dataset import rng
from .render import corner_stamp, fbm_tile

KINDS = (
    "leaflets",
    "leaflets_dry",
    "leaflets_yellow",
    "psyllid",
    "dry_twig",
    "bark",
    "bark_gum",
    "empty_cluster",
)

# Shot code of the close-up protocol (apps/field closeup_protocol.dart, summer-v0.1);
# "extra" for an additional photo outside the required shots.
SHOT_CODE = {
    "leaflets": "Y3_upper",
    "leaflets_dry": "Y3_upper",
    "leaflets_yellow": "Y3_upper",
    "psyllid": "Y3_lower",
    "empty_cluster": "Y2",
    "dry_twig": "extra",
    "bark": "extra",
    "bark_gum": "extra",
}


def _background(g: np.random.Generator, w: int, h: int, key: str) -> np.ndarray:
    tile = fbm_tile(f"bokeh:{key}", 256, 3, 2)
    n = cv2.resize(tile, (w, h), interpolation=cv2.INTER_CUBIC)[..., None]
    sky = np.array([225, 200, 160], np.float32)  # BGR, pale summer sky
    leaf = np.array([40, 95, 55], np.float32) * g.uniform(0.8, 1.2)
    soil = np.array([70, 100, 140], np.float32)
    mix = np.where(n > 0.55, leaf, sky * (1 - n) + soil * n)
    img = cv2.GaussianBlur(mix.astype(np.float32), (0, 0), w / 80)
    return np.clip(img, 0, 255).astype(np.uint8)


def _leaflet(img, c, axes, angle, color, edge, rib=True, spots=0, g=None):
    cv2.ellipse(img, c, axes, angle, 0, 360, color, -1, cv2.LINE_AA)
    if edge is not None:
        cv2.ellipse(img, c, axes, angle, 0, 360, edge, max(2, axes[1] // 9), cv2.LINE_AA)
    # Lighter half: the leaf surface catches the light on one side of the midrib.
    lighter = tuple(int(min(255, v * 1.18)) for v in color)
    cv2.ellipse(img, c, (axes[0], axes[1] // 2), angle, 180, 360, lighter, -1, cv2.LINE_AA)
    if rib:
        a = math.radians(angle)
        dx, dy = int(math.cos(a) * axes[0]), int(math.sin(a) * axes[0])
        rc = tuple(int(v * 0.75) for v in color)
        cv2.line(
            img,
            (c[0] - dx, c[1] - dy),
            (c[0] + dx, c[1] + dy),
            rc,
            max(1, axes[1] // 14),
            cv2.LINE_AA,
        )
        for k in range(-3, 4):
            px, py = c[0] + int(dx * k / 4), c[1] + int(dy * k / 4)
            ox, oy = int(-math.sin(a) * axes[1] * 0.8), int(math.cos(a) * axes[1] * 0.8)
            cv2.line(img, (px, py), (px + ox + dx // 6, py + oy + dy // 6), rc, 1, cv2.LINE_AA)
            cv2.line(img, (px, py), (px - ox + dx // 6, py - oy + dy // 6), rc, 1, cv2.LINE_AA)
    for _ in range(spots):
        r = int(g.integers(2, max(3, axes[1] // 7)))
        px = int(c[0] + g.uniform(-0.7, 0.7) * axes[0] * math.cos(math.radians(angle)))
        py = int(
            c[1]
            + g.uniform(-0.6, 0.6) * axes[1]
            + g.uniform(-0.7, 0.7) * axes[0] * math.sin(math.radians(angle))
        )
        cv2.circle(img, (px, py), r, (215, 228, 232), -1, cv2.LINE_AA)


def _leaf(img, g, w, h, style: str) -> None:
    """A compound pistachio leaf: a rachis with 3-5 leaflets."""
    s = min(w, h)
    base = (int(w * g.uniform(0.25, 0.4)), int(h * g.uniform(0.75, 0.9)))
    tip = (int(w * g.uniform(0.6, 0.75)), int(h * g.uniform(0.15, 0.3)))
    cv2.line(img, base, tip, (60, 110, 120), max(2, s // 120), cv2.LINE_AA)
    green = np.array([45, 125, 70], np.float32) * g.uniform(0.85, 1.1)
    color = {
        "leaflets": green,
        "leaflets_dry": np.array([60, 105, 140], np.float32),
        "leaflets_yellow": np.array([60, 175, 185], np.float32),
        "psyllid": green * 0.9,
    }[style]
    edge = {"leaflets_dry": (40, 70, 110), "psyllid": None}.get(style, None)
    n = int(g.integers(3, 6))
    ang = math.degrees(math.atan2(tip[1] - base[1], tip[0] - base[0]))
    for i in range(n):
        t = 0.3 + 0.7 * i / max(1, n - 1)
        c = (int(base[0] + (tip[0] - base[0]) * t), int(base[1] + (tip[1] - base[1]) * t))
        side = -1 if i % 2 else 1
        if i == n - 1:
            side = 0
        off = s * 0.17 * side
        a = math.radians(ang + 90)
        cc = (int(c[0] + math.cos(a) * off), int(c[1] + math.sin(a) * off))
        la = ang + side * g.uniform(35, 55)
        col = color * g.uniform(0.9, 1.08)
        if style == "leaflets_dry" and g.random() < 0.5:
            col = np.array([70, 120, 160], np.float32)
        _leaflet(
            img,
            cc,
            (int(s * 0.2), int(s * 0.1)),
            la,
            tuple(int(v) for v in col),
            edge,
            spots=int(g.integers(14, 30)) if style == "psyllid" else 0,
            g=g,
        )
    if style == "psyllid":
        # Sooty mould patches and honeydew shine.
        for _ in range(6):
            c = (int(g.uniform(0.2, 0.8) * w), int(g.uniform(0.2, 0.8) * h))
            cv2.ellipse(
                img,
                c,
                (int(s * g.uniform(0.02, 0.05)), int(s * g.uniform(0.01, 0.03))),
                float(g.uniform(0, 180)),
                0,
                360,
                (30, 32, 35),
                -1,
                cv2.LINE_AA,
            )


def _twig(img, g, w, h) -> None:
    s = min(w, h)
    pts = [(int(w * 0.05), int(h * g.uniform(0.6, 0.8)))]
    for k in range(1, 6):
        pts.append((int(w * (0.05 + 0.19 * k)), int(pts[-1][1] - h * g.uniform(0.04, 0.12))))
    for a, b in zip(pts, pts[1:], strict=False):
        cv2.line(img, a, b, (95, 110, 120), max(4, s // 40), cv2.LINE_AA)
        cv2.line(img, a, b, (130, 145, 155), max(1, s // 160), cv2.LINE_AA)
    for p in pts[1:-1]:
        q = (int(p[0] + g.uniform(-0.1, 0.1) * w), int(p[1] - g.uniform(0.1, 0.25) * h))
        cv2.line(img, p, q, (90, 105, 115), max(2, s // 80), cv2.LINE_AA)
        # A curled, dead leaflet still attached.
        cv2.ellipse(
            img,
            q,
            (int(s * 0.07), int(s * 0.03)),
            float(g.uniform(0, 180)),
            0,
            300,
            (55, 95, 135),
            -1,
            cv2.LINE_AA,
        )


def _bark(img, g, w, h, key: str, gum: bool) -> None:
    tile = fbm_tile(f"barkmacro:{key}", 256, 5, 4)
    n = cv2.resize(tile, (w // 4, h), interpolation=cv2.INTER_CUBIC)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
    base = np.array([70, 85, 100], np.float32)
    bark = base * (0.6 + 0.8 * n[..., None])
    cracks = (np.abs(np.sin(np.arange(w, dtype=np.float32)[None, :] * 0.05 + n * 9)) < 0.08)[
        ..., None
    ]
    bark = np.where(cracks, bark * 0.45, bark)
    x0, x1 = int(w * 0.18), int(w * 0.82)
    img[:, x0:x1] = bark[:, x0:x1].astype(np.uint8)
    if gum:
        c = (int(w * g.uniform(0.4, 0.6)), int(h * g.uniform(0.45, 0.65)))
        ax = (int(w * 0.045), int(h * 0.075))
        cv2.ellipse(
            img,
            (c[0], c[1] - ax[1]),
            (ax[0] // 2, ax[1]),
            0,
            0,
            360,
            (40, 120, 190),
            -1,
            cv2.LINE_AA,
        )
        cv2.ellipse(img, c, ax, 0, 0, 360, (30, 110, 185), -1, cv2.LINE_AA)
        cv2.ellipse(
            img,
            (c[0] - ax[0] // 3, c[1] - ax[1] // 3),
            (ax[0] // 4, ax[1] // 5),
            -30,
            0,
            360,
            (200, 230, 245),
            -1,
            cv2.LINE_AA,
        )
        # A wound: dark, wet bark around the drop.
        cv2.ellipse(
            img,
            (c[0], c[1] - ax[1] * 2),
            (int(ax[0] * 1.6), int(ax[1] * 1.4)),
            0,
            0,
            360,
            (35, 45, 55),
            max(3, w // 200),
            cv2.LINE_AA,
        )


def _cluster(img, g, w, h) -> None:
    s = min(w, h)
    top = (int(w * 0.5), int(h * 0.08))
    cv2.line(img, top, (int(w * 0.5), int(h * 0.55)), (70, 120, 130), max(3, s // 90), cv2.LINE_AA)
    for k in range(9):
        y = int(h * (0.15 + 0.05 * k))
        x = int(w * 0.5 + (1 if k % 2 else -1) * w * g.uniform(0.08, 0.2))
        cv2.line(
            img,
            (int(w * 0.5), y),
            (x, y + int(h * 0.08)),
            (70, 120, 130),
            max(2, s // 160),
            cv2.LINE_AA,
        )
        full = g.random() < 0.25
        r = int(s * (0.035 if full else 0.018))
        col = (135, 165, 215) if full else (80, 120, 150)
        cv2.ellipse(
            img, (x, y + int(h * 0.08) + r), (r, int(r * 1.3)), 0, 0, 360, col, -1, cv2.LINE_AA
        )


def render_closeup(kind: str, key: str, size: tuple[int, int]) -> np.ndarray:
    """A close-up photo of the given kind, stamped with its key."""
    if kind not in KINDS:
        raise ValueError(f"unknown close-up kind {kind}")
    w, h = size
    g = rng(f"closeup:{key}")
    img = _background(g, w, h, key)
    if kind.startswith("leaflets") or kind == "psyllid":
        _leaf(img, g, w, h, kind)
    elif kind == "dry_twig":
        _twig(img, g, w, h)
    elif kind in ("bark", "bark_gum"):
        _bark(img, g, w, h, key, kind == "bark_gum")
    else:
        _cluster(img, g, w, h)
    # A little sensor noise, seeded.
    noise = g.normal(0, 3.0, img.shape).astype(np.float32)
    img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return corner_stamp(img, key)
