"""Parametric pistachio trees and plots with known truth, for tests and demos.

A tree is a branch hierarchy (trunk -> scaffold branches -> order 2 -> order 3)
grown inside an ellipsoidal crown envelope, plus optional foliage on the
envelope's outer shell. Sampling the wood surfaces and the foliage with noise
gives what a walking LiDAR scan from the four corridors around the tree sees
(all sides, few-centimetre noise). Nothing here models the scanner beam.

Truth is exact for what the generator controls: envelope (crown diameter,
height, volume), branch counts by order, wood volume, pruned volume.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np

from ..geo import LocalFrame
from .cloud import TreePosition, write_session_cloud
from .models import CloudMeta


@dataclass
class Branch:
    id: int
    parent: int | None  # None for the trunk
    order: int  # 0 trunk, 1 scaffold, 2, 3
    nodes: np.ndarray  # (k+1, 3) polyline, tree frame (trunk base at origin, z up)
    radii: np.ndarray  # (k+1,) metres

    @property
    def length(self) -> float:
        return float(np.linalg.norm(np.diff(self.nodes, axis=0), axis=1).sum())

    def volume(self) -> float:
        seg = np.linalg.norm(np.diff(self.nodes, axis=0), axis=1)
        r0, r1 = self.radii[:-1], self.radii[1:]
        return float((math.pi / 3 * seg * (r0 * r0 + r0 * r1 + r1 * r1)).sum())


@dataclass
class TreeSpec:
    crown_diameter_m: float
    height_m: float
    trunk_height_m: float  # first branching (crown base)
    trunk_diameter_m: float  # at the base of the trunk
    n_scaffolds: int = 4
    max_order: int = 3
    children_per_branch: tuple[int, int] = (2, 3)
    nodes_per_branch: int = 6


# Typical specs per size class (docs/metodoloji.md section 3, thresholds v0.1).
SIZE_PRESETS: dict[str, TreeSpec] = {
    "sapling": TreeSpec(1.0, 1.6, 0.45, 0.04, n_scaffolds=3, max_order=2),
    "young": TreeSpec(2.4, 2.9, 0.6, 0.09, n_scaffolds=3, max_order=3),
    "productive": TreeSpec(4.6, 4.4, 0.8, 0.24, n_scaffolds=4, max_order=3),
    "old": TreeSpec(7.0, 5.8, 0.9, 0.45, n_scaffolds=5, max_order=3),
}


@dataclass
class SyntheticTree:
    spec: TreeSpec
    branches: list[Branch]
    # Crown envelope: ellipsoid centre height and semi-axes (horizontal a, vertical b).
    envelope_center_z: float
    envelope_a: float
    envelope_b: float
    pruned: list[dict] = field(default_factory=list)  # cuts applied by prune()

    def children(self, branch_id: int) -> list[Branch]:
        return [b for b in self.branches if b.parent == branch_id]

    def descendants(self, branch_id: int) -> set[int]:
        out: set[int] = set()
        todo = [branch_id]
        while todo:
            cur = todo.pop()
            for c in self.children(cur):
                if c.id not in out:
                    out.add(c.id)
                    todo.append(c.id)
        return out

    def wood_volume(self) -> float:
        return sum(b.volume() for b in self.branches)

    def truth(self) -> dict:
        a, b = self.envelope_a, self.envelope_b
        tips = np.vstack([br.nodes[-1] for br in self.branches])
        by_order: dict[str, int] = {}
        for br in self.branches:
            by_order[str(br.order)] = by_order.get(str(br.order), 0) + 1
        return {
            "crown_diameter_m": 2 * a,
            "height_m": self.envelope_center_z + b,
            "crown_base_m": self.envelope_center_z - b,
            "crown_volume_m3": 4 / 3 * math.pi * a * a * b,
            "skeleton_height_m": float(tips[:, 2].max()),
            "trunk_diameter_m": float(self.branches[0].radii[0] * 2),
            "scaffold_branch_count": by_order.get("1", 0),
            "branch_count_by_order": by_order,
            "wood_volume_m3": self.wood_volume(),
            "pruned": self.pruned,
        }


def _dist_to_envelope(p: np.ndarray, u: np.ndarray, cz: float, a: float, b: float) -> float:
    """Distance along unit u from p (inside) to the ellipsoid surface."""
    s = np.array([1 / a, 1 / a, 1 / b])
    q = (p - np.array([0.0, 0.0, cz])) * s
    v = u * s
    A = float(v @ v)
    B = 2 * float(q @ v)
    C = float(q @ q) - 1
    disc = B * B - 4 * A * C
    if disc <= 0:
        return 0.0
    return max(0.0, (-B + math.sqrt(disc)) / (2 * A))


def _unit(az_deg: float, el_deg: float) -> np.ndarray:
    az, el = math.radians(az_deg), math.radians(el_deg)
    return np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])


def _polyline(start, direction, length, r0, r1, k, rng, bend=0.08):
    """A slightly curved branch: direction drifts a little per node."""
    nodes = [np.asarray(start, float)]
    d = np.asarray(direction, float)
    step = length / k
    for _ in range(k):
        d = d + rng.normal(0, bend, 3)
        d = d / np.linalg.norm(d)
        nodes.append(nodes[-1] + d * step)
    return np.vstack(nodes), np.linspace(r0, r1, k + 1)


def make_tree(spec: TreeSpec, rng: np.random.Generator) -> SyntheticTree:
    a = spec.crown_diameter_m / 2
    b = (spec.height_m - spec.trunk_height_m) / 2
    cz = spec.trunk_height_m + b
    k = spec.nodes_per_branch
    branches: list[Branch] = []
    r_trunk = spec.trunk_diameter_m / 2
    trunk_nodes = np.array([[0.0, 0.0, z] for z in np.linspace(0.0, spec.trunk_height_m, 4)])
    branches.append(Branch(0, None, 0, trunk_nodes, np.linspace(r_trunk, r_trunk * 0.85, 4)))

    def grow(parent: Branch, order: int, count: int) -> None:
        if order > spec.max_order:
            return
        for j in range(count):
            if order == 1:
                az = 360.0 * j / count + rng.uniform(-20, 20)
                el = rng.uniform(30, 55)
                t = rng.uniform(0.85, 1.0)
            else:
                pd = parent.nodes[-1] - parent.nodes[0]
                pd = pd / np.linalg.norm(pd)
                p_az = math.degrees(math.atan2(pd[0], pd[1]))
                p_el = math.degrees(math.asin(np.clip(pd[2], -1, 1)))
                az = p_az + rng.choice([-1, 1]) * rng.uniform(25, 60)
                el = float(np.clip(p_el + rng.uniform(-15, 25), 5, 80))
                t = rng.uniform(0.3, 0.8)
            seg = min(int(t * (len(parent.nodes) - 1)), len(parent.nodes) - 2)
            frac = t * (len(parent.nodes) - 1) - seg
            start = parent.nodes[seg] * (1 - frac) + parent.nodes[seg + 1] * frac
            r_at = parent.radii[seg] * (1 - frac) + parent.radii[seg + 1] * frac
            u = _unit(az, el)
            reach = _dist_to_envelope(start, u, cz, a, b)
            length = reach * (rng.uniform(0.8, 0.95) if order == 1 else rng.uniform(0.6, 0.85))
            if order > 1:
                length = min(length, 0.75 * parent.length)
            if length < 0.15:
                continue
            r0 = r_at * (0.62 if order == 1 else 0.55)
            nodes, radii = _polyline(start, u, length, r0, max(r0 * 0.25, 0.004), k, rng)
            # Keep tips inside the envelope after the bend.
            for i in range(len(nodes)):
                q = (nodes[i] - [0, 0, cz]) / [a, a, b]
                nq = float(np.linalg.norm(q))
                if nq > 0.98:
                    nodes[i] = [0, 0, cz] + q / nq * 0.98 * np.array([a, a, b])
            br = Branch(len(branches), parent.id, order, nodes, radii)
            branches.append(br)
            lo, hi = spec.children_per_branch
            grow(br, order + 1, int(rng.integers(lo, hi + 1)))

    grow(branches[0], 1, spec.n_scaffolds)
    return SyntheticTree(spec, branches, cz, a, b)


def prune(
    tree: SyntheticTree, rng: np.random.Generator, n_cuts: int = 4, orders: tuple[int, ...] = (2,)
) -> SyntheticTree:
    """Remove whole branches (thinning cuts) of the given orders with their descendants.

    Returns a new tree; ``pruned`` lists each cut (branch id, order, cut point,
    removed wood volume including descendants).
    """
    candidates = [b.id for b in tree.branches if b.order in orders]
    rng.shuffle(candidates)
    removed: set[int] = set()
    cuts: list[dict] = []
    for bid in candidates:
        if len(cuts) >= n_cuts:
            break
        if bid in removed:
            continue
        group = {bid} | tree.descendants(bid)
        vol = sum(tree.branches[i].volume() for i in group if i not in removed)
        br = tree.branches[bid]
        cuts.append(
            {
                "branch_id": bid,
                "order": br.order,
                "cut_point": [float(x) for x in br.nodes[0]],
                "cut_diameter_m": float(br.radii[0] * 2),
                "removed_wood_volume_m3": vol,
                "removed_length_m": sum(tree.branches[i].length for i in group),
            }
        )
        removed |= group
    kept = [b for b in tree.branches if b.id not in removed]
    return replace(tree, branches=kept, pruned=list(tree.pruned) + cuts)


def sample_wood(
    tree: SyntheticTree,
    rng: np.random.Generator,
    density_per_m2: float = 4000.0,
    noise_m: float = 0.015,
) -> np.ndarray:
    """Points on the branch surfaces (frustums), uniform per area, Gaussian noise."""
    out = []
    for br in tree.branches:
        for i in range(len(br.nodes) - 1):
            p0, p1 = br.nodes[i], br.nodes[i + 1]
            r0, r1 = br.radii[i], br.radii[i + 1]
            axis = p1 - p0
            L = float(np.linalg.norm(axis))
            if L == 0:
                continue
            area = math.pi * (r0 + r1) * L
            n = max(3, int(rng.poisson(area * density_per_m2)))
            u = axis / L
            helper = np.array([1.0, 0, 0]) if abs(u[0]) < 0.9 else np.array([0, 1.0, 0])
            e1 = np.cross(u, helper)
            e1 /= np.linalg.norm(e1)
            e2 = np.cross(u, e1)
            t = rng.uniform(0, 1, n)
            th = rng.uniform(0, 2 * math.pi, n)
            r = r0 + (r1 - r0) * t
            pts = (
                p0
                + np.outer(t * L, u)
                + (r * np.cos(th))[:, None] * e1
                + (r * np.sin(th))[:, None] * e2
            )
            out.append(pts)
    pts = np.vstack(out)
    return pts + rng.normal(0, noise_m, pts.shape)


def sample_foliage(
    tree: SyntheticTree,
    rng: np.random.Generator,
    density_per_m2: float = 1500.0,
    shell: float = 0.3,
    fill: float = 1.0,
    gap_patches: int = 0,
    noise_m: float = 0.02,
) -> np.ndarray:
    """Foliage on the outer shell of the envelope (relative thickness ``shell``).

    fill (0..1) thins the foliage evenly; gap_patches removes that many random
    caps (30 deg) to imitate a sparse crown (crown_density_scale research).
    Points below 0.3 m above ground are dropped.
    """
    a, b, cz = tree.envelope_a, tree.envelope_b, tree.envelope_center_z
    p = (a**1.6 * a**1.6 + 2 * a**1.6 * b**1.6) / 3
    area = 4 * math.pi * p ** (1 / 1.6)
    n = int(rng.poisson(area * density_per_m2 * fill))
    v = rng.normal(0, 1, (n, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    s = 1 - shell * rng.uniform(0, 1, n) ** 2
    pts = v * s[:, None] * np.array([a, a, b]) + np.array([0, 0, cz])
    for _ in range(gap_patches):
        c = rng.normal(0, 1, 3)
        c /= np.linalg.norm(c)
        pts = pts[v @ c < math.cos(math.radians(30))] if len(pts) else pts
        v = v[v @ c < math.cos(math.radians(30))]
    pts = pts[pts[:, 2] > 0.3]
    return pts + rng.normal(0, noise_m, pts.shape)


def sample_tree(
    tree: SyntheticTree, rng: np.random.Generator, leafy: bool, **foliage
) -> np.ndarray:
    wood = sample_wood(tree, rng)
    if not leafy:
        return wood
    return np.vstack([wood, sample_foliage(tree, rng, **foliage)])


def occlude_sector(points: np.ndarray, az_from: float, az_to: float) -> np.ndarray:
    """Drop points whose azimuth from the trunk (deg from north, clockwise) is in the sector."""
    az = np.mod(np.degrees(np.arctan2(points[:, 0], points[:, 1])), 360.0)
    lo, hi = az_from % 360, az_to % 360
    inside = (az >= lo) & (az <= hi) if lo <= hi else (az >= lo) | (az <= hi)
    return points[~inside]


@dataclass
class SyntheticPlot:
    points: np.ndarray  # parcel frame (east, north, up), metres
    meta: CloudMeta
    positions: list[TreePosition]  # inventory positions (with position error)
    trees: dict[str, SyntheticTree]  # by tree_id
    true_centers: dict[str, tuple[float, float, float]]  # trunk base in parcel frame


def make_plot(
    sizes: list[list[str]],
    rng: np.random.Generator,
    *,
    leafy: bool,
    spacing_m: float = 8.0,
    slope: tuple[float, float] = (0.02, -0.01),
    ground_density_per_m2: float = 60.0,
    grass_height_m: float = 0.15,
    position_error_m: float = 0.15,
    origin: tuple[float, float, float] = (37.0662, 37.3833, 850.0),
    session_id: str = "00000000-0000-4000-8000-0000000000a1",
    parcel_id: str = "00000000-0000-4000-8000-0000000000b1",
    trees_override: dict[str, SyntheticTree] | None = None,
    foliage: dict | None = None,
) -> SyntheticPlot:
    """A rows x cols grid of trees. sizes[r][c] is a SIZE_PRESETS key or "" for an empty slot.

    tree_id is "t-r{row}-p{pos}" and slot_code "S{row}-{pos}" (1-based). Pass
    trees_override to reuse exact trees (e.g. the same trees before and after
    pruning). Ground is a tilted plane with grass noise.
    """
    frame = LocalFrame(origin[0], origin[1])
    rows, cols = len(sizes), max(len(r) for r in sizes)
    gx, gy = slope
    pts = []
    positions: list[TreePosition] = []
    trees: dict[str, SyntheticTree] = {}
    centers: dict[str, tuple[float, float, float]] = {}
    for r, row in enumerate(sizes):
        for c, size in enumerate(row):
            if not size:
                continue
            tid, code = f"t-r{r + 1}-p{c + 1}", f"S{r + 1}-{c + 1}"
            if trees_override and tid in trees_override:
                tree = trees_override[tid]
            else:
                tree = make_tree(SIZE_PRESETS[size], rng)
            e0, n0 = c * spacing_m, r * spacing_m
            z0 = gx * e0 + gy * n0
            local = sample_tree(tree, rng, leafy, **(foliage or {}))
            pts.append(local + np.array([e0, n0, z0]))
            trees[tid] = tree
            centers[tid] = (e0, n0, z0)
            pe, pn = e0 + rng.normal(0, position_error_m), n0 + rng.normal(0, position_error_m)
            lat, lon = frame.to_latlon(pe, pn)
            positions.append(TreePosition(tid, code, float(lat), float(lon)))
    lo_e, hi_e = -spacing_m / 2, (cols - 0.5) * spacing_m
    lo_n, hi_n = -spacing_m / 2, (rows - 0.5) * spacing_m
    ng = int(rng.poisson((hi_e - lo_e) * (hi_n - lo_n) * ground_density_per_m2))
    ge = rng.uniform(lo_e, hi_e, ng)
    gn = rng.uniform(lo_n, hi_n, ng)
    gz = gx * ge + gy * gn + np.abs(rng.normal(0, grass_height_m / 2, ng))
    pts.append(np.column_stack([ge, gn, gz]))
    meta = CloudMeta(
        session_id=session_id,
        parcel_id=parcel_id,
        origin_lat=origin[0],
        origin_lon=origin[1],
        origin_height_m=origin[2],
        registration_method="synthetic",
        registration_version="1",
        point_sigma_m=0.015,  # matches sample_wood noise
        sensor="synthetic",
    )
    return SyntheticPlot(np.vstack(pts), meta, positions, trees, centers)


def write_plot_session(dest: Path, plot: SyntheticPlot) -> Path:
    """Session folder: lidar/cloud.ply + cloud.json, trees.json, lidar/truth.json."""
    dest = Path(dest)
    write_session_cloud(dest, plot.points, plot.meta)
    (dest / "trees.json").write_text(
        json.dumps(
            [
                {"tree_id": p.tree_id, "slot_code": p.slot_code, "lat": p.lat, "lon": p.lon}
                for p in plot.positions
            ],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    truth = {tid: t.truth() for tid, t in plot.trees.items()}
    (dest / "lidar" / "truth.json").write_text(json.dumps(truth, indent=2) + "\n", "utf-8")
    return dest
