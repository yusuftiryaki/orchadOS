"""Stage lidar_pruning: what was pruned, from two winter scans of the same trees.

Method ``lidar_pruning`` 0.1.0 (research; thresholds are v0 placeholders to be
calibrated against hand counts, docs/metodoloji.md section 4.3).

Both sessions' clouds are registered in the same absolute frame but may have
different local origins. Every tree is cut from both clouds around the same
inventory position (lat/lon from one trees JSON, converted with each cloud's
own LocalFrame), so the two tree frames already coincide up to registration
drift and the per-tree ground fit (a few cm). Per tree:

1. Alignment (optional, ``align``): trimmed point-to-point ICP of the after
   cloud onto the before cloud, translation and a small yaw about the trunk.
   After -> before is the robust direction: almost every after point still has
   its counterpart (pruning only removes wood), removed wood is not matched.
   Results beyond ``align_max_shift_m`` / ``align_max_yaw_deg`` are rejected.
2. Change detection: before points with no after point within
   ``change_tolerance_m`` are "removed". The before skeleton (skeleton.py)
   gets a removed share per node and per subtree; a cut is a maximal subtree
   whose own node and whole subtree are mostly removed
   (``removed_node_fraction``) and whose skeleton length reaches
   ``min_cut_length_m``. The cut point is the middle of the edge between the
   kept parent and the first removed node, the cut diameter that node's
   diameter, the removed wood the subtree's skeleton volume.
3. Growth: after points with no before point within the tolerance (new shoots,
   another object) are reported separately and never count as pruning.
4. Proposal for ``pruning_status`` (done / partial / not_done), following
   docs/metodoloji.md 4.3 ("partial: some scaffold branches pruned, part of the
   crown untouched"): not_done without cuts or below ``partial_min_fraction``
   of the wood; done when cuts reach at least ``done_min_scaffold_share`` of the
   scaffold branches and there are at least ``done_min_cuts`` cuts or
   ``done_min_fraction`` of the wood is gone; partial otherwise. The wood
   fraction alone is a poor guide: trunk and scaffolds hold most of the volume,
   so thinning a few order-2 branches removes only a few percent.
   A LiDAR scan cannot tell a fresh cut from an old one (colour), so this
   compares two visits; a single visit says nothing about pruning.

Accuracy on synthetic trees (productive + old, seeds 1-6, 12 trees per
scenario): cut count within +-1 for 92-100 % of the trees (1-3 cuts of order 1
or 2). Removed volume is biased low: whole scaffolds median -22 % (-41 % ..
-14 %); three order-2 cuts median -39 % (-88 % .. +15 %); a single order-2 cut
median -49 % (-100 % .. +55 %), where the level-set skeleton sometimes hangs
the removed branch's thick base on a neighbouring kept stem. Short thin
branches of young trees (< 0.4 m) are often missed. All thresholds are v0.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .. import PIPELINE_NAME, __version__
from ..hashing import hash_object
from ..models import Model, Producer, write_model
from .cloud import TreeCloud, extract_trees, load_session_cloud, load_tree_positions, map_trees
from .models import CloudMeta, LidarMeasurement, LidarReport, TreeQuality
from .skeleton import (
    CloudRef,
    Skeleton,
    SkeletonError,
    SkeletonParams,
    cloud_ref,
    components,
    skeletonize,
    tree_quality,
    voxel_edges,
    voxelize,
)

METHOD = "lidar_pruning"
METHOD_VERSION = "0.1.0"
STAGE = "lidar_pruning"
REPORT_FILE = "pruning.json"

Status = Literal["done", "partial", "not_done"]


class PruningParams(BaseModel):
    """Parameters of lidar_pruning (hashed into Producer.params_hash)."""

    model_config = ConfigDict(extra="forbid")

    # Skeleton of the before scan (and tree extraction / quality gates).
    skeleton: SkeletonParams = Field(default_factory=SkeletonParams)
    # Alignment refinement.
    align: bool = True
    align_voxel_m: float = 0.05
    align_max_dist_m: float = 0.1
    align_trim: float = 1.0
    align_iterations: int = 30
    align_max_shift_m: float = 0.3
    align_max_yaw_deg: float = 5.0
    # Change detection.
    change_tolerance_m: float = 0.08
    removed_node_fraction: float = 0.6
    min_cut_length_m: float = 0.2
    min_part_voxels: int = 10
    # Cuts closer than this are one cut (pieces of one removed branch).
    merge_cut_distance_m: float = 0.5
    merge_piece_max_m: float = 1.0
    # Longest stretch a removed branch is followed back to the remaining stem.
    max_blind_m: float = 0.6
    # Status thresholds (v0 placeholders, to be calibrated).
    # 0: any cut makes the tree at least partial (removed volume is biased low).
    partial_min_fraction: float = 0.0
    done_min_cuts: int = 3
    done_min_fraction: float = 0.1
    done_min_scaffold_share: float = 0.5
    # Systematic relative 1-sigma of removed wood volume (v0), and the volume of a
    # removed part too small to be found (added in quadrature, so 0 is never exact).
    pruned_volume_rel_uncertainty: float = 0.3
    pruned_volume_detection_m3: float = 0.0002

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))


def load_params(path: Path | None) -> PruningParams:
    if path is None:
        return PruningParams()
    body = json.loads(Path(path).read_text(encoding="utf-8"))
    return PruningParams.model_validate(body.get("pruning", body))


# --- report models -------------------------------------------------------------


class Alignment(Model):
    applied: bool
    shift_m: tuple[float, float, float]
    yaw_deg: float
    rms_before_m: float | None = None
    rms_after_m: float | None = None
    note: str | None = None


class PruningCut(Model):
    node: int  # first removed node of the before skeleton (skeleton.json numbering)
    xyz: tuple[float, float, float]  # cut point, before tree frame
    diameter_m: float
    removed_volume_m3: float
    removed_length_m: float
    order: int  # branch order of the removed wood at the cut (1 = scaffold)
    scaffold: int | None  # index into the before skeleton's scaffold list, None on the trunk
    removed_share: float  # share of the subtree's points with no after point near


class TreePruning(Model):
    tree_id: str
    slot_code: str | None = None
    alignment: Alignment | None = None
    wood_volume_before_m3: float | None = None
    wood_volume_after_m3: float | None = None
    pruned_volume_m3: float | None = None
    pruned_volume_uncertainty_m3: float | None = None
    pruned_fraction: float | None = None
    pruned_fraction_uncertainty: float | None = None
    cuts: list[PruningCut] = Field(default_factory=list)
    scaffold_count_before: int | None = None
    scaffolds_with_cuts: int | None = None
    removed_parts: int = 0
    removed_unmatched_share: float | None = None
    growth_parts: int = 0
    growth_points: int = 0
    status: Status | None = None
    confidence: float | None = None
    notes: list[str] = Field(default_factory=list)


class PruningReport(LidarReport):
    schema_: Literal["orchados.lidar_pruning/1"] = Field("orchados.lidar_pruning/1", alias="schema")
    before_session_id: str
    params: PruningParams
    cloud_before: CloudRef
    cloud_after: CloudRef
    warnings: list[str] = Field(default_factory=list)
    details: list[TreePruning] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# --- geometry helpers ---------------------------------------------------------------


def downsample(points: np.ndarray, size: float) -> np.ndarray:
    """Voxel centroids (deterministic order)."""
    if len(points) == 0:
        return points
    return voxelize(points, size).centroid


def nearest(
    query: np.ndarray, target: np.ndarray, max_dist: float
) -> tuple[np.ndarray, np.ndarray]:
    """Nearest target point per query within max_dist: (distance or inf, index or -1).

    Exact within max_dist: a hash grid of cell max_dist, 27 cells searched.
    """
    nq = len(query)
    best = np.full(nq, np.inf)
    arg = np.full(nq, -1, dtype=np.int64)
    if nq == 0 or len(target) == 0:
        return best, arg
    lo = np.floor(np.minimum(query.min(0), target.min(0)) / max_dist).astype(np.int64) - 2
    hi = np.floor(np.maximum(query.max(0), target.max(0)) / max_dist).astype(np.int64) + 2
    dims = hi - lo + 1

    def enc(ijk: np.ndarray) -> np.ndarray:
        r = ijk - lo
        return (r[:, 0] * dims[1] + r[:, 1]) * dims[2] + r[:, 2]

    tk = enc(np.floor(target / max_dist).astype(np.int64))
    order = np.argsort(tk, kind="stable")
    tk_sorted = tk[order]
    tgt = target[order]
    qijk = np.floor(query / max_dist).astype(np.int64)
    r = np.arange(-1, 2)
    for o in np.stack(np.meshgrid(r, r, r, indexing="ij"), -1).reshape(-1, 3):
        qk = enc(qijk + o)
        start = np.searchsorted(tk_sorted, qk, "left")
        end = np.searchsorted(tk_sorted, qk, "right")
        n = end - start
        tot = int(n.sum())
        if tot == 0:
            continue
        qi = np.repeat(np.arange(nq), n)
        first = np.repeat(np.cumsum(n) - n, n)
        ti = np.repeat(start, n) + (np.arange(tot) - first)
        d2 = ((query[qi] - tgt[ti]) ** 2).sum(1)
        tmp = np.full(nq, np.inf)
        np.minimum.at(tmp, qi, d2)
        hit = d2 == tmp[qi]
        q_hit, t_hit = qi[hit], ti[hit]
        better = np.sqrt(tmp[q_hit]) < best[q_hit]
        q_sel = q_hit[better]
        best[q_sel] = np.sqrt(tmp[q_sel])
        arg[q_sel] = order[t_hit[better]]
    far = best > max_dist
    best[far] = np.inf
    arg[far] = -1
    return best, arg


def _rot(points: np.ndarray, yaw: float) -> np.ndarray:
    c, s = math.cos(yaw), math.sin(yaw)
    out = points.copy()
    out[:, 0] = c * points[:, 0] - s * points[:, 1]
    out[:, 1] = s * points[:, 0] + c * points[:, 1]
    return out


def transform(points: np.ndarray, yaw: float, shift: np.ndarray) -> np.ndarray:
    return _rot(points, yaw) + shift


def _structure(points: np.ndarray, size: float) -> tuple[np.ndarray, np.ndarray]:
    """Voxel centroids and a per-voxel metric that ignores the along-structure directions.

    The metric comes from the point covariance over the 27 voxels around each
    voxel: directions with little spread (a branch's cross-section, a trunk
    surface's normal) weigh 1, directions along the structure about 0. This
    makes the alignment point-to-line on branches and point-to-plane on the trunk.
    """
    g = voxelize(points, size)
    nv = len(g.keys)
    s1 = np.column_stack([np.bincount(g.point_voxel, points[:, k], nv) for k in range(3)])
    s2 = np.zeros((nv, 3, 3))
    for a in range(3):
        for b in range(a, 3):
            s2[:, a, b] = s2[:, b, a] = np.bincount(g.point_voxel, points[:, a] * points[:, b], nv)
    n = g.count.astype(float)
    tn, t1, t2 = n.copy(), s1.copy(), s2.copy()
    src, dst, _ = voxel_edges(g, 1)
    np.add.at(tn, src, n[dst])
    np.add.at(t1, src, s1[dst])
    np.add.at(t2, src, s2[dst])
    mean = t1 / tn[:, None]
    cov = t2 / tn[:, None, None] - mean[:, :, None] * mean[:, None, :]
    ev, vec = np.linalg.eigh(cov)
    w = np.where(ev < 0.25 * ev[:, 2:3], 1.0, 0.01)
    metric = np.einsum("nik,nk,njk->nij", vec, w, vec)
    return g.centroid, metric


def align(
    after: np.ndarray, before: np.ndarray, p: PruningParams
) -> tuple[float, np.ndarray, Alignment]:
    """Yaw (radians, about the tree frame's z axis) and shift that move after onto before.

    Trimmed ICP on voxel centroids with a point-to-structure metric (_structure).
    """
    src = downsample(after, p.align_voxel_m)
    tgt, metric = _structure(before, p.align_voxel_m)
    yaw, t = 0.0, np.zeros(3)
    d0, _ = nearest(src, tgt, p.align_max_dist_m)
    rms0 = _trimmed_rms(d0, p.align_trim)
    for _ in range(p.align_iterations):
        cur = transform(src, yaw, t)
        d, j = nearest(cur, tgt, p.align_max_dist_m)
        ok = np.isfinite(d)
        if ok.sum() < 30:
            break
        lim = np.quantile(d[ok], p.align_trim)
        use = ok & (d <= lim)
        c, q, m = cur[use], tgt[j[use]], metric[j[use]]
        jac = np.zeros((len(c), 3, 4))
        jac[:, 0, 0] = jac[:, 1, 1] = jac[:, 2, 2] = 1.0
        jac[:, 0, 3] = -c[:, 1]
        jac[:, 1, 3] = c[:, 0]
        jtm = np.einsum("nki,nkl->nil", jac, m)
        h = np.einsum("nil,nlj->ij", jtm, jac)
        g = np.einsum("nil,nl->i", jtm, q - c)
        dx, dy, dz, dyaw = np.linalg.solve(h + 1e-9 * np.eye(4), g)
        t = _rot(t[None, :], dyaw)[0] + np.array([dx, dy, dz])
        yaw += dyaw
        if math.hypot(math.hypot(dx, dy), dz) < 1e-4 and abs(dyaw) < 1e-5:
            break
    d1, _ = nearest(transform(src, yaw, t), tgt, p.align_max_dist_m)
    rms1 = _trimmed_rms(d1, p.align_trim)
    info = Alignment(
        applied=True,
        shift_m=(round(float(t[0]), 4), round(float(t[1]), 4), round(float(t[2]), 4)),
        yaw_deg=round(math.degrees(yaw), 3),
        rms_before_m=_round(rms0, 4),
        rms_after_m=_round(rms1, 4),
    )
    bad = (
        float(np.linalg.norm(t)) > p.align_max_shift_m
        or abs(math.degrees(yaw)) > p.align_max_yaw_deg
        or (rms0 is not None and rms1 is not None and rms1 > rms0 * 1.05)
    )
    if bad or rms1 is None:
        info.applied = False
        info.note = "alignment rejected (too large or no better); using the registration"
        return 0.0, np.zeros(3), info
    return yaw, t, info


def _trimmed_rms(d: np.ndarray, trim: float) -> float | None:
    ok = d[np.isfinite(d)]
    if len(ok) < 10:
        return None
    ok = np.sort(ok)[: max(1, int(len(ok) * trim))]
    return float(np.sqrt((ok**2).mean()))


def _round(x: float | None, nd: int) -> float | None:
    if x is None or not math.isfinite(x):
        return None
    return round(float(x), nd)


def _parts(points: np.ndarray, size: float, min_voxels: int) -> tuple[int, np.ndarray]:
    """Connected voxel clusters of a point set: (number of parts >= min_voxels, kept mask)."""
    if len(points) == 0:
        return 0, np.zeros(0, dtype=bool)
    g = voxelize(points, size)
    src, dst, _ = voxel_edges(g, 1)
    lab = components(len(g.keys), src, dst)
    sizes = np.bincount(lab, minlength=len(g.keys))
    big = sizes >= min_voxels
    n = int(np.count_nonzero(big & (lab == np.arange(len(g.keys)))))
    return n, big[lab[g.point_voxel]]


# --- per tree ------------------------------------------------------------------------


@dataclass
class _Cut:
    node: int  # first removed node (root of the removed part)
    frac: float  # removed share of the points assigned to it
    length: float  # removed skeleton length incl. the blind zone (m)
    volume: float  # removed wood volume incl. the blind zone (m3)
    point: np.ndarray  # cut point, before tree frame
    blind_m: float  # length added back to the remaining stem


def _subtree_sums(skel: Skeleton, values: np.ndarray) -> np.ndarray:
    out = values.astype(float).copy()
    for i in np.argsort(-skel.geodesic, kind="stable").tolist():
        pa = skel.parent[i]
        if pa >= 0:
            out[pa] += out[i]
    return out


def find_cuts(
    skel: Skeleton, removed: np.ndarray, p: PruningParams
) -> tuple[list[_Cut], list[_Cut], np.ndarray]:
    """Cuts on the before skeleton from per-point removed flags.

    A node's own removed share is the share of its points flagged removed. Roots
    of removed parts are nodes whose own share and subtree share both reach
    ``removed_node_fraction`` while their parent's do not. Every node belongs to
    the nearest root above it (a kept stretch between two roots stays with the
    upper one, weighted by its small removed share), so volume and length are
    sums of edge volume x own removed share: a skeleton that merged a removed
    and a kept stem does not count the kept one. Each root is then followed back
    to the remaining wood (``_blind_zone``).

    Returns (cuts, borderline candidates, removed node mask).
    """
    m = skel.n_nodes
    pn = skel.point_node
    on = pn >= 0
    n_all = np.bincount(pn[on], minlength=m).astype(float)
    n_rem = np.bincount(pn[on], weights=removed[on].astype(float), minlength=m)
    own = np.divide(n_rem, n_all, out=np.zeros(m), where=n_all > 0)
    sub_all = _subtree_sums(skel, n_all)
    sub_rem = _subtree_sums(skel, n_rem)
    sub_frac = np.divide(sub_rem, sub_all, out=np.zeros(m), where=sub_all > 0)
    el = skel.edge_length()
    thr = p.removed_node_fraction
    qual = (own >= thr) & (sub_frac >= thr) & (skel.parent >= 0)
    is_root = qual & ~(qual[np.maximum(skel.parent, 0)] & (skel.parent >= 0))
    root_of = np.full(m, -1, dtype=np.int64)
    for i in np.argsort(skel.geodesic, kind="stable").tolist():
        if is_root[i]:
            root_of[i] = i
        elif skel.parent[i] >= 0:
            root_of[i] = root_of[skel.parent[i]]
    # The root's own edge reaches back into the blind zone: _blind_zone replaces it.
    w = own.copy()
    w[is_root] = 0.0
    has = root_of >= 0
    vol = np.bincount(root_of[has], weights=(skel.edge_volume * w)[has], minlength=m)
    length = np.bincount(root_of[has], weights=(el * w)[has], minlength=m)
    pts_all = np.bincount(root_of[has], weights=n_all[has], minlength=m)
    pts_rem = np.bincount(root_of[has], weights=n_rem[has], minlength=m)
    kept_node = own < 0.3
    cuts, border = [], []
    removed_nodes = has & (own >= 0.3)
    for i in np.nonzero(is_root)[0].tolist():
        point, blind = _blind_zone(skel, i, kept_node, p)
        r = float(skel.radius[i])
        c = _Cut(
            node=i,
            frac=float(pts_rem[i] / pts_all[i]) if pts_all[i] > 0 else 0.0,
            length=float(length[i]) + blind,
            volume=float(vol[i]) + math.pi * r * r * blind,
            point=point,
            blind_m=blind,
        )
        if c.length >= p.min_cut_length_m:
            cuts.append(c)
            if c.frac < thr + 0.15 or c.length < 1.5 * p.min_cut_length_m:
                border.append(c)
        else:
            removed_nodes[root_of == i] = False
            if c.length >= 0.5 * p.min_cut_length_m:
                border.append(c)
    # Almost-cuts: subtrees just under the removed share.
    near = (
        (skel.parent >= 0) & (sub_frac >= thr - 0.2) & (sub_frac < thr) & (own >= thr - 0.2) & ~has
    )
    sub_len = _subtree_sums(skel, el)
    sub_vol = _subtree_sums(skel, skel.edge_volume)
    for i in np.nonzero(near & (sub_len >= p.min_cut_length_m))[0].tolist():
        if near[skel.parent[i]]:
            continue
        border.append(
            _Cut(i, float(sub_frac[i]), float(sub_len[i]), float(sub_vol[i]), skel.pos[i], 0.0)
        )
    return cuts, border, removed_nodes


def merge_cuts(skel: Skeleton, cuts: list[_Cut], dist: float, piece_max_m: float) -> list[_Cut]:
    """Join cuts within ``dist`` of each other when one is a piece (single linkage).

    In a dense crown the level-set skeleton can hang pieces of one removed
    branch on neighbouring kept stems; they then show up as several small cuts
    close together. A piece is a removed part shorter than ``piece_max_m``
    of skeleton. The joined cut keeps the piece nearest the root (cut point,
    diameter) and sums volume and length.
    """
    if len(cuts) < 2:
        return cuts
    pts = np.array([c.point for c in cuts])
    lab = np.arange(len(cuts))
    close = np.linalg.norm(pts[:, None, :] - pts[None, :, :], axis=2) <= dist
    # Only pieces join: two long removed branches next to each other are two cuts.
    small = np.array([c.length < piece_max_m for c in cuts])
    close &= small[:, None] | small[None, :]
    np.fill_diagonal(close, True)
    for _ in range(len(cuts)):
        new = np.array([lab[close[i]].min() for i in range(len(cuts))])
        if np.array_equal(new, lab):
            break
        lab = new
    out = []
    for g in sorted(set(lab.tolist())):
        members = [cuts[i] for i in np.nonzero(lab == g)[0]]
        head = min(members, key=lambda c: (skel.geodesic[c.node], c.node))
        if len(members) == 1:
            out.append(head)
            continue
        n_pts = sum(c.length for c in members)
        out.append(
            _Cut(
                node=head.node,
                frac=float(sum(c.frac * c.length for c in members) / max(n_pts, 1e-9)),
                length=float(sum(c.length for c in members)),
                volume=float(sum(c.volume for c in members)),
                point=head.point,
                blind_m=head.blind_m,
            )
        )
    return out


def _blind_zone(
    skel: Skeleton, i: int, kept_node: np.ndarray, p: PruningParams
) -> tuple[np.ndarray, float]:
    """Cut point and blind length for the removed part rooted at node i.

    Removed wood next to the remaining stem keeps after points (the stem's
    surface) within the tolerance, so the detected removal starts some way out.
    The removed branch's axis is followed back from its first removed node
    until it enters kept wood (a kept node's radius + sigma); that is the cut
    point, and the stretch is added as a cylinder of the node's radius. Without
    kept wood within ``max_blind_m`` the cut stays half way to the parent node.
    """
    ch = skel.children()
    pos = skel.pos
    nxt = i
    for _ in range(3):  # a few nodes ahead give a steadier direction
        if not ch[nxt]:
            break
        nxt = max(ch[nxt], key=lambda c: (skel.geodesic[c], -c))
    u = pos[nxt] - pos[i] if nxt != i else pos[i] - pos[skel.parent[i]]
    nu = float(np.linalg.norm(u))
    fallback = (pos[i] + pos[skel.parent[i]]) / 2
    k = np.nonzero(kept_node)[0]
    k = k[np.linalg.norm(pos[k] - pos[i], axis=1) <= p.max_blind_m + 0.5]
    if nu < 1e-9 or len(k) == 0:
        return fallback, 0.0
    u = u / nu
    t = np.arange(0.0, p.max_blind_m + 1e-9, 0.01)
    q = pos[i][None, :] - t[:, None] * u[None, :]
    gap = np.linalg.norm(q[:, None, :] - pos[k][None, :, :], axis=2) - skel.radius[k][None, :]
    inside = np.nonzero(gap.min(1) <= skel.sigma)[0]
    if len(inside) == 0:
        return fallback, 0.0
    j = int(inside[0])
    return q[j], float(t[j])


def _scaffold_of(skel: Skeleton) -> np.ndarray:
    """Index into skel.scaffold_bases of the scaffold each node belongs to, -1 otherwise."""
    out = np.full(skel.n_nodes, -1, dtype=np.int64)
    ch = skel.children()
    for k, base in enumerate(skel.scaffold_bases):
        todo = [base]
        while todo:
            n = todo.pop()
            out[n] = k
            todo.extend(ch[n])
    return out


def propose_status(
    n_cuts: int, fraction: float, scaffold_share: float, n_border: int, p: PruningParams
) -> tuple[Status, float]:
    """v0 rule (module docstring, step 4) and a heuristic confidence.

    Confidence starts at 0.5 and grows (to 0.9) with the relative distance of the
    deciding quantities from their thresholds; each borderline cut candidate
    takes 0.1 off (at most 0.3), never below 0.3.
    """
    if n_cuts == 0 or fraction < p.partial_min_fraction:
        return "not_done", (0.85 if n_border == 0 else 0.6)
    lower = fraction / p.partial_min_fraction - 1 if p.partial_min_fraction > 0 else 1.0
    spread = scaffold_share / p.done_min_scaffold_share - 1
    amount = max(n_cuts / p.done_min_cuts, fraction / p.done_min_fraction) - 1
    if spread >= 0 and amount >= 0:
        status: Status = "done"
        margin = min(spread, amount)
    else:
        status = "partial"
        margin = min(lower, -min(spread, amount))
    conf = 0.5 + 0.4 * min(1.0, max(0.0, margin)) - 0.1 * min(n_border, 3)
    return status, round(max(0.3, conf), 2)


@dataclass
class TreeResult:
    quality: TreeQuality
    detail: TreePruning
    measurements: list[LidarMeasurement]


def _combined_quality(qb: TreeQuality, qa: TreeQuality) -> TreeQuality:
    """Worst of both scans, except that sectors emptied after the before scan was
    complete may be the pruning itself (a removed scaffold): kept as ok with a note."""
    rank = {"ok": 0, "one_sided": 1, "too_few_points": 2, "no_points": 3}
    notes = [f"before: {qb.status}"] if qb.status != "ok" else []
    notes += [f"after: {qa.status}"] if qa.status != "ok" else []
    if qb.status == "ok" and qa.status == "one_sided":
        qa = qa.model_copy(update={"status": "ok"})
        notes.append("after scan covers fewer sectors (pruning or occlusion)")
    worst = max((qb, qa), key=lambda q: rank[q.status])
    return TreeQuality(
        tree_id=qa.tree_id,
        slot_code=qa.slot_code,
        n_points=qa.n_points,
        sector_coverage=round(min(qb.sector_coverage, qa.sector_coverage), 3),
        status=worst.status,
        notes=notes,
    )


def analyze_tree(
    before: TreeCloud,
    after: TreeCloud,
    p: PruningParams,
    sigma_before: float | None = None,
    sigma_after: float | None = None,
) -> TreeResult:
    sp = p.skeleton
    q = _combined_quality(tree_quality(before, sp), tree_quality(after, sp))
    d = TreePruning(tree_id=after.tree_id, slot_code=after.slot_code)
    if q.status in ("no_points", "too_few_points"):
        return TreeResult(q, d, [])
    try:
        skel = skeletonize(before.points, sp, sigma_before)
    except SkeletonError as e:
        q.notes.append(f"before skeleton failed: {e}")
        d.notes.append(f"before_skeleton_failed: {e}")
        return TreeResult(q, d, [])
    try:
        skel_after = skeletonize(after.points, sp, sigma_after)
        d.wood_volume_after_m3 = _round(skel_after.wood_volume, 6)
    except SkeletonError:
        d.notes.append("after_skeleton_failed")
    d.wood_volume_before_m3 = _round(skel.wood_volume, 6)
    d.scaffold_count_before = len(skel.scaffold_bases)

    # 1. Alignment.
    if p.align:
        yaw, shift, info = align(after.points, before.points, p)
    else:
        yaw, shift = 0.0, np.zeros(3)
        info = Alignment(applied=False, shift_m=(0.0, 0.0, 0.0), yaw_deg=0.0)
    d.alignment = info
    after_pts = transform(after.points, yaw, shift)

    # 2. Removed wood on the before skeleton.
    tol = p.change_tolerance_m
    fine = sp.voxel_m / 2
    gb = voxelize(before.points, fine)
    dist_b, _ = nearest(gb.centroid, downsample(after_pts, fine), tol)
    removed = ~np.isfinite(dist_b)[gb.point_voxel]
    cuts, border, removed_nodes = find_cuts(skel, removed, p)
    cuts = merge_cuts(skel, cuts, p.merge_cut_distance_m, p.merge_piece_max_m)
    n_parts, big = _parts(before.points[removed], sp.voxel_m, p.min_part_voxels)
    d.removed_parts = n_parts
    rem_pts = int(big.sum())
    if rem_pts:
        on_removed_node = removed_nodes[np.maximum(skel.point_node, 0)] & (skel.point_node >= 0)
        matched = int((on_removed_node[removed][big]).sum())
        d.removed_unmatched_share = round(1 - matched / rem_pts, 3)

    # 3. Growth (ignored for pruning).
    ga = voxelize(after_pts, fine)
    dist_a, _ = nearest(ga.centroid, gb.centroid, tol)
    grown = ~np.isfinite(dist_a)[ga.point_voxel]
    g_parts, g_big = _parts(after_pts[grown], sp.voxel_m, p.min_part_voxels)
    d.growth_parts = g_parts
    d.growth_points = int(g_big.sum())
    if g_parts:
        d.notes.append("growth_or_new_object")

    scaffold_of = _scaffold_of(skel)
    for c in sorted(cuts, key=lambda c: c.node):
        mid = c.point
        sc = int(scaffold_of[c.node])
        d.cuts.append(
            PruningCut(
                node=c.node,
                xyz=(round(float(mid[0]), 3), round(float(mid[1]), 3), round(float(mid[2]), 3)),
                diameter_m=round(2 * float(skel.radius[c.node]), 4),
                removed_volume_m3=round(c.volume, 6),
                removed_length_m=round(c.length, 3),
                order=int(skel.order[c.node]),
                scaffold=sc if sc >= 0 else None,
                removed_share=round(c.frac, 3),
            )
        )
    vol = float(sum(c.volume for c in cuts))
    v_before = skel.wood_volume
    border_vol = float(sum(c.volume for c in border))
    unc = math.sqrt(
        (p.pruned_volume_rel_uncertainty * vol) ** 2
        + border_vol**2
        + p.pruned_volume_detection_m3**2
    )
    frac = vol / v_before if v_before > 0 else 0.0
    frac_unc = unc / v_before if v_before > 0 else 0.0
    touched = {int(scaffold_of[c.node]) for c in cuts if scaffold_of[c.node] >= 0}
    # A cut below the scaffold bases (on the trunk top) touches every scaffold above it.
    for c in cuts:
        if scaffold_of[c.node] < 0:
            sub = set(skel.subtree(c.node))
            touched |= {k for k, b in enumerate(skel.scaffold_bases) if b in sub}
    n_sc = len(skel.scaffold_bases)
    share = len(touched) / n_sc if n_sc else (1.0 if cuts else 0.0)
    d.scaffolds_with_cuts = len(touched)
    d.pruned_volume_m3 = round(vol, 6)
    d.pruned_volume_uncertainty_m3 = round(unc, 6)
    d.pruned_fraction = round(frac, 4)
    d.pruned_fraction_uncertainty = round(frac_unc, 4)
    status, conf = propose_status(len(cuts), frac, share, len(border), p)
    if not info.applied and p.align:
        conf = round(conf * 0.8, 2)
        d.notes.append("alignment_not_refined")
    if any(n.startswith("after scan covers fewer") for n in q.notes):
        conf = round(conf * 0.8, 2)
    d.status, d.confidence = status, conf

    ms: list[LidarMeasurement] = []
    if q.status == "ok":
        common = dict(
            tree_id=after.tree_id,
            slot_code=after.slot_code,
            method=METHOD,
            method_version=METHOD_VERSION,
        )
        ms = [
            LidarMeasurement(
                metric="pruned_wood_volume",
                value_numeric=round(vol, 6),
                unit="m3",
                uncertainty=round(unc, 6),
                **common,
            ),
            LidarMeasurement(
                metric="pruned_wood_fraction",
                value_numeric=round(frac, 4),
                unit="ratio",
                uncertainty=round(frac_unc, 4),
                **common,
            ),
            LidarMeasurement(
                metric="pruning_cut_count",
                value_numeric=float(len(cuts)),
                unit="count",
                uncertainty=round(math.sqrt(0.25 + len(border)), 2),
                **common,
            ),
            LidarMeasurement(
                metric="pruning_status", value_category=status, confidence=conf, **common
            ),
        ]
    return TreeResult(q, d, ms)


def producer(p: PruningParams) -> Producer:
    return Producer(
        pipeline=PIPELINE_NAME, version=__version__, params_hash=p.params_hash(), stage=STAGE
    )


def make_report(
    meta_before: CloudMeta,
    meta_after: CloudMeta,
    before: list[TreeCloud],
    after: list[TreeCloud],
    p: PruningParams,
    workers: int = 1,
) -> PruningReport:
    """The stage's report; workers > 1 compares the trees in parallel (same result)."""
    warnings: list[str] = []
    if meta_before.parcel_id != meta_after.parcel_id:
        warnings.append(
            f"parcel mismatch: before {meta_before.parcel_id}, after {meta_after.parcel_id}"
        )
    if meta_before.session_id == meta_after.session_id:
        warnings.append("before and after are the same session")
    by_id = {t.tree_id: t for t in before}
    jobs = [
        (by_id[a.tree_id], a, p, meta_before.point_sigma_m, meta_after.point_sigma_m)
        for a in after
        if a.tree_id in by_id
    ]
    results = map_trees(analyze_tree, jobs, workers)
    rejected = sum(
        1 for r in results if r.detail.alignment is not None and not r.detail.alignment.applied
    )
    if p.align and rejected:
        warnings.append(f"alignment refinement rejected for {rejected} tree(s)")
    return PruningReport(
        producer=producer(p),
        method=METHOD,
        method_version=METHOD_VERSION,
        session_id=meta_after.session_id,
        parcel_id=meta_after.parcel_id,
        before_session_id=meta_before.session_id,
        trees=[r.quality for r in results],
        measurements=[m for r in results for m in r.measurements],
        params=p,
        cloud_before=cloud_ref(meta_before),
        cloud_after=cloud_ref(meta_after),
        warnings=warnings,
        details=[r.detail for r in results],
    )


def run(
    before_dir: Path,
    after_dir: Path,
    trees_path: Path,
    out_dir: Path,
    params_path: Path | None = None,
) -> PruningReport:
    p = load_params(params_path)
    positions = load_tree_positions(Path(trees_path))
    cb = load_session_cloud(Path(before_dir))
    ca = load_session_cloud(Path(after_dir))
    r = p.skeleton.tree_radius_m
    tb = extract_trees(cb, positions, radius_m=r)
    ta = extract_trees(ca, positions, radius_m=r)
    report = make_report(cb.meta, ca.meta, tb, ta, p)
    write_model(report, Path(out_dir) / REPORT_FILE)
    return report


def summary_line(report: PruningReport) -> str:
    counts: dict[str, int] = {}
    for m in report.measurements:
        if m.metric == "pruning_status" and m.value_category:
            counts[m.value_category] = counts.get(m.value_category, 0) + 1
    vol = sum(
        m.value_numeric or 0.0 for m in report.measurements if m.metric == "pruned_wood_volume"
    )
    cuts = sum(
        int(m.value_numeric or 0) for m in report.measurements if m.metric == "pruning_cut_count"
    )
    measured = sum(1 for t in report.trees if t.status == "ok")
    status = ", ".join(f"{k} {counts[k]}" for k in ("done", "partial", "not_done") if k in counts)
    line = (
        f"lidar pruning: {measured}/{len(report.trees)} trees compared ({status or '-'}), "
        f"{cuts} cuts, removed wood {vol:.3f} m3"
    )
    if report.warnings:
        line += f"; warnings: {'; '.join(report.warnings)}"
    return line
