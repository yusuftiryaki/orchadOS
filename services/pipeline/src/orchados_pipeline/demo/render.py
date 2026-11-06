"""Equirectangular renderer of a synthetic pistachio orchard (docs/demo-turu.md §9).

Same convention as the pipeline (projection.py): the centre column looks along
the heading, azimuth grows to the right (clockwise from above), the top row is
the zenith and the bottom row the nadir. Pixel centres: azimuth
heading + ((x + 0.5) / W - 0.5) * 360, elevation (0.5 - (y + 0.5) / H) * 180.

Work is in the parcel-local frame (x along the rows, y across, z up, metres).

- Sky and hills are drawn once per visit at heading 0 and rolled to each
  frame's heading (they are at infinity).
- The ground is a per-visit texture of the parcel (soil, furrows, dry grass,
  tyre tracks, drip lines, crown shadows) sampled with cv2.remap at the point
  each downward ray meets the ground.
- Trees are rasterised object by object: each ellipsoid, capsule and sphere is
  projected to its angular bounding box and only those pixels are tested and
  z-buffered. There is no per-pixel loop over the objects.

Every random choice comes from dataset.rng(key): same machine, same bytes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

import cv2
import numpy as np

from .dataset import CAMERA_HEIGHT_M, Dataset, ParcelSpec, Tree, Visit, rng, tree_class, tree_values

STAMP = "orchadOS SENTETIK ORNEK"
TAU = 2 * math.pi


@dataclass(frozen=True)
class Profile:
    name: str
    full: tuple[int, int]
    preview: tuple[int, int]
    crop: int
    closeup: tuple[int, int]
    full_quality: int
    preview_quality: int
    jpeg_quality: int


PROFILES = {
    "full": Profile("full", (3840, 1920), (1920, 960), 1024, (1600, 1200), 85, 80, 90),
    "test": Profile("test", (1024, 512), (512, 256), 256, (400, 300), 70, 70, 80),
}


# ---------------------------------------------------------------------------------------
# Noise
# ---------------------------------------------------------------------------------------


def fbm_tile(key: str, size: int = 512, octaves: int = 5, base: int = 4) -> np.ndarray:
    """Tileable fractal noise in [0, 1], float32 (size x size)."""
    g = rng(f"noise:{key}")
    out = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = base * 2**o
        grid = g.random((n, n)).astype(np.float32)
        # Wrap the grid so the upsampled tile is seamless.
        grid = np.pad(grid, 1, mode="wrap")
        up = cv2.resize(
            grid, ((n + 2) * size // n, (n + 2) * size // n), interpolation=cv2.INTER_CUBIC
        )
        off = size // n
        out += amp * up[off : off + size, off : off + size]
        total += amp
        amp *= 0.5
    out /= total
    lo, hi = np.percentile(out, (1, 99))
    return np.clip((out - lo) / (hi - lo), 0, 1).astype(np.float32)


def fbm_1d(key: str, n: int, octaves: int = 5) -> np.ndarray:
    """Periodic 1D noise of length n in [0, 1]."""
    tile = fbm_tile(key, 256, octaves, 2)
    row = tile[17]
    x = np.linspace(0, 256, n, endpoint=False).astype(np.float32)
    return np.interp(x, np.arange(257), np.append(row, row[0])).astype(np.float32)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------------
# Sun
# ---------------------------------------------------------------------------------------


def sun_position(when: datetime, lat: float, lon: float) -> tuple[float, float]:
    """Solar azimuth (clockwise from north) and elevation in degrees (NOAA approximation)."""
    doy = when.timetuple().tm_yday
    hour = when.hour + when.minute / 60 + when.second / 3600
    g = TAU / 365 * (doy - 1 + (hour - 12) / 24)
    eqt = 229.18 * (
        0.000075
        + 0.001868 * math.cos(g)
        - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g)
        - 0.040849 * math.sin(2 * g)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.00148 * math.sin(3 * g)
    )
    tst = hour * 60 + eqt + 4 * lon
    ha = math.radians(tst / 4 - 180)
    phi = math.radians(lat)
    cos_z = math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1.0, min(1.0, cos_z)))
    az = math.degrees(
        math.atan2(math.sin(ha), math.cos(ha) * math.sin(phi) - math.tan(decl) * math.cos(phi))
    )
    return (az + 180) % 360, 90 - math.degrees(zen)


def local_dir(parcel: ParcelSpec, azimuth_deg: float, elevation_deg: float) -> np.ndarray:
    """Unit vector of a world azimuth / elevation in the parcel-local frame."""
    phi = math.radians(azimuth_deg - parcel.row_azimuth_deg)
    el = math.radians(elevation_deg)
    return np.array([math.cos(el) * math.cos(phi), -math.cos(el) * math.sin(phi), math.sin(el)])


# ---------------------------------------------------------------------------------------
# Tree primitives
# ---------------------------------------------------------------------------------------

FOLIAGE = {
    "healthy": (0.21, 0.40, 0.15),
    "attention": (0.46, 0.50, 0.18),
    "problem": (0.33, 0.40, 0.17),
}
MALE_TINT = (0.95, 1.0, 1.08)
BROWN = (0.42, 0.31, 0.19)
BARK = (0.36, 0.30, 0.25)
DEAD_WOOD = (0.55, 0.52, 0.48)
STAKE = (0.66, 0.55, 0.38)
NUT = (0.86, 0.62, 0.52)


@dataclass
class Ellipsoid:
    c: np.ndarray
    r: np.ndarray
    color: tuple[float, float, float]
    holes: float = 0.0  # leaf-noise threshold below which the crown is see-through
    brown: float = 2.0  # leaf-noise threshold above which leaves are brown
    tex: tuple[int, int] = (0, 0)
    scale: float = 1.0  # texture repeats
    shiny: float = 0.0

    @property
    def radius(self) -> float:
        return float(self.r.max())

    @property
    def center(self) -> np.ndarray:
        return self.c


@dataclass
class Capsule:
    a: np.ndarray
    b: np.ndarray
    r: float
    color: tuple[float, float, float]
    bark: bool = True

    @property
    def center(self) -> np.ndarray:
        return (self.a + self.b) / 2

    @property
    def radius(self) -> float:
        return float(np.linalg.norm(self.b - self.a)) / 2 + self.r


@dataclass
class TreeShape:
    code: str
    xy: tuple[float, float]
    prims: list = field(default_factory=list)
    shadow_r: float = 0.0
    shadow_h: float = 0.0


def tree_shape(tree: Tree, cls: str, values: dict, visit_key: str) -> TreeShape:
    """Primitives of one tree as it looked in a visit."""
    g = rng(f"shape:{tree.slot.key}")  # same skeleton every year
    gy = rng(f"shape:{tree.slot.key}:{visit_key}")
    x, y = tree.xy
    shape = TreeShape(tree.code, (x, y))
    lean = math.radians(tree.lean_deg)
    ld = math.radians(tree.lean_dir_deg)
    if cls == "absent":  # cut: a stump
        shape.prims.append(Capsule(np.array([x, y, 0.0]), np.array([x, y, 0.28]), 0.16, BARK))
        return shape
    trunk_r = {"sapling": 0.03, "young": 0.08, "productive": 0.13, "old": 0.17}[tree.age_class]
    trunk_h = tree.height_m - 1.6 * tree.crown_r_m
    top = np.array(
        [
            x + math.sin(lean) * math.cos(ld) * trunk_h,
            y + math.sin(lean) * math.sin(ld) * trunk_h,
            trunk_h,
        ]
    )
    base = np.array([x, y, 0.0])
    shape.prims.append(Capsule(base, top, trunk_r, BARK))
    if tree.stem_form == "multi":
        off = np.array([0.25, -0.15, 0])
        shape.prims.append(
            Capsule(base + off, base + off + (top - base) * 0.8, trunk_r * 0.7, BARK)
        )
    if tree.age_class == "sapling":
        shape.prims.append(
            Capsule(base + [0.12, 0.05, 0], base + [0.12, 0.05, 1.5], 0.018, STAKE, bark=False)
        )
    centre = top + np.array([0, 0, tree.crown_r_m * 0.75])
    shape.shadow_r = tree.crown_r_m * 1.05
    shape.shadow_h = float(centre[2])

    # Scaffold branches: seen through sparse crowns, all that is left of a dead tree.
    n_branch = 4 if cls in ("problem", "dead") else 2
    for i in range(n_branch):
        a = g.uniform(0, TAU) + i * TAU / n_branch
        reach = 0.8 if cls == "dead" else 0.55
        tip = centre + np.array(
            [
                math.cos(a) * tree.crown_r_m * reach,
                math.sin(a) * tree.crown_r_m * reach,
                g.uniform(-0.1, 0.3) * tree.crown_r_m,
            ]
        )
        color = DEAD_WOOD if cls == "dead" else BARK
        shape.prims.append(Capsule(top, tip, trunk_r * 0.45, color))
        if cls == "dead":
            for _ in range(2):
                twig = tip + np.array([g.normal(0, 0.5), g.normal(0, 0.5), g.uniform(0.2, 0.7)])
                shape.prims.append(Capsule(tip, twig, trunk_r * 0.18, DEAD_WOOD))
    if cls == "dead":
        shape.shadow_r *= 0.4
        return shape

    color = np.array(FOLIAGE.get(cls, FOLIAGE["healthy"]))
    if tree.sex == "male":
        color = color * np.array(MALE_TINT)
    holes = {"healthy": 0.12, "attention": 0.2, "problem": 0.5}[cls]
    brown = {"healthy": 1.5, "attention": 0.9, "problem": 0.72}[cls]
    n = int(g.integers(6, 13))
    clusters = []
    for _ in range(n):
        u = g.normal(size=3)
        u /= np.linalg.norm(u) + 1e-9
        d = tree.crown_r_m * 0.55 * g.uniform(0.3, 1.0)
        c = centre + u * d * np.array([1.0, 1.0, 0.65])
        rh = tree.crown_r_m * g.uniform(0.45, 0.7)
        r = np.array(
            [rh * g.uniform(0.9, 1.1), rh * g.uniform(0.9, 1.1), rh * g.uniform(0.65, 0.85)]
        )
        jitter = np.clip(color * g.uniform(0.9, 1.1, 3), 0, 1)
        clusters.append((c, r))
        shape.prims.append(
            Ellipsoid(
                c,
                r,
                tuple(jitter),
                holes=holes,
                brown=brown,
                tex=(int(g.integers(0, 256)), int(g.integers(0, 256))),
                scale=max(1.0, rh * 2.2),
            )
        )
    # Nut clusters on the outside of the crown: more in an "on" year.
    fruit = values.get("fruit_load_scale")
    if tree.sex == "female" and fruit:
        for _ in range(int(fruit) * 5 + int(gy.integers(0, 4))):
            c, r = clusters[int(gy.integers(0, len(clusters)))]
            u = gy.normal(size=3)
            u[2] = -abs(u[2]) * 0.6
            u /= np.linalg.norm(u) + 1e-9
            p = c + u * r * 0.98
            rr = gy.uniform(0.07, 0.11)
            shape.prims.append(
                Ellipsoid(p, np.array([rr, rr, rr * 1.4]), NUT, shiny=0.4, scale=0.0)
            )
    return shape


def slot_marker(x: float, y: float) -> TreeShape:
    """An empty slot with a planting stake."""
    s = TreeShape("stake", (x, y))
    s.prims.append(Capsule(np.array([x, y, 0.0]), np.array([x, y, 1.2]), 0.02, STAKE, bark=False))
    return s


# ---------------------------------------------------------------------------------------
# Scene of one visit
# ---------------------------------------------------------------------------------------


@dataclass
class Scene:
    visit: Visit
    profile: Profile
    shapes: list[TreeShape]
    sun: np.ndarray  # local frame unit vector
    sky: np.ndarray  # far field at heading 0, float32 RGB, H x W x 3 (NaN below the hills)
    ground: np.ndarray  # parcel texture, float32 RGB
    ground_box: tuple[float, float, float, float]  # x0, y0, x1, y1 (local metres)
    ground_res: float
    detail: np.ndarray  # fine soil noise tile
    leaf: np.ndarray  # leaf noise tile (clumps)
    leaf_fine: np.ndarray  # leaflets
    bark: np.ndarray


def visit_shapes(ds: Dataset, visit: Visit) -> list[TreeShape]:
    """What stood in the parcel at the time of the visit (year classes, values)."""
    p = visit.parcel
    if visit.season == "winter":
        # Version 6: leafless trees (demo/winter.py).
        from .winter import winter_shape

        shapes = [winter_shape(t, tree_class(visit.key, t.code), visit) for t in ds.trees[p.key]]
    else:
        shapes = _summer_shapes(ds, visit)
    empty = [s for s in ds.slots[p.key] if s.code not in {t.code for t in ds.trees[p.key]}]
    for i, s in enumerate(empty):
        if i % 2 == 0:
            shapes.append(slot_marker(*s.xy))
    return shapes


def _summer_shapes(ds: Dataset, visit: Visit) -> list[TreeShape]:
    p = visit.parcel
    # The parcel's summer scan of the same year (inventories come a month before it).
    scan = next(s for s in ds.summer_scans() if s.parcel.key == p.key and s.year == visit.year)
    shapes = []
    for t in ds.trees[p.key]:
        cls = tree_class(scan.key, t.code)
        if visit.kind != "periodic_scan":
            # A month earlier: what the scan finds damaged only shows its first signs.
            cls = {"problem": "attention", "dead": "attention", "absent": "healthy"}.get(cls, cls)
        values = tree_values(scan, t, cls)
        shapes.append(tree_shape(t, cls, values, visit.key))
    return shapes


def make_scene(ds: Dataset, visit: Visit, profile: Profile) -> Scene:
    p = visit.parcel
    W, H = profile.full
    mid = visit.start + (visit.end - visit.start) / 2
    lat, lon = p.to_latlon(p.length_m / 2, p.width_m / 2)
    sun_az, sun_el = sun_position(mid, lat, lon)
    sun = local_dir(p, sun_az, sun_el)
    shapes = visit_shapes(ds, visit)
    sky = _far_field(visit, p, W, H, sun_az, sun_el)
    ground, box, res = _ground_texture(
        visit, p, shapes, sun, 0.05 if profile.name == "full" else 0.1
    )
    return Scene(
        visit=visit,
        profile=profile,
        shapes=shapes,
        sun=sun,
        sky=sky,
        ground=ground,
        ground_box=box,
        ground_res=res,
        detail=fbm_tile(f"detail:{p.key}", 256, 4, 8),
        leaf=fbm_tile("leaf", 256, 4, 16),
        leaf_fine=fbm_tile("leaf-fine", 256, 2, 64),
        bark=fbm_tile("bark", 256, 3, 8),
    )


def _angles(W: int, H: int) -> tuple[np.ndarray, np.ndarray]:
    off = ((np.arange(W, dtype=np.float32) + 0.5) / W - 0.5) * TAU
    el = (0.5 - (np.arange(H, dtype=np.float32) + 0.5) / H) * math.pi
    return off, el


HORIZON = np.array([0.86, 0.84, 0.80], np.float32)
ZENITH = np.array([0.30, 0.52, 0.86], np.float32)
HAZE = np.array([0.80, 0.80, 0.78], np.float32)


def _far_field(
    visit: Visit, p: ParcelSpec, W: int, H: int, sun_az: float, sun_el: float
) -> np.ndarray:
    """Sky, sun and hills at heading 0, world azimuth per column."""
    off, el = _angles(W, H)
    h2 = H // 2
    elu = el[:h2][:, None]
    az = off[None, :]
    t = np.sqrt(np.clip(elu / (math.pi / 2), 0, 1))
    sky = HORIZON * (1 - t[..., None]) + ZENITH * t[..., None]
    # Sun disc and glow.
    se, sa = math.radians(sun_el), math.radians(sun_az)
    cosang = np.sin(elu) * math.sin(se) + np.cos(elu) * math.cos(se) * np.cos(az - sa)
    glow = 0.35 * np.exp((cosang - 1) * 30) + 0.25 * np.exp((cosang - 1) * 400)
    sky = sky + glow[..., None] * np.array([1.0, 0.95, 0.85], np.float32)
    disc = smoothstep(math.cos(math.radians(0.75)), math.cos(math.radians(0.6)), cosang)
    sky = sky * (1 - disc[..., None]) + disc[..., None] * np.array([1.0, 1.0, 0.97], np.float32)
    # Fair-weather clouds on a plane above the camera, thinning towards the horizon.
    tile = fbm_tile(f"clouds:{visit.key}", 512, 6, 3)
    s = np.maximum(np.sin(elu), 0.02)
    u = (np.cos(elu) * np.sin(az) / s * 60 + 256).astype(np.float32)
    v = (np.cos(elu) * np.cos(az) / s * 60 + 256).astype(np.float32)
    cl = cv2.remap(
        tile, np.mod(u, 512), np.mod(v, 512), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP
    )
    cover = smoothstep(0.62, 0.85, cl) * smoothstep(0.02, 0.25, elu)
    shade = 0.92 + 0.08 * cl
    sky = (
        sky * (1 - cover[..., None] * 0.85)
        + (cover * shade)[..., None] * np.array([0.98, 0.98, 0.97], np.float32) * 0.85
    )
    # Hills: two ridges with distance haze.
    far = np.full((H, W, 3), np.nan, np.float32)
    far[:h2] = sky
    for k, (base, amp, col, haze) in enumerate(
        (
            (1.6, 2.4, (0.62, 0.60, 0.55), 0.55),
            (0.6, 1.4, (0.55, 0.47, 0.36), 0.25),
        )
    ):
        ridge = np.radians(base + amp * fbm_1d(f"hills:{p.key}:{k}", W, 6))
        mask = (elu >= 0) & (elu <= ridge[None, :])
        tex = fbm_tile(f"hilltex:{p.key}:{k}", 256, 4, 16)
        ti = cv2.resize(tex, (W, h2), interpolation=cv2.INTER_LINEAR)
        c = np.array(col, np.float32) * (0.85 + 0.25 * ti[..., None])
        c = c * (1 - haze) + HORIZON * haze
        far[:h2][mask] = c[mask]
    far[: H // 2][np.isnan(far[: H // 2, :, 0])] = HORIZON
    return far


def _ground_texture(
    visit: Visit, p: ParcelSpec, shapes: list[TreeShape], sun: np.ndarray, res: float
) -> tuple[np.ndarray, tuple[float, float, float, float], float]:
    margin = 40.0
    x0, y0, x1, y1 = -margin, -margin, p.length_m + margin, p.width_m + margin
    w, h = int((x1 - x0) / res), int((y1 - y0) / res)
    xs = x0 + (np.arange(w, dtype=np.float32) + 0.5) * res
    ys = y1 - (np.arange(h, dtype=np.float32) + 0.5) * res  # row 0 = north edge (max y)
    in_x = (xs > 0) & (xs < p.length_m)
    in_y = (ys > 0) & (ys < p.width_m)
    inside = in_y[:, None] & in_x[None, :]
    n1 = cv2.resize(fbm_tile(f"soil:{p.key}", 512, 6, 4), (w, h), interpolation=cv2.INTER_LINEAR)
    n2 = cv2.resize(
        fbm_tile(f"grass:{visit.key}", 512, 5, 6), (w, h), interpolation=cv2.INTER_LINEAR
    )
    # Dry grass: patches, denser outside the parcel and along its edges.
    ex = np.minimum(np.abs(xs), np.abs(xs - p.length_m))
    ey = np.minimum(np.abs(ys), np.abs(ys - p.width_m))
    edge = np.exp(-np.minimum(ey[:, None], ex[None, :]) / 1.5)
    grass = smoothstep(
        0.55, 0.75, n2 + np.where(inside, 0.0, 0.25).astype(np.float32) + 0.25 * edge
    )
    # Furrows along the rows and tyre tracks in the aisles: functions of y only.
    row = (0.93 + 0.05 * (1 + np.sin(ys * TAU / 0.55))).astype(np.float32)
    for k in range(p.rows + 1):
        ay = k * p.row_spacing_m
        for side in (-0.75, 0.75):
            row *= 1 - 0.18 * smoothstep(0.22, 0.08, np.abs(ys - ay - side))
    light = np.where(inside, row[:, None], np.float32(1.0)) * (0.82 + 0.3 * n1)
    soil = np.array([0.58, 0.40, 0.29], np.float32)
    straw = np.array([0.78, 0.68, 0.45], np.float32)
    g3 = grass[..., None]
    img = (soil * light[..., None]) * (1 - g3) + straw * (0.85 + 0.2 * n1[..., None]) * g3
    canvas = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    # Drip lines along the rows.
    for r in range(1, p.rows + 1):
        yy = r * p.row_spacing_m - p.row_spacing_m / 2 + 0.25
        py = int((y1 - yy) / res)
        cv2.line(
            canvas,
            (int((0.3 - x0) / res), py),
            (int((p.length_m - 0.3 - x0) / res), py),
            (38, 36, 34),
            max(1, int(0.02 / res)),
            cv2.LINE_AA,
        )
    # Crown shadows, cast away from the sun.
    shadow = np.zeros((h, w), np.uint8)
    hor = float(np.hypot(sun[0], sun[1]))
    k = 1.0 / max(float(sun[2]), 0.15)
    for s in shapes:
        if s.shadow_r <= 0:
            continue
        sx = s.xy[0] - sun[0] * k * s.shadow_h
        sy = s.xy[1] - sun[1] * k * s.shadow_h
        stretch = 1 + hor * k * 0.25
        cv2.ellipse(
            shadow,
            (int((sx - x0) / res), int((y1 - sy) / res)),
            (int(s.shadow_r * stretch / res), int(s.shadow_r / res)),
            -math.degrees(math.atan2(sun[1], sun[0])),
            0,
            360,
            255,
            -1,
            cv2.LINE_AA,
        )
    shadow = cv2.GaussianBlur(shadow, (0, 0), 0.3 / res)
    dark = (255 - (shadow.astype(np.uint16) * 128 >> 8)).astype(np.uint16)
    canvas = (canvas.astype(np.uint16) * dark[..., None] >> 8).astype(np.uint8)
    return canvas.astype(np.float32) / 255, (x0, y0, x1, y1), res


# ---------------------------------------------------------------------------------------
# Rendering a frame
# ---------------------------------------------------------------------------------------


def _col_ranges(c0: float, c1: float, W: int) -> list[tuple[int, int]]:
    """Integer column ranges covering [c0, c1] (pixel coordinates, may wrap)."""
    if c1 - c0 >= W - 1:
        return [(0, W)]
    a, b = int(math.floor(c0)), int(math.ceil(c1)) + 1
    if a < 0:
        return [(0, min(b, W)), (W + a, W)]
    if b > W:
        return [(a, W), (0, b - W)]
    return [(a, b)]


def render(scene: Scene, x: float, y: float, heading_deg: float, label: str) -> np.ndarray:
    """BGR uint8 panorama at the profile's full size, camera at (x, y) local."""
    W, H = scene.profile.full
    p = scene.visit.parcel
    off, el = _angles(W, H)
    h2 = H // 2
    shift = int(round(heading_deg / 360.0 * W)) % W
    img = np.roll(scene.sky, -shift, axis=1).copy()
    zbuf = np.full((H, W), np.inf, np.float32)
    # phi: azimuth in the local frame (from +x, counter-clockwise is +y).
    phi0 = math.radians(heading_deg - p.row_azimuth_deg)
    phi = off + phi0
    cphi, sphi = np.cos(phi).astype(np.float32), np.sin(phi).astype(np.float32)
    cel, sel = np.cos(el).astype(np.float32), np.sin(el).astype(np.float32)
    cam = np.array([x, y, CAMERA_HEIGHT_M], np.float32)

    # --- ground ------------------------------------------------------------------------
    gel = el[h2:]
    d = np.minimum(CAMERA_HEIGHT_M / np.tan(-gel), 4000.0).astype(np.float32)[:, None]
    gx = cam[0] + d * cphi[None, :]
    gy = cam[1] - d * sphi[None, :]
    x0, y0, x1, y1 = scene.ground_box
    res = scene.ground_res
    u = ((gx - x0) / res - 0.5).astype(np.float32)
    v = ((y1 - gy) / res - 0.5).astype(np.float32)
    ground = cv2.remap(scene.ground, u, v, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    det = cv2.remap(
        scene.detail,
        np.mod(gx * 40, 256).astype(np.float32),
        np.mod(gy * 40, 256).astype(np.float32),
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_WRAP,
    )
    near = np.exp(-d / 6.0) * 0.35
    ground *= 1 + (det - 0.5)[..., None] * near[..., None]
    fog = (1 - np.exp(-d / 420.0))[..., None]
    ground *= 1 - fog
    ground += HORIZON * fog
    img[h2:] = ground
    zbuf[h2:] = (d / np.cos(gel)[:, None]).astype(np.float32)

    # --- trees -------------------------------------------------------------------------
    sun = scene.sun.astype(np.float32)
    for s in scene.shapes:
        for prim in s.prims:
            _draw(img, zbuf, prim, cam, phi0, cphi, sphi, cel, sel, W, H, sun, scene)

    out = np.clip(img, 0, 1)
    out = cv2.cvtColor((out * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR)
    _nadir_stamp(out, label)
    return out


def _draw(img, zbuf, prim, cam, phi0, cphi, sphi, cel, sel, W, H, sun, scene) -> None:
    vc = prim.center.astype(np.float32) - cam
    dist = float(np.linalg.norm(vc))
    R = prim.radius
    if dist < 1e-3:
        return
    # Angular bounding box of the bounding sphere.
    ec = math.asin(max(-1.0, min(1.0, vc[2] / dist)))
    if dist <= R * 1.02:
        rows, cols = (0, H), [(0, W)]
    else:
        alpha = math.asin(R / dist)
        e_lo, e_hi = ec - alpha, ec + alpha
        r0 = max(0, int((0.5 - e_hi / math.pi) * H - 1))
        r1 = min(H, int((0.5 - e_lo / math.pi) * H + 2))
        rows = (r0, r1)
        emax = max(abs(e_lo), abs(e_hi))
        if emax >= math.pi / 2 - 1e-3:
            cols = [(0, W)]
        else:
            half = min(math.pi, alpha / math.cos(emax) * 1.05)
            pc = math.atan2(-vc[1], vc[0])
            o = (pc - phi0 + math.pi) % TAU - math.pi
            c = (o / TAU + 0.5) * W - 0.5
            hw = half / TAU * W
            cols = _col_ranges(c - hw - 1, c + hw + 1, W)
        if r1 <= r0:
            return
    for c0, c1 in cols:
        if c1 <= c0:
            continue
        ys = slice(rows[0], rows[1])
        xs = slice(c0, c1)
        ce, se_ = cel[ys][:, None], sel[ys][:, None]
        dx = ce * cphi[None, xs]
        dy = -ce * sphi[None, xs]
        dz = np.broadcast_to(se_, dx.shape)
        if isinstance(prim, Ellipsoid):
            hit, t, col = _ellipsoid(prim, cam, dx, dy, dz, sun, scene)
        else:
            hit, t, col = _capsule(prim, cam, dx, dy, dz, sun, scene)
        if hit is None:
            continue
        zb = zbuf[ys, xs]
        m = hit & (t < zb)
        if not m.any():
            continue
        fog = 1 - np.exp(-t[m] / 420.0)
        zb[m] = t[m]
        block = img[ys, xs]
        block[m] = col[m] * (1 - fog[:, None]) + HORIZON * fog[:, None]


def _ellipsoid(e: Ellipsoid, cam, dx, dy, dz, sun, scene):
    r = e.r.astype(np.float32)
    oc = (cam - e.c.astype(np.float32)) / r
    ux, uy, uz = dx / r[0], dy / r[1], dz / r[2]
    a = ux * ux + uy * uy + uz * uz
    b = 2 * (oc[0] * ux + oc[1] * uy + oc[2] * uz)
    c = float(oc @ oc) - 1
    disc = b * b - 4 * a * c
    hit = disc > 0
    if not hit.any():
        return None, None, None
    t = (-b - np.sqrt(np.maximum(disc, 0))) / (2 * a)
    hit &= t > 0.05
    px, py, pz = cam[0] + t * dx, cam[1] + t * dy, cam[2] + t * dz
    nx, ny, nz = (px - e.c[0]) / r[0] ** 2, (py - e.c[1]) / r[1] ** 2, (pz - e.c[2]) / r[2] ** 2
    nn = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
    nx, ny, nz = nx / nn, ny / nn, nz / nn
    lam = np.maximum(nx * sun[0] + ny * sun[1] + nz * sun[2], 0)
    base = np.array(e.color, np.float32)
    if e.scale > 0:
        # Leaves: fine noise fixed to the crown surface (40 texels per metre) over
        # coarse clumps; the rim is more see-through, so the outline is ragged.
        fine = _bilinear(scene.leaf_fine, (px + 0.7 * py) * 40 + e.tex[0], pz * 40 + e.tex[1])
        clump = _bilinear(scene.leaf, (px - 0.6 * py) * 6 + e.tex[1], pz * 6 + e.tex[0])
        n = 0.6 * fine + 0.4 * clump
        facing = np.abs(nx * dx + ny * dy + nz * dz)
        hit &= n >= e.holes + 0.45 * (1 - facing) ** 2
        light = 0.42 + 0.85 * lam * (0.45 + 1.0 * fine)
        col = base * light[..., None] * (0.55 + 0.9 * fine[..., None])
        if e.brown < 1.5:
            br = smoothstep(e.brown, e.brown + 0.05, clump)
            col = (
                col * (1 - br[..., None])
                + np.array(BROWN, np.float32) * light[..., None] * br[..., None]
            )
    else:
        light = 0.45 + 0.7 * lam
        col = base * light[..., None]
        spec = np.power(np.maximum(lam, 0), 12) * e.shiny
        col = col + spec[..., None]
    return hit, t, col


def _bilinear(tile: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Bilinear lookup in a 256 x 256 tile, wrapping."""
    u0, v0 = np.floor(u), np.floor(v)
    fu, fv = (u - u0).astype(np.float32), (v - v0).astype(np.float32)
    iu, iv = u0.astype(np.int32) & 255, v0.astype(np.int32) & 255
    iu1, iv1 = (iu + 1) & 255, (iv + 1) & 255
    top = tile[iv, iu] * (1 - fu) + tile[iv, iu1] * fu
    bot = tile[iv1, iu] * (1 - fu) + tile[iv1, iu1] * fu
    return top * (1 - fv) + bot * fv


def _capsule(cp: Capsule, cam, dx, dy, dz, sun, scene):
    """Ray against a finite cylinder (axis a->b, radius r), no caps."""
    a = cp.a.astype(np.float32)
    ba = cp.b.astype(np.float32) - a
    oc = cam - a
    baba = float(ba @ ba)
    bard = ba[0] * dx + ba[1] * dy + ba[2] * dz
    baoc = float(ba @ oc)
    ocd = oc[0] * dx + oc[1] * dy + oc[2] * dz
    k2 = baba - bard * bard
    k1 = baba * ocd - baoc * bard
    k0 = baba * float(oc @ oc) - baoc * baoc - cp.r * cp.r * baba
    h = k1 * k1 - k2 * k0
    hit = (h > 0) & (np.abs(k2) > 1e-9)
    if not hit.any():
        return None, None, None
    t = (-k1 - np.sqrt(np.maximum(h, 0))) / np.where(np.abs(k2) > 1e-9, k2, 1)
    yy = baoc + t * bard
    hit &= (yy > 0) & (yy < baba) & (t > 0.05)
    px = oc[0] + t * dx - ba[0] * yy / baba
    py = oc[1] + t * dy - ba[1] * yy / baba
    pz = oc[2] + t * dz - ba[2] * yy / baba
    nn = np.sqrt(px * px + py * py + pz * pz) + 1e-9
    lam = np.maximum((px * sun[0] + py * sun[1] + pz * sun[2]) / nn, 0)
    base = np.array(cp.color, np.float32)
    if cp.bark:
        ang = np.arctan2(py, px)
        iu = (ang / TAU * 64).astype(np.int32) & 255
        iv = (yy / baba * 120 * math.sqrt(baba)).astype(np.int32) & 255
        n = scene.bark[iv, iu]
        tex = 0.65 + 0.6 * n
    else:
        tex = np.ones_like(lam)
    col = base * ((0.4 + 0.75 * lam) * tex)[..., None]
    return hit, t, col


def _nadir_stamp(img: np.ndarray, label: str) -> None:
    """Disc where the rig stands, with the synthetic stamp written around it."""
    H, W = img.shape[:2]
    y0 = int(H * (0.5 + 74 / 180))
    img[y0:] = (img[y0:] * 0.25 + 26).astype(np.uint8)
    ring = int(H * (0.5 + 73 / 180))
    img[ring:y0] = (img[ring:y0] * 0.4 + 130).astype(np.uint8)
    text = f"{STAMP}  {label}"
    scale = W / 3840 * 1.6
    thick = max(1, int(round(W / 3840 * 3)))
    ty = int(H * (0.5 + 79 / 180))
    for k in range(4):
        x = int(W * (k / 4 + 0.02))
        cv2.putText(
            img, text, (x, ty), cv2.FONT_HERSHEY_SIMPLEX, scale, (242, 242, 242), thick, cv2.LINE_AA
        )


def corner_stamp(img: np.ndarray, label: str) -> np.ndarray:
    """Small corner stamp with the asset key on crops and photos (BGR uint8)."""
    h, w = img.shape[:2]
    scale = max(0.3, w / 1024 * 0.7)
    thick = max(1, int(round(w / 1024 * 2)))
    text = f"SENTETIK ORNEK {label}"
    (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)
    pad = max(3, int(th * 0.4))
    x0, y0 = pad, h - th - base - 2 * pad
    out = img.copy()
    sub = out[y0 : h - pad // 2, x0 - pad // 2 : x0 + tw + pad]
    sub[:] = (sub.astype(np.float32) * 0.35).astype(np.uint8)
    cv2.putText(
        out,
        text,
        (x0, h - base - pad),
        cv2.FONT_HERSHEY_SIMPLEX,
        scale,
        (235, 235, 235),
        thick,
        cv2.LINE_AA,
    )
    return out
