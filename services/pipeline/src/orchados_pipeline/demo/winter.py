"""Parcel A in winter (dataset version 6, İP17 Faz 2b): two leafless scans, before
and after the pruning, measured by the pipeline's own LiDAR stages.

1. Trees. Every active tree of parcel A gets a branch hierarchy from the LiDAR
   package's synthetic generator (lidar/synthetic.make_tree) with a spec taken
   from the drawn tree (height, crown radius, trunk thickness and height of the
   summer drawing, render.tree_shape), seeded from its slot: the same tree in
   both winter scans. The tree is turned about its trunk, leans like the summer
   trunk and stands at the tree's position. Between the scans the gardener thins
   the crowns: dataset.pruning_cuts order-2 branches per tree, chosen by
   synthetic.prune (seeded from the slot as well).
2. Drawing (render.visit_shapes): every branch segment is a bark cylinder
   (render.Capsule) with the mean radius of its two ends; a second stem, the
   sapling's stake and the empty slots' stakes as in summer. No foliage, no crown
   shadow.
3. LiDAR. Points on the same cylinders (WOOD_DENSITY per square metre, at least
   a few per cylinder) and the flat ground (z = 0, as world.py), 1 cm noise
   (world.NOISE_M); the cloud frame is world.py's (parcel origin, ground at 0).
   The real stages run on it with their default parameters: lidar_skeleton on
   each scan (skeleton.make_report over cloud.extract_trees, what ``lidar
   skeleton`` does), lidar_pruning before -> after (pruning.make_report, what
   ``lidar pruning`` does) and lidar_world with the wood (world.wood_from_reports:
   the scan's skeleton, and for the scan after pruning the pruning report and
   the before skeleton), coloured from the scan's own panoramas.

Every random choice is seeded from (SEED_VERSION, key): the same dataset gives the
same trees, clouds and reports. Nothing here changes a summer visit.
"""

from __future__ import annotations

import math
from dataclasses import replace
from functools import cache

import numpy as np

from ..lidar import pruning as pruning_stage
from ..lidar import skeleton as skeleton_stage
from ..lidar.cloud import RegisteredCloud, extract_trees
from ..lidar.pruning import PruningReport
from ..lidar.skeleton import SkeletonReport
from ..lidar.synthetic import Branch, SyntheticTree, TreeSpec, make_tree, prune
from ..lidar.world import View, World, build_world, wood_from_reports
from .dataset import (
    WINTER_AFTER,
    WINTER_BEFORE,
    Dataset,
    Tree,
    Visit,
    load,
    pruning_cuts,
    rng,
    tree_class,
)
from .render import BARK, DEAD_WOOD, Capsule, TreeShape, slot_marker
from .world import NOISE_M, VisitCloud, cloud_meta, to_en, tree_positions, world_params

# The winter visits, in order: the scan before and the scan after the pruning.
WINTER_VISITS = (WINTER_BEFORE, WINTER_AFTER)
# The stages' reports in the visit's run folder (sqlgen.winter_measurements).
SKELETON_FILE = skeleton_stage.REPORT_FILE
PRUNING_FILE = pruning_stage.REPORT_FILE
# Points per square metre of bark (the summer world samples 400: too thin for a
# skeleton of twigs), at least MIN_WOOD_POINTS per cylinder; the ground as world.py.
WOOD_DENSITY = 1200.0
MIN_WOOD_POINTS = 6
GROUND_DENSITY = 45.0
GROUND_MARGIN_M = 5.0
# Branch hierarchy per age class: scaffolds, deepest order, polyline nodes.
SHAPE = {
    "sapling": (3, 2, 3),
    "young": (3, 2, 4),
    "productive": (4, 3, 4),
    "old": (5, 3, 4),
}
# Trunk radius of the summer drawing (render.tree_shape).
TRUNK_R = {"sapling": 0.03, "young": 0.08, "productive": 0.13, "old": 0.17}
MIN_RADIUS_M = 0.004


def tree_spec(tree: Tree) -> TreeSpec:
    """The generator's spec of a drawn tree: its height, the crown the summer drawing's
    clusters reach (about 1.1 crown radii), the summer trunk."""
    n_scaffolds, max_order, nodes = SHAPE[tree.age_class]
    trunk_h = max(0.4, tree.height_m - 1.6 * tree.crown_r_m)
    return TreeSpec(
        crown_diameter_m=2.2 * tree.crown_r_m,
        height_m=tree.height_m,
        trunk_height_m=trunk_h,
        trunk_diameter_m=2 * TRUNK_R[tree.age_class],
        n_scaffolds=n_scaffolds,
        max_order=max_order,
        nodes_per_branch=nodes,
    )


def _placement(tree: Tree):
    """Tree frame (trunk base at the origin, z up) -> parcel-local: turned about the
    trunk, leaning like the summer trunk (render.tree_shape), at the tree's position."""
    g = rng(f"winter:turn:{tree.slot.key}")
    turn = float(g.uniform(0, 2 * math.pi))
    lean = math.radians(tree.lean_deg)
    ld = math.radians(tree.lean_dir_deg)
    c, s = math.cos(turn), math.sin(turn)
    rz = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    # Tilt the z axis towards (cos ld, sin ld) by the lean angle (Rodrigues).
    axis = np.array([-math.sin(ld), math.cos(ld), 0.0])
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    tilt = np.eye(3) + math.sin(lean) * k + (1 - math.cos(lean)) * (k @ k)
    m = tilt @ rz
    x, y = tree.xy
    offset = np.array([x, y, 0.0])

    def place(points: np.ndarray) -> np.ndarray:
        return points @ m.T + offset

    return place


def _placed(tree: SyntheticTree, place) -> SyntheticTree:
    branches = [
        Branch(b.id, b.parent, b.order, place(b.nodes), b.radii.copy()) for b in tree.branches
    ]
    pruned = [
        {**c, "cut_point": [float(v) for v in place(np.array([c["cut_point"]]))[0]]}
        for c in tree.pruned
    ]
    return replace(tree, branches=branches, pruned=pruned)


@cache
def winter_trees() -> dict[str, tuple[SyntheticTree, SyntheticTree]]:
    """Parcel A's trees in winter, parcel-local: slot code -> (before, after pruning)."""
    ds = load()
    out = {}
    for t in ds.trees["A"]:
        tree = make_tree(tree_spec(t), rng(f"winter:tree:{t.slot.key}"))
        n = pruning_cuts(t)
        after = prune(tree, rng(f"winter:prune:{t.slot.key}"), n_cuts=n, orders=(2,)) if n else tree
        place = _placement(t)
        out[t.code] = (_placed(tree, place), _placed(after, place))
    return out


def winter_shape(tree: Tree, cls: str, visit: Visit) -> TreeShape:
    """Primitives of a leafless tree in a winter scan (render.visit_shapes)."""
    before, after = winter_trees()[tree.code]
    st = after if visit.key == WINTER_AFTER else before
    shape = TreeShape(tree.code, tree.xy)
    # A problem tree's dry scaffold: grey wood, the colour of the summer's dead tree.
    dry: set[int] = set()
    if cls == "problem":
        scaffolds = [b.id for b in st.branches if b.order == 1]
        if scaffolds:
            first = scaffolds[int(rng(f"winter:dry:{tree.slot.key}").integers(0, len(scaffolds)))]
            dry = {first} | st.descendants(first)
    for br in st.branches:
        color = DEAD_WOOD if br.id in dry else BARK
        for i in range(len(br.nodes) - 1):
            r = max(MIN_RADIUS_M, float(br.radii[i] + br.radii[i + 1]) / 2)
            shape.prims.append(Capsule(br.nodes[i].copy(), br.nodes[i + 1].copy(), r, color))
    trunk = st.branches[0]
    if tree.stem_form == "multi":
        base, top = trunk.nodes[0], trunk.nodes[-1]
        off = np.array([0.25, -0.15, 0])
        shape.prims.append(
            Capsule(base + off, base + off + (top - base) * 0.8, float(trunk.radii[0]) * 0.7, BARK)
        )
    if tree.age_class == "sapling":
        stake = slot_marker(*tree.xy).prims[0]
        off = np.array([0.12, 0.05, 0.0])
        shape.prims.append(replace(stake, a=stake.a + off, b=stake.a + off + [0, 0, 1.5]))
    return shape


def _sample_capsule(cp: Capsule, g: np.random.Generator) -> np.ndarray:
    axis = cp.b - cp.a
    length = float(np.linalg.norm(axis))
    if length < 1e-6:
        return np.zeros((0, 3))
    n = max(MIN_WOOD_POINTS, int(g.poisson(2 * math.pi * cp.r * length * WOOD_DENSITY)))
    w = axis / length
    e1 = np.cross(w, [0.0, 0.0, 1.0] if abs(w[2]) < 0.9 else [1.0, 0.0, 0.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(w, e1)
    t = g.uniform(0, 1, n)[:, None]
    th = g.uniform(0, 2 * math.pi, n)[:, None]
    pts = cp.a + t * axis + cp.r * (np.cos(th) * e1 + np.sin(th) * e2)
    return pts[pts[:, 2] >= 0]


def scene_points(ds: Dataset, visit: Visit) -> np.ndarray:
    """Surface samples of the winter scene, parcel-local (x along rows, y across, z up)."""
    from .render import visit_shapes

    g = rng(f"winter:lidar:{visit.key}")
    out = [
        _sample_capsule(prim, g)
        for shape in visit_shapes(ds, visit)
        for prim in shape.prims
        if isinstance(prim, Capsule)
    ]
    p = visit.parcel
    m = GROUND_MARGIN_M
    step = 1 / math.sqrt(GROUND_DENSITY)
    gx, gy = np.meshgrid(np.arange(-m, p.length_m + m, step), np.arange(-m, p.width_m + m, step))
    gx = gx.ravel() + g.uniform(-step / 2, step / 2, gx.size)
    gy = gy.ravel() + g.uniform(-step / 2, step / 2, gy.size)
    out.append(np.column_stack([gx, gy, np.zeros(gx.size)]))
    pts = np.vstack(out)
    return pts + g.normal(0, NOISE_M, pts.shape)


@cache
def _cloud(visit_key: str, antenna_height_m: float) -> VisitCloud:
    ds = load()
    v = ds.visit(visit_key)
    return VisitCloud(
        to_en(v, scene_points(ds, v)), cloud_meta(v, antenna_height_m), tree_positions(ds, v)
    )


def visit_cloud(visit: Visit, antenna_height_m: float) -> VisitCloud:
    """The registered cloud of a winter scan (cached: the pruning stage reads both)."""
    return _cloud(visit.key, antenna_height_m)


@cache
def _tree_clouds(visit_key: str, antenna_height_m: float):
    """cloud.extract_trees as both stages' run() call it (the skeleton's tree radius)."""
    vc = _cloud(visit_key, antenna_height_m)
    p = skeleton_stage.SkeletonParams()
    return extract_trees(RegisteredCloud(vc.points, vc.meta), vc.trees, radius_m=p.tree_radius_m)


# Reports by (visit key or "pruning", antenna height): the after scan's world needs the
# before scan's skeleton, and the result does not depend on the number of workers.
_REPORTS: dict[tuple[str, float], SkeletonReport | PruningReport] = {}


def skeleton_report(visit: Visit, antenna_height_m: float, workers: int = 1) -> SkeletonReport:
    """``lidar skeleton`` on the scan's cloud (default parameters)."""
    key = (visit.key, antenna_height_m)
    if key not in _REPORTS:
        vc = _cloud(visit.key, antenna_height_m)
        _REPORTS[key] = skeleton_stage.make_report(
            vc.meta,
            _tree_clouds(visit.key, antenna_height_m),
            skeleton_stage.SkeletonParams(),
            workers=workers,
        )
    report = _REPORTS[key]
    assert isinstance(report, SkeletonReport)
    return report


def pruning_report(antenna_height_m: float, workers: int = 1) -> PruningReport:
    """``lidar pruning`` from the scan before to the scan after the pruning."""
    key = ("pruning", antenna_height_m)
    if key not in _REPORTS:
        before = _cloud(WINTER_BEFORE, antenna_height_m)
        after = _cloud(WINTER_AFTER, antenna_height_m)
        _REPORTS[key] = pruning_stage.make_report(
            before.meta,
            after.meta,
            _tree_clouds(WINTER_BEFORE, antenna_height_m),
            _tree_clouds(WINTER_AFTER, antenna_height_m),
            pruning_stage.PruningParams(),
            workers=workers,
        )
    report = _REPORTS[key]
    assert isinstance(report, PruningReport)
    return report


def world(
    visit: Visit, views: list[View], profile: str, antenna_height_m: float, workers: int = 1
) -> World:
    """``lidar world`` of a winter scan with its wood: the skeleton, and after the
    pruning the cut wood and the cuts."""
    vc = visit_cloud(visit, antenna_height_m)
    skel = skeleton_report(visit, antenna_height_m, workers)
    if visit.key == WINTER_AFTER:
        before = skeleton_report(load().visit(WINTER_BEFORE), antenna_height_m, workers)
        report = pruning_report(antenna_height_m, workers)
        wood = wood_from_reports(skel, vc.trees, report, before)
    else:
        wood = wood_from_reports(skel, vc.trees)
    return build_world(vc.points, vc.meta, vc.trees, views, world_params(profile), wood=wood)


def present(ds: Dataset, visit: Visit) -> list[Tree]:
    return [t for t in ds.trees[visit.parcel.key] if tree_class(visit.key, t.code) != "absent"]
