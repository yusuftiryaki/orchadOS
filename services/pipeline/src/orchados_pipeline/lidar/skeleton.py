"""Stage lidar_skeleton: winter branch skeleton per tree (QSM-style, research).

Method ``lidar_qsm`` 0.1.0. A simplified quantitative structure model in the
spirit of TreeQSM and the level-set skeleton of Xu et al. (2007), numpy only:

1. Voxelize the tree's points (``voxel_m``) and link occupied voxels to their
   26 neighbours (``connect_radius_vox`` 2 also bridges one-voxel gaps).
2. Root: the lowest voxels (``root_band_m``) of the largest connected part
   within ``root_search_radius_m`` of the inventory position (the inventory is
   0.15-0.5 m off; the lowest 0.25 m of the trunk are cut with the ground).
3. Geodesic distance from the root (multi-source Dijkstra over the voxel
   graph), sliced into ``bin_m`` bins; each bin is split into connected
   clusters. A cluster is a skeleton node (point centroid); its parent is the
   cluster of the lower bin its voxels' shortest paths come from. Leaf chains
   shorter than ``spur_min_length_m`` hanging off a fork are removed (noise).
4. Hierarchy. Significant subtrees are at least ``scaffold_min_subtree_m`` of
   skeleton long. The trunk runs from the root to the first node with two
   significant children (first branching). Scaffold branches are the
   significant stems that leave the trunk top: every fork within
   ``scaffold_zone_m`` (geodesic, scaled up for thick trunks) above the first
   branching yields scaffolds, except stems that fork again inside that zone
   (they are the trunk's own continuation). Inside a branch the child with the
   longest subtree continues it, the others start branches of order + 1.
5. Radius per node: mean squared distance of the node's points to the local
   axis (through the centroid, along the parent -> main child direction),
   corrected for point noise (r^2 = mean d^2 - 2 sigma^2) with a floor of
   ``radius_floor_m``. sigma is the median over branch-tip nodes unless set
   (``noise_sigma_m``). Clusters elongated across the axis (``max_elongation``:
   two stems just above a fork) give no radius. Per branch the radii follow a
   robust linear taper (no growth towards the tip). Below
   ``radius_reliable_sigma`` x sigma the points cannot resolve a radius; there
   the pipe model (r^2 proportional to the supported skeleton length) scales
   the parent's radius. A node is never thicker than its parent.

Outputs per tree (measurements, research): ``scaffold_branch_count`` (count),
``wood_volume`` (m3: frustums between nodes plus a cylinder from the ground to
the lowest node; thin wood near the noise level is not resolved, so this is
an underestimate on real trees with many shoots and a rough number on thin
branches either way), ``fractal_dimension`` (box counting of the tree points
over ``fractal_scales_m``, default 5-80 cm; below that point noise and voxel
size dominate, above it the tree has too few boxes). The detail adds height
of the first branching, trunk diameter at ``trunk_diameter_height_m`` (circle
fit on a horizontal slice; LiDAR caveat: a walking scan sees the trunk base
through grass and low branches, the fit wants at least half of the
circumference), branch counts per order, total skeleton length and the
skeleton itself (nodes: xyz in the tree frame, radius, parent, order, branch)
for the pruning stage and a 3D viewer.

The first branching height is where the level sets separate the stems: 5-30 cm
above the true crotch, more on thick trunks. Uncertainties: scaffold count
sqrt(0.25 + borderline candidates); wood volume the branch radius-fit scatter
plus ``wood_volume_rel_uncertainty`` (v0 30 %); fractal dimension the slope's
standard error.

Accuracy on synthetic winter trees (tests/test_lidar_skeleton.py, 12 seeds per
preset, 1.5 cm noise, inventory offset ~0.3 m): scaffold count exact for
young, productive and old; wood volume young -26 % .. +30 %, productive
-12 % .. +1 %, old -9 % .. 0 %; trunk diameter at 0.5 m -4 % .. +9 %. The
generator has no twig clutter, no occlusion within the crown and no wind; real
trees will do worse. About 0.03 / 0.2 / 0.6 s per young / productive / old tree.

Trees seen from fewer than ``min_sector_coverage`` of 8 sectors are
``one_sided``: their skeleton is kept in the detail but no measurement is
written (hidden scaffolds would be undercounted). Leafy clouds are recognised
by volumetric clutter in the crown (``leafy_*``) and get a report warning.
"""

from __future__ import annotations

import heapq
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .. import PIPELINE_NAME, __version__
from ..hashing import hash_object
from ..models import Model, Producer, write_model
from .cloud import TreeCloud, extract_trees, load_session_cloud, load_tree_positions
from .models import CloudMeta, LidarMeasurement, LidarReport, TreeQuality

METHOD = "lidar_qsm"
METHOD_VERSION = "0.1.0"
STAGE = "lidar_skeleton"
REPORT_FILE = "skeleton.json"


class SkeletonParams(BaseModel):
    """Parameters of lidar_skeleton (hashed into Producer.params_hash)."""

    model_config = ConfigDict(extra="forbid")

    # Per-tree extraction (cloud.extract_trees).
    tree_radius_m: float = 5.0
    # Quality gates.
    min_points: int = 300
    min_sector_coverage: float = 0.75
    # Voxel graph.
    voxel_m: float = 0.04
    connect_radius_vox: int = 1
    # Root search around the inventory position.
    root_search_radius_m: float = 1.0
    root_band_m: float = 0.1
    # Level sets.
    bin_m: float = 0.08
    spur_min_length_m: float = 0.15
    # Radii. noise_sigma_m None: estimated from the thinnest nodes.
    noise_sigma_m: float | None = None
    # Nodes this close to a branch tip (subtree length) estimate sigma.
    noise_tip_length_m: float = 0.25
    radius_floor_m: float = 0.004
    # Radii below this many sigma come from the pipe model instead of the points.
    radius_reliable_sigma: float = 2.0
    # Level-set clusters more elongated than this hold two stems (fork): no radius.
    max_elongation: float = 2.5
    # Hierarchy.
    scaffold_zone_m: float = 0.3
    scaffold_zone_trunk_radii: float = 2.0
    scaffold_min_subtree_m: float = 0.5
    # Trunk diameter (docs/metodoloji.md section 3: about 50 cm above ground).
    trunk_diameter_height_m: float = 0.5
    trunk_slice_m: float = 0.1
    trunk_min_height_m: float = 0.3
    # Box-counting scales (metres).
    fractal_scales_m: list[float] = Field(default_factory=lambda: [0.05, 0.1, 0.2, 0.4, 0.8])
    # Leafy-cloud check: volumetric clutter share above the first branching.
    leafy_cell_m: float = 0.1
    leafy_scatter_min: float = 0.25
    leafy_warn_fraction: float = 0.3
    # A leafy tree's skeleton is mostly foliage: do not dump more nodes than this.
    max_nodes_leafy: int = 500
    # Systematic relative 1-sigma of wood volume (v0, to be validated on real trees).
    wood_volume_rel_uncertainty: float = 0.3

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))


def load_params(path: Path | None) -> SkeletonParams:
    if path is None:
        return SkeletonParams()
    body = json.loads(Path(path).read_text(encoding="utf-8"))
    return SkeletonParams.model_validate(body.get("skeleton", body))


# --- report models -------------------------------------------------------------


class SkeletonNode(Model):
    id: int
    xyz: tuple[float, float, float]  # tree frame: east/north of the inventory position, height
    radius_m: float
    parent: int | None
    order: int
    branch: int


class SkeletonBranch(Model):
    id: int
    parent: int | None
    order: int
    scaffold: bool
    length_m: float
    base_radius_m: float
    volume_m3: float
    n_nodes: int


class TreeSkeleton(Model):
    tree_id: str
    slot_code: str | None = None
    # Placement of the tree frame in the cloud frame (east, north; ground height).
    center_en: tuple[float, float]
    ground_z: float
    n_points: int
    # Share of the tree's points that belong to the skeleton's connected part.
    connected_share: float
    noise_sigma_m: float | None = None
    # Nodes this close to a branch tip (subtree length) estimate sigma.
    noise_tip_length_m: float = 0.25
    scaffold_branch_count: int | None = None
    first_branching_height_m: float | None = None
    trunk_diameter_m: float | None = None
    trunk_diameter_uncertainty_m: float | None = None
    trunk_diameter_height_m: float | None = None
    branch_count_by_order: dict[str, int] = Field(default_factory=dict)
    total_length_m: float | None = None
    wood_volume_m3: float | None = None
    wood_volume_uncertainty_m3: float | None = None
    fractal_dimension: float | None = None
    fractal_dimension_se: float | None = None
    clutter_fraction: float | None = None
    notes: list[str] = Field(default_factory=list)
    nodes: list[SkeletonNode] = Field(default_factory=list)
    branches: list[SkeletonBranch] = Field(default_factory=list)


class CloudRef(Model):
    origin_lat: float
    origin_lon: float
    origin_height_m: float
    registration_method: str
    registration_version: str
    point_sigma_m: float


class SkeletonReport(LidarReport):
    schema_: Literal["orchados.lidar_skeleton/1"] = Field(
        "orchados.lidar_skeleton/1", alias="schema"
    )
    params: SkeletonParams
    cloud: CloudRef
    warnings: list[str] = Field(default_factory=list)
    skeletons: list[TreeSkeleton] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# --- voxel graph -----------------------------------------------------------------


@dataclass
class VoxelGrid:
    keys: np.ndarray  # (V,) sorted int64 keys
    ijk: np.ndarray  # (V, 3) int64 voxel indices
    centroid: np.ndarray  # (V, 3)
    count: np.ndarray  # (V,)
    point_voxel: np.ndarray  # (N,) voxel of each point
    size: float
    dims: tuple[int, int, int]
    lo: np.ndarray  # (3,) lowest voxel index minus the padding

    def encode(self, ijk: np.ndarray) -> np.ndarray:
        rel = ijk - self.lo
        return (rel[..., 0] * self.dims[1] + rel[..., 1]) * self.dims[2] + rel[..., 2]


def voxelize(points: np.ndarray, size: float, pad: int = 2) -> VoxelGrid:
    ijk = np.floor(points / size).astype(np.int64)
    lo = ijk.min(0) - pad
    dims = tuple(int(d) for d in (ijk.max(0) - lo + 1 + pad))
    rel = ijk - lo
    key = (rel[:, 0] * dims[1] + rel[:, 1]) * dims[2] + rel[:, 2]
    keys, inv, count = np.unique(key, return_inverse=True, return_counts=True)
    cen = np.column_stack([np.bincount(inv, points[:, k], len(keys)) for k in range(3)])
    cen /= count[:, None]
    first = np.zeros(len(keys), dtype=np.int64)
    first[inv[::-1]] = np.arange(len(inv))[::-1]
    return VoxelGrid(keys, ijk[first], cen, count, inv, size, dims, lo)  # type: ignore[arg-type]


def _offsets(radius: int) -> np.ndarray:
    r = np.arange(-radius, radius + 1)
    o = np.stack(np.meshgrid(r, r, r, indexing="ij"), -1).reshape(-1, 3)
    return o[np.any(o != 0, axis=1)]


def voxel_edges(grid: VoxelGrid, radius: int = 1) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Directed edges (both ways) between occupied voxels within ``radius`` voxels."""
    src, dst, w = [], [], []
    idx = np.arange(len(grid.keys))
    for o in _offsets(radius):
        nk = grid.encode(grid.ijk + o)
        pos = np.searchsorted(grid.keys, nk)
        pos = np.minimum(pos, len(grid.keys) - 1)
        ok = grid.keys[pos] == nk
        src.append(idx[ok])
        dst.append(pos[ok])
        w.append(np.full(int(ok.sum()), float(np.linalg.norm(o)) * grid.size))
    return np.concatenate(src), np.concatenate(dst), np.concatenate(w)


def csr(n: int, src: np.ndarray, dst: np.ndarray, w: np.ndarray | None = None):
    order = np.argsort(src, kind="stable")
    indptr = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(np.bincount(src, minlength=n), out=indptr[1:])
    return indptr, dst[order], (w[order] if w is not None else None)


def components(n: int, src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Connected component label (smallest member index) per vertex."""
    lab = np.arange(n)
    if len(src) == 0:
        return lab
    indptr, nbr, _ = csr(n, src, dst)
    has = indptr[1:] > indptr[:-1]
    starts = indptr[:-1][has]
    while True:
        mins = np.minimum.reduceat(lab[nbr], starts)
        new = lab.copy()
        new[has] = np.minimum(lab[has], mins)
        while True:
            jumped = new[new]
            if np.array_equal(jumped, new):
                break
            new = jumped
        if np.array_equal(new, lab):
            return lab
        lab = new


def dijkstra(
    n: int, indptr: np.ndarray, nbr: np.ndarray, wt: np.ndarray, sources: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Multi-source shortest paths; returns (distance, predecessor) arrays."""
    ip, nb, ww = indptr.tolist(), nbr.tolist(), wt.tolist()
    inf = math.inf
    dist = [inf] * n
    pred = [-1] * n
    heap = []
    for s in sorted(int(x) for x in sources):
        dist[s] = 0.0
        heap.append((0.0, s))
    heapq.heapify(heap)
    pop, push = heapq.heappop, heapq.heappush
    while heap:
        d, u = pop(heap)
        if d > dist[u]:
            continue
        for k in range(ip[u], ip[u + 1]):
            v = nb[k]
            nd = d + ww[k]
            if nd < dist[v]:
                dist[v] = nd
                pred[v] = u
                push(heap, (nd, v))
    return np.array(dist), np.array(pred, dtype=np.int64)


# --- skeleton ----------------------------------------------------------------------


@dataclass
class BranchInfo:
    id: int
    parent: int | None
    order: int
    scaffold: bool
    nodes: list[int]  # base -> tip
    length: float = 0.0
    volume: float = 0.0
    radius_se: float = 0.0  # 1 sigma of the fitted radius (metres)


@dataclass
class Skeleton:
    """A tree's skeleton in its tree frame. Arrays are indexed by node."""

    pos: np.ndarray  # (M, 3)
    radius: np.ndarray  # (M,) smoothed
    raw_radius: np.ndarray  # (M,)
    clean: np.ndarray  # (M,) node is one round stem (radius usable)
    parent: np.ndarray  # (M,) -1 for the root
    geodesic: np.ndarray  # (M,) mean geodesic distance from the root
    order: np.ndarray  # (M,)
    branch: np.ndarray  # (M,)
    point_node: np.ndarray  # (N,) node of each input point, -1 if none
    branches: list[BranchInfo]
    sigma: float
    first_split: int | None
    scaffold_bases: list[int]
    ambiguous_scaffolds: int
    edge_volume: np.ndarray  # (M,) volume of the edge parent -> node
    base_volume: float  # cylinder from the ground to the root node
    connected_share: float
    notes: list[str] = field(default_factory=list)

    @property
    def n_nodes(self) -> int:
        return len(self.pos)

    def edge_length(self) -> np.ndarray:
        out = np.zeros(self.n_nodes)
        has = self.parent >= 0
        out[has] = np.linalg.norm(self.pos[has] - self.pos[self.parent[has]], axis=1)
        return out

    def children(self) -> list[list[int]]:
        ch: list[list[int]] = [[] for _ in range(self.n_nodes)]
        for i, p in enumerate(self.parent.tolist()):
            if p >= 0:
                ch[p].append(i)
        return ch

    def subtree(self, node: int) -> list[int]:
        ch = self.children()
        out, todo = [], [node]
        while todo:
            c = todo.pop()
            out.append(c)
            todo.extend(ch[c])
        return out

    @property
    def wood_volume(self) -> float:
        return float(self.edge_volume.sum() + self.base_volume)

    @property
    def total_length(self) -> float:
        return float(self.edge_length().sum())

    def count_by_order(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for b in self.branches:
            out[str(b.order)] = out.get(str(b.order), 0) + 1
        return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


class SkeletonError(ValueError):
    pass


def _frustum(L: float, r0: float, r1: float) -> float:
    return math.pi / 3 * L * (r0 * r0 + r0 * r1 + r1 * r1)


def skeletonize(points: np.ndarray, p: SkeletonParams, sigma: float | None = None) -> Skeleton:
    """Level-set skeleton of one tree (tree frame). Raises SkeletonError when no trunk."""
    if len(points) < 10:
        raise SkeletonError("too few points")
    grid = voxelize(points, p.voxel_m)
    nv = len(grid.keys)
    src, dst, w = voxel_edges(grid, p.connect_radius_vox)
    comp = components(nv, src, dst)

    # Root: lowest voxels of the largest part near the inventory position.
    near = np.hypot(grid.centroid[:, 0], grid.centroid[:, 1]) <= p.root_search_radius_m
    if not near.any():
        raise SkeletonError("no points near the inventory position")
    sizes = np.bincount(comp, weights=grid.count, minlength=nv)
    cand_comps = np.unique(comp[near])
    main = int(cand_comps[np.argmax(sizes[cand_comps])])
    cand = near & (comp == main)
    zmin = grid.centroid[cand, 2].min()
    band = cand & (grid.centroid[:, 2] <= zmin + p.root_band_m)
    # The trunk base is the biggest connected patch of that low band.
    in_band = band[src] & band[dst]
    blab = components(nv, src[in_band], dst[in_band])
    bsize = np.bincount(blab[band], weights=grid.count[band], minlength=nv)
    roots = np.nonzero(band & (blab == int(np.argmax(bsize))))[0]
    indptr, nbr, wt = csr(nv, src, dst, w)
    dist, pred = dijkstra(nv, indptr, nbr, wt, roots)
    valid = np.isfinite(dist)
    connected_share = float(grid.count[valid].sum() / len(points))

    # Level sets: connected clusters within each geodesic bin.
    bins = np.full(nv, -1, dtype=np.int64)
    bins[valid] = np.floor(dist[valid] / p.bin_m).astype(np.int64)
    same = valid[src] & valid[dst] & (bins[src] == bins[dst])
    lab = components(nv, src[same], dst[same])
    vids = np.nonzero(valid)[0]
    # Node ids ordered by (bin, label) for deterministic numbering.
    cl_keys = np.unique(bins[vids] * (nv + 1) + lab[vids])
    node_of_voxel = np.full(nv, -1, dtype=np.int64)
    node_of_voxel[vids] = np.searchsorted(cl_keys, bins[vids] * (nv + 1) + lab[vids])
    m = len(cl_keys)

    # Parent: the lower cluster most shortest paths come from.
    pv = pred[vids]
    has = pv >= 0
    a = node_of_voxel[vids[has]]
    b = node_of_voxel[pv[has]]
    cross = a != b
    pairs, votes = np.unique(np.column_stack([a[cross], b[cross]]), axis=0, return_counts=True)
    parent = np.full(m, -1, dtype=np.int64)
    best = np.zeros(m)
    for (c, pa), v in zip(pairs.tolist(), votes.tolist(), strict=True):
        if v > best[c]:
            best[c], parent[c] = v, pa
    point_node = node_of_voxel[grid.point_voxel]
    npts = np.bincount(point_node[point_node >= 0], minlength=m)
    pos = (
        np.column_stack(
            [
                np.bincount(point_node[point_node >= 0], points[point_node >= 0, k], m)
                for k in range(3)
            ]
        )
        / np.maximum(npts, 1)[:, None]
    )
    geod = np.bincount(node_of_voxel[vids], dist[vids], m) / np.maximum(
        np.bincount(node_of_voxel[vids], minlength=m), 1
    )
    root_nodes = np.nonzero(parent < 0)[0]
    root = int(root_nodes[np.argmax(npts[root_nodes])])
    for r in root_nodes.tolist():
        if r != root:
            parent[r] = root  # a root ring split into arcs; hang them on the main root

    keep = _prune_spurs(pos, parent, p.spur_min_length_m)
    pos, parent, geod, npts, point_node = _compact(keep, pos, parent, geod, npts, point_node)
    m = len(pos)

    skel = Skeleton(
        pos=pos,
        radius=np.zeros(m),
        raw_radius=np.zeros(m),
        clean=np.zeros(m, dtype=bool),
        parent=parent,
        geodesic=geod,
        order=np.zeros(m, dtype=np.int64),
        branch=np.zeros(m, dtype=np.int64),
        point_node=point_node,
        branches=[],
        sigma=0.0,
        first_split=None,
        scaffold_bases=[],
        ambiguous_scaffolds=0,
        edge_volume=np.zeros(m),
        base_volume=0.0,
        connected_share=connected_share,
    )
    _raw_radii(skel, points, p, sigma)
    _hierarchy(skel, p)
    _smooth_radii(skel, p)
    _volumes(skel)
    return skel


def _prune_spurs(pos: np.ndarray, parent: np.ndarray, min_len: float) -> np.ndarray:
    """Drop leaf chains shorter than min_len that hang off a fork (repeated)."""
    keep = np.ones(len(pos), dtype=bool)
    for _ in range(3):
        nch = np.zeros(len(pos), dtype=np.int64)
        live = np.nonzero(keep & (parent >= 0))[0]
        np.add.at(nch, parent[live], 1)
        changed = False
        for leaf in np.nonzero(keep & (nch == 0))[0].tolist():
            chain, length, cur = [leaf], 0.0, leaf
            while parent[cur] >= 0 and nch[parent[cur]] == 1:
                length += float(np.linalg.norm(pos[cur] - pos[parent[cur]]))
                cur = int(parent[cur])
                chain.append(cur)
            if parent[cur] < 0:
                continue  # the whole tree is one chain
            length += float(np.linalg.norm(pos[cur] - pos[parent[cur]]))
            if length < min_len and nch[parent[cur]] >= 2:
                keep[chain] = False
                nch[parent[cur]] -= 1
                changed = True
        if not changed:
            break
    return keep


def _compact(keep, pos, parent, geod, npts, point_node):
    new_id = np.cumsum(keep) - 1
    new_id[~keep] = -1
    par = parent[keep]
    par = np.where(par >= 0, new_id[np.maximum(par, 0)], -1)
    pn = np.where(point_node >= 0, new_id[np.maximum(point_node, 0)], -1)
    return pos[keep], par, geod[keep], npts[keep], pn


def _subtree_lengths(skel: Skeleton) -> np.ndarray:
    el = skel.edge_length()
    sub = el.copy()
    for i in np.argsort(-skel.geodesic, kind="stable").tolist():
        pa = skel.parent[i]
        if pa >= 0:
            sub[pa] += sub[i]
    return sub  # includes the edge to the parent


def _hierarchy(skel: Skeleton, p: SkeletonParams) -> None:
    """Trunk, scaffolds, branches and orders (see module docstring, step 4)."""
    ch = skel.children()
    sub = _subtree_lengths(skel)
    thr = p.scaffold_min_subtree_m

    def sig(n: int) -> list[int]:
        return [c for c in ch[n] if sub[c] >= thr]

    root = int(np.nonzero(skel.parent < 0)[0][0])
    trunk = [root]
    cur = root
    first = None
    while True:
        s = sig(cur)
        if len(s) >= 2:
            first = cur
            break
        if not ch[cur]:
            break
        nxt = s[0] if s else max(ch[cur], key=lambda c: (sub[c], -c))
        if not s:
            # Nothing significant left: the trunk ends in small twigs.
            break
        cur = nxt
        trunk.append(cur)
    skel.first_split = first
    assigned = np.full(skel.n_nodes, -1, dtype=np.int64)
    branches: list[BranchInfo] = [BranchInfo(0, None, 0, False, [])]
    scaffold_bases: list[int] = []
    ambiguous = 0
    if first is not None:
        # Zone above the first branching, wider for thick trunks (scaffold bases of
        # a 45 cm trunk need more than 30 cm to separate).
        trunk_r = float(np.median(skel.raw_radius[trunk]))
        zone = max(p.scaffold_zone_m, p.scaffold_zone_trunk_radii * trunk_r)
        d0 = skel.geodesic[first]

        def in_zone(n: int) -> bool:
            return skel.geodesic[n] - d0 <= zone

        def splits_in_zone(c: int) -> int | None:
            cur = c
            while in_zone(cur):
                s = sig(cur)
                if len(s) >= 2:
                    return cur
                if len(s) == 0:
                    return None
                cur = s[0]
            return None

        todo = [first]
        internal: list[int] = []
        while todo:
            n = todo.pop()
            for c in sorted(sig(n)):
                nxt = splits_in_zone(c)
                if nxt is None:
                    scaffold_bases.append(c)
                    if sub[c] < 1.5 * thr:
                        ambiguous += 1
                else:
                    # The trunk continues up to the next fork.
                    cur = c
                    while cur != nxt:
                        internal.append(cur)
                        cur = sig(cur)[0]
                    internal.append(nxt)
                    todo.append(nxt)
            # Near misses: almost significant stems at a scaffold fork.
            ambiguous += sum(1 for c in ch[n] if 0.6 * thr <= sub[c] < thr)
        trunk.extend(internal)
        # A fork right at the zone edge could go either way.
        for c in scaffold_bases:
            if abs(skel.geodesic[c] - d0 - zone) < p.bin_m:
                ambiguous += 1
    trunk_set = set(trunk)
    for n in trunk:
        assigned[n] = 0
    branches[0].nodes = sorted(trunk, key=lambda n: (skel.geodesic[n], n))

    def grow(start: int, parent_branch: int, order: int, scaffold: bool) -> None:
        stack = [(start, parent_branch, order, scaffold)]
        while stack:
            s, pb, o, sc = stack.pop()
            bid = len(branches)
            br = BranchInfo(bid, pb, o, sc, [])
            branches.append(br)
            cur = s
            while True:
                br.nodes.append(cur)
                assigned[cur] = bid
                kids = [c for c in ch[cur] if c not in trunk_set and assigned[c] < 0]
                if not kids:
                    break
                main = max(kids, key=lambda c: (sub[c], -c))
                for c in sorted(kids, reverse=True):
                    if c != main:
                        stack.append((c, bid, o + 1, False))
                cur = main

    base_set = set(scaffold_bases)
    for c in sorted(scaffold_bases):
        grow(c, 0, 1, True)
    # Everything else hanging off the trunk: small order-1 shoots (not scaffolds).
    for n in branches[0].nodes:
        for c in sorted(ch[n]):
            if c not in trunk_set and c not in base_set and assigned[c] < 0:
                grow(c, 0, 1, False)
    skel.branch = assigned
    skel.order = np.array([branches[b].order for b in assigned.tolist()], dtype=np.int64)
    skel.branches = branches
    skel.scaffold_bases = sorted(scaffold_bases)
    skel.ambiguous_scaffolds = ambiguous
    if first is None:
        skel.notes.append("no_branching_found")


def _node_raw_radii(
    skel: Skeleton, points: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per node: mean squared distance to the local axis, point count, elongation.

    Elongation is the ratio of the two cross-section variances (points projected
    on the plane normal to the axis): about 1 for one round stem, large where a
    level-set cluster still holds two stems just above a fork.
    """
    m = skel.n_nodes
    ch = skel.children()
    sub = _subtree_lengths(skel)
    direction = np.zeros((m, 3))
    for i in range(m):
        prev = skel.pos[skel.parent[i]] if skel.parent[i] >= 0 else skel.pos[i]
        nxt = skel.pos[max(ch[i], key=lambda c: (sub[c], -c))] if ch[i] else skel.pos[i]
        d = nxt - prev
        nd = np.linalg.norm(d)
        direction[i] = d / nd if nd > 1e-9 else (0.0, 0.0, 1.0)
    pn = skel.point_node
    ok = pn >= 0
    v = points[ok] - skel.pos[pn[ok]]
    along = (v * direction[pn[ok]]).sum(1)
    d2 = np.maximum((v * v).sum(1) - along * along, 0.0)
    # Robust: drop points beyond 3x the node's median distance (junction clutter).
    nodes = pn[ok]
    order = np.lexsort((d2, nodes))
    counts = np.bincount(nodes, minlength=m)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    med = np.zeros(m)
    has = counts > 0
    med[has] = d2[order][starts[has] + (counts[has] - 1) // 2]
    inl = d2 <= 9.0 * med[nodes] + 1e-12
    msd = np.bincount(nodes[inl], d2[inl], m) / np.maximum(np.bincount(nodes[inl], minlength=m), 1)
    perp = v - along[:, None] * direction[nodes]
    cov = np.zeros((m, 3, 3))
    for a in range(3):
        for b in range(a, 3):
            cov[:, a, b] = cov[:, b, a] = np.bincount(nodes, perp[:, a] * perp[:, b], m)
    cov /= np.maximum(counts, 1)[:, None, None]
    ev = np.linalg.eigvalsh(cov)  # ascending; ev[:, 0] ~ 0 (along the axis)
    elong = ev[:, 2] / np.maximum(ev[:, 1], 1e-12)
    return msd, counts, elong


def _fit_taper(
    s: np.ndarray, r: np.ndarray, use: np.ndarray, floor: float, cap: float
) -> tuple[np.ndarray, float]:
    """Robust linear taper r = a + b s (b <= 0) over the ``use`` nodes.

    Returns (radii at every s, 1-sigma of the fitted level); NaN radii when no
    node is usable.
    """
    if not use.any():
        return np.full(len(r), np.nan), math.nan
    s_all = s
    s, r = s[use], r[use]
    if len(r) < 4:
        val = float(np.clip(np.median(r), floor, cap))
        se = float(np.std(r) / math.sqrt(len(r))) if len(r) > 1 else val * 0.5
        return np.full(len(s_all), val), se
    # Median filter (window 3) against single junction outliers.
    padded = np.concatenate([[r[0]], r, [r[-1]]])
    rm = np.median(np.stack([padded[:-2], padded[1:-1], padded[2:]]), axis=0)
    use = np.ones(len(r), dtype=bool)
    a, b = float(np.median(rm)), 0.0
    for _ in range(3):
        A = np.column_stack([np.ones(use.sum()), s[use]])
        (a, b), *_ = np.linalg.lstsq(A, rm[use], rcond=None)
        if b > 0:
            a, b = float(np.median(rm[use])), 0.0
        res = rm - (a + b * s)
        mad = float(np.median(np.abs(res[use]))) * 1.4826 + 1e-4
        new = np.abs(res) <= 2.5 * mad
        if new.sum() < 3 or np.array_equal(new, use):
            break
        use = new
    res = rm[use] - (a + b * s[use])
    se = float(np.sqrt((res**2).sum() / max(use.sum() - 2, 1)) / math.sqrt(use.sum()))
    return np.clip(a + b * s_all, floor, cap), se


def _raw_radii(skel: Skeleton, points: np.ndarray, p: SkeletonParams, sigma: float | None) -> None:
    msd, counts, elong = _node_raw_radii(skel, points)
    clean = (counts >= 5) & (elong <= p.max_elongation)
    if p.noise_sigma_m is not None:
        sig = p.noise_sigma_m
    else:
        # Branch tips are the thinnest wood: there msd ~ 2 sigma^2 (+ r_tip^2, small).
        # The median over tip nodes resists the few thick (cut or scaffold) tips.
        tips = clean & (counts >= 5) & (_subtree_lengths(skel) <= p.noise_tip_length_m)
        if tips.sum() >= 5:
            sig = float(np.clip(math.sqrt(float(np.median(msd[tips])) / 2), 0.003, 0.05))
        else:
            sig = sigma if sigma is not None else 0.015
    skel.sigma = sig
    skel.raw_radius = np.sqrt(np.maximum(msd - 2 * sig * sig, p.radius_floor_m**2))
    skel.clean = clean


def _smooth_radii(skel: Skeleton, p: SkeletonParams) -> None:
    """Per-branch taper where the cloud resolves the radius, pipe model below that.

    A radius under ``radius_reliable_sigma`` x sigma is mostly noise. There the
    pipe model takes over: a node's cross-section is its parent's, scaled by the
    share of the parent's subtree length it carries (r^2 proportional to the
    length of wood supported), and a noisy measurement can only lower it.
    """
    raw = skel.raw_radius
    fit = raw.copy()
    for br in skel.branches:
        if not br.nodes:
            continue
        nodes = np.array(br.nodes)
        s = skel.geodesic[nodes] - skel.geodesic[nodes[0]]
        cap = max(float(raw[nodes].max()), p.radius_floor_m)
        use = skel.clean[nodes]
        fitted, se = _fit_taper(s, raw[nodes], use, p.radius_floor_m, cap)
        fit[nodes] = fitted
        br.radius_se = se
    sub = _subtree_lengths(skel)
    reliable = p.radius_reliable_sigma * skel.sigma
    radius = fit.copy()
    for i in np.argsort(skel.geodesic, kind="stable").tolist():
        pa = int(skel.parent[i])
        if pa < 0:
            continue
        pipe = radius[pa] * math.sqrt(sub[i] / max(sub[pa], 1e-9))
        if not np.isfinite(fit[i]):
            cand = pipe
        else:
            cand = fit[i] if fit[i] >= reliable else min(fit[i], pipe)
        radius[i] = min(max(cand, p.radius_floor_m), radius[pa])
    skel.radius = radius


def _volumes(skel: Skeleton) -> None:
    el = skel.edge_length()
    ev = np.zeros(skel.n_nodes)
    for i in range(skel.n_nodes):
        pa = skel.parent[i]
        if pa < 0:
            continue
        r1 = skel.radius[i]
        r0 = skel.radius[pa] if skel.branch[pa] == skel.branch[i] else r1
        ev[i] = _frustum(float(el[i]), float(r0), float(r1))
    skel.edge_volume = ev
    root = int(np.nonzero(skel.parent < 0)[0][0])
    skel.base_volume = math.pi * float(skel.radius[root]) ** 2 * max(float(skel.pos[root, 2]), 0)
    for br in skel.branches:
        br.length = float(el[br.nodes].sum()) if br.nodes else 0.0
        br.volume = float(ev[br.nodes].sum()) if br.nodes else 0.0
    skel.branches[0].volume += skel.base_volume


# --- per-tree metrics ------------------------------------------------------------------


def trunk_diameter(
    points: np.ndarray, skel: Skeleton, p: SkeletonParams
) -> tuple[float | None, float | None, float | None, list[str]]:
    """Trunk diameter by a circle fit on a horizontal slice (Kasa, noise-corrected).

    Returns (diameter, 1-sigma, height used, notes). When the first branching is
    too low for the configured height, the slice moves down (not below
    ``trunk_min_height_m``) and a note says so.
    """
    notes: list[str] = []
    trunk = np.array(skel.branches[0].nodes)
    top = (
        float(skel.pos[skel.first_split, 2])
        if skel.first_split is not None
        else float(skel.pos[trunk, 2].max())
    )
    half = p.trunk_slice_m / 2
    h = p.trunk_diameter_height_m
    # Stems still merge some 10 cm below where the level sets separate them.
    limit = top - 0.1 - half
    if h > limit:
        h = limit
        notes.append("trunk_diameter_below_first_branching")
    if h < p.trunk_min_height_m:
        notes.append("trunk_too_short_for_diameter")
        return None, None, None, notes
    on_trunk = np.isin(skel.point_node, trunk)
    sl = points[on_trunk & (np.abs(points[:, 2] - h) <= half)]
    if len(sl) < 20:
        notes.append("trunk_slice_too_few_points")
        return None, None, None, notes
    x, y = sl[:, 0], sl[:, 1]
    A = np.column_stack([2 * x, 2 * y, np.ones(len(x))])
    (cx, cy, c), *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
    r_fit2 = c + cx * cx + cy * cy
    if r_fit2 <= 0:
        notes.append("trunk_fit_failed")
        return None, None, None, notes
    rho = np.hypot(x - cx, y - cy)
    r = math.sqrt(max(r_fit2 - 2 * skel.sigma**2, p.radius_floor_m**2))
    ang = np.mod(np.degrees(np.arctan2(y - cy, x - cx)), 360.0)
    arc = np.count_nonzero(np.bincount((ang // 30).astype(int), minlength=12)) / 12
    se = float(np.std(rho - math.sqrt(r_fit2)) / math.sqrt(len(rho)))
    unc = math.sqrt((2 * se) ** 2 + 0.005**2)
    if arc < 0.5:
        notes.append("trunk_arc_partial")
        unc *= 3
    return 2 * r, unc, h, notes


def box_counting_dimension(points: np.ndarray, scales: list[float]) -> tuple[float, float]:
    """Slope of log N(s) against log 1/s over the given box sizes, and its standard error."""
    lo = points.min(0)
    n = []
    for s in scales:
        ijk = np.floor((points - lo) / s).astype(np.int64)
        n.append(len(np.unique(ijk, axis=0)))
    x = np.log(1 / np.asarray(scales, dtype=float))
    y = np.log(np.asarray(n, dtype=float))
    A = np.column_stack([np.ones(len(x)), x])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    res = y - A @ coef
    dof = max(len(x) - 2, 1)
    s2 = float((res**2).sum() / dof)
    se = math.sqrt(s2 / float(((x - x.mean()) ** 2).sum()))
    return float(coef[1]), se


def clutter_fraction(points: np.ndarray, z_from: float, p: SkeletonParams) -> float | None:
    """Share of crown points in volumetric (non-linear, non-planar) neighbourhoods.

    Wood is lines (branches) and surfaces (thick stems) at the ``leafy_cell_m``
    x 3 scale; foliage fills volumes. Scatter = smallest / largest eigenvalue of
    the point covariance over the 27 cells around each cell.
    """
    pts = points[points[:, 2] >= z_from]
    if len(pts) < 50:
        return None
    g = voxelize(pts, p.leafy_cell_m)
    nv = len(g.keys)
    s1 = np.column_stack([np.bincount(g.point_voxel, pts[:, k], nv) for k in range(3)])
    s2 = np.zeros((nv, 3, 3))
    for a in range(3):
        for b in range(a, 3):
            s2[:, a, b] = s2[:, b, a] = np.bincount(g.point_voxel, pts[:, a] * pts[:, b], nv)
    n = g.count.astype(float)
    tn, t1, t2 = n.copy(), s1.copy(), s2.copy()
    src, dst, _ = voxel_edges(g, 1)
    np.add.at(tn, src, n[dst])
    np.add.at(t1, src, s1[dst])
    np.add.at(t2, src, s2[dst])
    mean = t1 / tn[:, None]
    cov = t2 / tn[:, None, None] - mean[:, :, None] * mean[:, None, :]
    ev = np.linalg.eigvalsh(cov)
    scatter = ev[:, 0] / np.maximum(ev[:, 2], 1e-12)
    valid = tn >= 10
    if not valid.any():
        return None
    return float(n[valid & (scatter > p.leafy_scatter_min)].sum() / n[valid].sum())


def tree_quality(tc: TreeCloud, p: SkeletonParams) -> TreeQuality:
    notes: list[str] = []
    if tc.n_points == 0:
        status = "no_points"
    elif tc.n_points < p.min_points:
        status = "too_few_points"
    elif tc.sector_coverage < p.min_sector_coverage:
        status = "one_sided"
        notes.append("hidden branches would be missed; no measurement")
    else:
        status = "ok"
    return TreeQuality(
        tree_id=tc.tree_id,
        slot_code=tc.slot_code,
        n_points=tc.n_points,
        sector_coverage=round(tc.sector_coverage, 3),
        status=status,  # type: ignore[arg-type]
        notes=notes,
    )


@dataclass
class TreeResult:
    quality: TreeQuality
    detail: TreeSkeleton
    measurements: list[LidarMeasurement]
    skeleton: Skeleton | None


def _r(x: float | None, nd: int) -> float | None:
    if x is None or not math.isfinite(x):
        return None
    return round(float(x), nd)


def wood_volume_uncertainty(skel: Skeleton, p: SkeletonParams) -> float:
    """1 sigma: fitted-radius scatter per branch (2 dr/r per volume) + systematic part."""
    stat2 = 0.0
    for br in skel.branches:
        if not br.nodes or not math.isfinite(br.radius_se) or br.volume <= 0:
            continue
        r = float(np.mean(skel.radius[br.nodes]))
        stat2 += (2 * br.radius_se / max(r, p.radius_floor_m) * br.volume) ** 2
    v = skel.wood_volume
    return math.sqrt(stat2 + (p.wood_volume_rel_uncertainty * v) ** 2)


def analyze_tree(tc: TreeCloud, p: SkeletonParams, sigma_hint: float | None = None) -> TreeResult:
    q = tree_quality(tc, p)
    detail = TreeSkeleton(
        tree_id=tc.tree_id,
        slot_code=tc.slot_code,
        center_en=(round(tc.center_en[0], 3), round(tc.center_en[1], 3)),
        ground_z=round(tc.ground_z, 3) if math.isfinite(tc.ground_z) else 0.0,
        n_points=tc.n_points,
        connected_share=0.0,
    )
    if q.status in ("no_points", "too_few_points"):
        return TreeResult(q, detail, [], None)
    pts = tc.points
    try:
        skel = skeletonize(pts, p, sigma_hint)
    except SkeletonError as e:
        q.notes.append(f"skeleton_failed: {e}")
        detail.notes.append(f"skeleton_failed: {e}")
        return TreeResult(q, detail, [], None)
    detail.notes.extend(skel.notes)
    detail.connected_share = round(skel.connected_share, 3)
    detail.noise_sigma_m = round(skel.sigma, 4)
    first_z = float(skel.pos[skel.first_split, 2]) if skel.first_split is not None else None
    detail.first_branching_height_m = _r(first_z, 3)
    detail.scaffold_branch_count = len(skel.scaffold_bases) if first_z is not None else None
    d, d_unc, h, notes = trunk_diameter(pts, skel, p)
    detail.trunk_diameter_m = _r(d, 4)
    detail.trunk_diameter_uncertainty_m = _r(d_unc, 4)
    detail.trunk_diameter_height_m = _r(h, 3)
    detail.notes.extend(notes)
    detail.branch_count_by_order = skel.count_by_order()
    detail.total_length_m = _r(skel.total_length, 3)
    vol = skel.wood_volume
    vol_unc = wood_volume_uncertainty(skel, p)
    detail.wood_volume_m3 = _r(vol, 6)
    detail.wood_volume_uncertainty_m3 = _r(vol_unc, 6)
    on = pts[skel.point_node >= 0]
    fd, fd_se = box_counting_dimension(on, p.fractal_scales_m)
    detail.fractal_dimension = _r(fd, 3)
    detail.fractal_dimension_se = _r(fd_se, 3)
    # Thick stems fill a cell volume like foliage does: leave them out.
    thick = np.zeros(len(pts), dtype=bool)
    on_node = skel.point_node >= 0
    thick[on_node] = skel.radius[skel.point_node[on_node]] > p.leafy_cell_m / 2
    clutter = clutter_fraction(pts[~thick], first_z if first_z is not None else 0.0, p)
    detail.clutter_fraction = _r(clutter, 3)
    leafy = clutter is not None and clutter > p.leafy_warn_fraction
    if leafy:
        detail.notes.append("leafy_clutter")
    if leafy and skel.n_nodes > p.max_nodes_leafy:
        detail.notes.append("skeleton_nodes_omitted")
    detail.nodes = (
        []
        if leafy and skel.n_nodes > p.max_nodes_leafy
        else [
            SkeletonNode(
                id=i,
                xyz=(round(x, 3), round(y, 3), round(z, 3)),
                radius_m=round(float(skel.radius[i]), 4),
                parent=int(skel.parent[i]) if skel.parent[i] >= 0 else None,
                order=int(skel.order[i]),
                branch=int(skel.branch[i]),
            )
            for i, (x, y, z) in enumerate(skel.pos.tolist())
        ]
    )
    detail.branches = [
        SkeletonBranch(
            id=b.id,
            parent=b.parent,
            order=b.order,
            scaffold=b.scaffold,
            length_m=round(b.length, 3),
            base_radius_m=round(float(skel.radius[b.nodes[0]]), 4) if b.nodes else 0.0,
            volume_m3=round(b.volume, 6),
            n_nodes=len(b.nodes),
        )
        for b in skel.branches
    ]
    ms: list[LidarMeasurement] = []
    if q.status == "ok":
        common = dict(
            tree_id=tc.tree_id, slot_code=tc.slot_code, method=METHOD, method_version=METHOD_VERSION
        )
        if detail.scaffold_branch_count is not None:
            amb = skel.ambiguous_scaffolds
            ms.append(
                LidarMeasurement(
                    metric="scaffold_branch_count",
                    value_numeric=float(detail.scaffold_branch_count),
                    unit="count",
                    uncertainty=round(math.sqrt(0.25 + amb), 2),
                    confidence=round(max(0.3, 0.9 - 0.2 * amb), 2),
                    **common,
                )
            )
        ms.append(
            LidarMeasurement(
                metric="wood_volume",
                value_numeric=round(vol, 6),
                unit="m3",
                uncertainty=round(vol_unc, 6),
                **common,
            )
        )
        ms.append(
            LidarMeasurement(
                metric="fractal_dimension",
                value_numeric=round(fd, 3),
                unit=None,
                uncertainty=round(max(fd_se, 0.01), 3),
                **common,
            )
        )
    return TreeResult(q, detail, ms, skel)


def producer(p: SkeletonParams) -> Producer:
    return Producer(
        pipeline=PIPELINE_NAME, version=__version__, params_hash=p.params_hash(), stage=STAGE
    )


def cloud_ref(meta: CloudMeta) -> CloudRef:
    return CloudRef(
        origin_lat=meta.origin_lat,
        origin_lon=meta.origin_lon,
        origin_height_m=meta.origin_height_m,
        registration_method=meta.registration_method,
        registration_version=meta.registration_version,
        point_sigma_m=meta.point_sigma_m,
    )


def make_report(meta: CloudMeta, trees: list[TreeCloud], p: SkeletonParams) -> SkeletonReport:
    results = [analyze_tree(tc, p, meta.point_sigma_m) for tc in trees]
    warnings: list[str] = []
    clutter = [
        r.detail.clutter_fraction
        for r in results
        if r.quality.status == "ok" and r.detail.clutter_fraction is not None
    ]
    if clutter and float(np.median(clutter)) > p.leafy_warn_fraction:
        warnings.append(
            f"leafy_cloud: median crown clutter {float(np.median(clutter)):.2f} > "
            f"{p.leafy_warn_fraction:.2f}; the skeleton needs a leafless (winter) scan"
        )
    return SkeletonReport(
        producer=producer(p),
        method=METHOD,
        method_version=METHOD_VERSION,
        session_id=meta.session_id,
        parcel_id=meta.parcel_id,
        trees=[r.quality for r in results],
        measurements=[m for r in results for m in r.measurements],
        params=p,
        cloud=cloud_ref(meta),
        warnings=warnings,
        skeletons=[r.detail for r in results],
    )


def run(
    session_dir: Path, trees_path: Path, out_dir: Path, params_path: Path | None = None
) -> SkeletonReport:
    p = load_params(params_path)
    cloud = load_session_cloud(Path(session_dir))
    trees = extract_trees(cloud, load_tree_positions(Path(trees_path)), radius_m=p.tree_radius_m)
    report = make_report(cloud.meta, trees, p)
    write_model(report, Path(out_dir) / REPORT_FILE)
    return report


def summary_line(report: SkeletonReport) -> str:
    ok = [t for t in report.trees if t.status == "ok"]
    counts = [
        int(m.value_numeric)
        for m in report.measurements
        if m.metric == "scaffold_branch_count" and m.value_numeric is not None
    ]
    vol = sum(m.value_numeric or 0.0 for m in report.measurements if m.metric == "wood_volume")
    line = (
        f"lidar skeleton: {len(ok)}/{len(report.trees)} trees measured, "
        f"scaffold branches {min(counts) if counts else '-'}-{max(counts) if counts else '-'}, "
        f"wood volume {vol:.3f} m3"
    )
    if report.warnings:
        line += f"; warnings: {'; '.join(report.warnings)}"
    return line
