"""Stage – coverage: was every active tree seen well enough on this visit?

Quality gate of docs/metodoloji.md, section 10: every active tree is seen from at
least two sides; the parcel passes when a share of its trees (0.95) is covered.

A view is sufficient when its crop score is at least `min_view_score`. The views
are the crop stage's candidate views (crops.candidate_views: same distance range,
geometry and score), so an inventory scan, which gets no crops, is measured the
same way once its trees have positions. A tree is covered when its sufficient
views come from at least `min_directions` sides (N, E, S, W: where the camera
stood) and two of them are at least `min_view_spread_deg` apart (opposite faces):
the oblique views from a single aisle (a tree 45 degrees off seen from the south
aisle is an "E" crop) never count as the other side of the tree.

Blind spots: uncovered trees grouped in the 10 x 10 m cells of docs/arayuzler.md
("Yakın plan listesi ve uzman istekleri"): east/north metres from the south-west
corner of the bounding box of the parcel's newest boundary (else of the trees),
x = dlon * R * cos(south), y = dlat * R, R = 6 371 008.8 m, cell = floor(x / 10),
floor(y / 10). A cell is a blind spot when it has at least `blind_spot_min_trees`
uncovered trees making at least `blind_spot_min_share` of its trees.
"""

from __future__ import annotations

import math

import numpy as np

from .context import RunContext
from .crops import DIRECTIONS, candidate_views
from .geo import LocalFrame
from .models import (
    CoverageCell,
    CoverageFrame,
    CoverageReport,
    CoverageSummary,
    DirectionCoverage,
    Manifest,
    PanoramaSet,
    TreeCoverage,
    TreeList,
    write_model,
)
from .params import CoverageParams, CropParams

EARTH_R = 6371008.8  # mean radius, as closeup_list() in the database


def cell_frame(tlist: TreeList, cell_m: float) -> CoverageFrame | None:
    if tlist.boundary_bbox is not None:
        west, south, _, _ = tlist.boundary_bbox
        return CoverageFrame(source="boundary", west=west, south=south, cell_m=cell_m)
    if not tlist.trees:
        return None
    return CoverageFrame(
        source="trees",
        west=min(t.lon for t in tlist.trees),
        south=min(t.lat for t in tlist.trees),
        cell_m=cell_m,
    )


def cell_of(lat: float, lon: float, frame: CoverageFrame) -> tuple[int, int]:
    x = math.radians(lon - frame.west) * EARTH_R * math.cos(math.radians(frame.south))
    y = math.radians(lat - frame.south) * EARTH_R
    return math.floor(x / frame.cell_m), math.floor(y / frame.cell_m)


def cell_corners(cell: tuple[int, int], frame: CoverageFrame) -> dict[str, float]:
    """South, west, north, east of a cell (inverse of cell_of)."""
    k_lon = EARTH_R * math.cos(math.radians(frame.south))
    cx, cy = cell
    return {
        "south": frame.south + math.degrees(cy * frame.cell_m / EARTH_R),
        "west": frame.west + math.degrees(cx * frame.cell_m / k_lon),
        "north": frame.south + math.degrees((cy + 1) * frame.cell_m / EARTH_R),
        "east": frame.west + math.degrees((cx + 1) * frame.cell_m / k_lon),
    }


def view_spread(bearings: list[float]) -> float | None:
    """Largest angle between two of the bearings (0-180); None for fewer than two."""
    if len(bearings) < 2:
        return None
    b = np.radians(np.asarray(bearings, dtype=float))
    # Angle between unit vectors, all pairs.
    cos = np.clip(np.cos(b[:, None] - b[None, :]), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos.min())))


def rule_of(p: CoverageParams) -> dict:
    """The rule a report was made with (also in params.json / the params hash)."""
    return p.model_dump(mode="json")


def compute_coverage(
    tlist: TreeList,
    pset: PanoramaSet,
    camera_height_m: float,
    crop_params: CropParams,
    p: CoverageParams,
) -> tuple[list[TreeCoverage], CoverageSummary, list[CoverageCell], CoverageFrame] | None:
    """Per-tree coverage, parcel summary and cells; None without tree positions."""
    frame = cell_frame(tlist, p.cell_m)
    if frame is None or not tlist.trees:
        return None

    best: dict[tuple[str, str], tuple[float, float]] = {}  # (tree, side) -> score, distance
    bearings: dict[str, list[float]] = {}  # sufficient views, tree -> camera
    nearest: dict[str, float] = {}
    for tree, _pano, g, score in candidate_views(
        tlist.trees, pset.panoramas, camera_height_m, crop_params
    ):
        key = (tree.tree_id, g["direction"])
        if key not in best or score > best[key][0]:
            best[key] = (score, g["distance_m"])
        if score >= p.min_view_score:
            bearings.setdefault(tree.tree_id, []).append(g["bearing_from_tree_deg"])
        nearest[tree.tree_id] = min(nearest.get(tree.tree_id, math.inf), g["distance_m"])

    # Panoramas beyond the crop range still tell how close the scan came.
    if pset.panoramas:
        lf = LocalFrame(pset.panoramas[0].pose.lat, pset.panoramas[0].pose.lon)
        pe, pn = lf.to_en(
            [q.pose.lat for q in pset.panoramas], [q.pose.lon for q in pset.panoramas]
        )
        for tree in tlist.trees:
            if tree.tree_id not in nearest:
                te, tn = lf.to_en(tree.lat, tree.lon)
                d = float(min(math.hypot(e - te, n - tn) for e, n in zip(pe, pn, strict=True)))
                nearest[tree.tree_id] = d

    trees: list[TreeCoverage] = []
    for tree in tlist.trees:
        dirs = []
        for d in DIRECTIONS:
            if (tree.tree_id, d) not in best:
                continue
            score, dist = best[(tree.tree_id, d)]
            dirs.append(
                DirectionCoverage(
                    direction=d,
                    crop_score=round(score, 4),
                    crop_distance_m=round(dist, 3),
                    sufficient=score >= p.min_view_score,
                )
            )
        sufficient = [d.direction for d in dirs if d.sufficient]
        spread = view_spread(bearings.get(tree.tree_id, []))
        near = nearest.get(tree.tree_id)
        trees.append(
            TreeCoverage(
                tree_id=tree.tree_id,
                slot_code=tree.slot_code,
                lat=tree.lat,
                lon=tree.lon,
                directions=dirs,
                crop_directions=[d.direction for d in dirs],
                sufficient_directions=sufficient,
                best_crop_score=max((d.crop_score for d in dirs), default=None),
                view_spread_deg=None if spread is None else round(spread, 1),
                nearest_panorama_m=None if near is None else round(near, 3),
                covered=len(sufficient) >= p.min_directions
                and spread is not None
                and spread >= p.min_view_spread_deg,
                cell=cell_of(tree.lat, tree.lon, frame),
            )
        )

    by_cell: dict[tuple[int, int], list[TreeCoverage]] = {}
    for t in trees:
        by_cell.setdefault(t.cell, []).append(t)
    cells = []
    for cell in sorted(by_cell):
        members = by_cell[cell]
        missing = [t.slot_code for t in members if not t.covered]
        if not missing:
            continue
        blind = (
            len(missing) >= p.blind_spot_min_trees
            and len(missing) / len(members) >= p.blind_spot_min_share
        )
        cells.append(
            CoverageCell(
                cell=cell,
                trees=len(members),
                uncovered=len(missing),
                uncovered_slot_codes=missing,
                blind_spot=blind,
                **cell_corners(cell, frame),
            )
        )

    covered = sum(t.covered for t in trees)
    ratio = covered / len(trees)
    blind_spots = sum(c.blind_spot for c in cells)
    passed = ratio >= p.parcel_threshold
    summary = CoverageSummary(
        active_trees=len(trees),
        covered_trees=covered,
        ratio=round(ratio, 4),
        threshold=p.parcel_threshold,
        passed=passed,
        missing_trees=len(trees) - covered,
        blind_spots=blind_spots,
        rescan_needed=not passed or blind_spots > 0,
    )
    return trees, summary, cells, frame


def make_report(
    ctx: RunContext, manifest: Manifest, pset: PanoramaSet, tlist: TreeList
) -> CoverageReport:
    common = {
        "producer": ctx.producer("coverage"),
        "session_id": manifest.session.session_id,
        "parcel_id": manifest.session.parcel_id,
        "session_kind": tlist.session_kind or manifest.session.kind,
        "trees_source": tlist.source,
        "rule": rule_of(ctx.params.coverage),
        "unlocated_slots": tlist.unlocated_slots,
    }
    res = compute_coverage(
        tlist, pset, manifest.session.camera_height_m, ctx.params.crops, ctx.params.coverage
    )
    if res is None:
        return CoverageReport(status="no_tree_positions", **common)
    trees, summary, cells, frame = res
    return CoverageReport(
        status="ok", summary=summary, frame=frame, trees=trees, cells=cells, **common
    )


def run(ctx: RunContext, manifest: Manifest, pset: PanoramaSet, tlist: TreeList) -> CoverageReport:
    if tlist.parcel_id is not None and tlist.parcel_id != manifest.session.parcel_id:
        raise ValueError(
            f"tree list is for parcel {tlist.parcel_id}, the session's parcel is "
            f"{manifest.session.parcel_id}"
        )
    report = make_report(ctx, manifest, pset, tlist)
    write_model(report, ctx.coverage_path)
    return report
