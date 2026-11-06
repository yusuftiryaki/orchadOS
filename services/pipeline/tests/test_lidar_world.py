"""lidar world: the 3D world cloud (docs/arayuzler.md, "3D dünya bulutu"), synthetic data only."""

from __future__ import annotations

import json

import cv2
import numpy as np
import pytest

from orchados_pipeline.cli import main
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar.cloud import (
    CloudError,
    RegisteredCloud,
    TreePosition,
    extract_trees,
)
from orchados_pipeline.lidar.models import CloudMeta
from orchados_pipeline.lidar.synthetic import make_plot, write_plot_session
from orchados_pipeline.lidar.world import (
    MAGIC,
    NO_TREE,
    SCHEMA,
    View,
    WorldParams,
    build_world,
    encode_world,
    quantize,
    read_world,
    remove_carrier,
    sample_bilinear,
)
from orchados_pipeline.models import FileRef, PanoramaRecord, PanoramaSet, Pose, Producer

ORIGIN = (37.1, 37.5, 850.0)


def meta(**kw) -> CloudMeta:
    base = dict(
        session_id="00000000-0000-4000-8000-0000000000a1",
        parcel_id="00000000-0000-4000-8000-0000000000b1",
        origin_lat=ORIGIN[0],
        origin_lon=ORIGIN[1],
        origin_height_m=ORIGIN[2],
        gps_time_start_ns=1_446_000_000_000_000_000,
        gps_time_end_ns=1_446_000_600_000_000_000,
        registration_method="synthetic",
        registration_version="1",
    )
    return CloudMeta(**{**base, **kw})


def plane(center, normal_axis: int, size: float, step: float) -> np.ndarray:
    """A square of points at center, perpendicular to an axis."""
    g = np.arange(-size / 2, size / 2 + 1e-9, step)
    a, b = np.meshgrid(g, g)
    pts = np.zeros((a.size, 3))
    other = [k for k in range(3) if k != normal_axis]
    pts[:, other[0]] = a.ravel()
    pts[:, other[1]] = b.ravel()
    return pts + np.asarray(center, dtype=float)


def solid(color, w=256, h=128) -> np.ndarray:
    img = np.zeros((h, w, 3), np.uint8)
    img[:] = color
    return img


@pytest.fixture(scope="module")
def plot():
    return make_plot([["productive", "young"], ["", "old"]], np.random.default_rng(3), leafy=True)


# --- format -------------------------------------------------------------------------------


def test_round_trip_and_layout(plot):
    p = WorldParams(voxel_m=0.1)
    world = build_world(plot.points, plot.meta, plot.positions, [], p)
    data = encode_world(world)
    assert data[:4] == MAGIC
    hlen = int.from_bytes(data[4:8], "little")
    header = json.loads(data[8 : 8 + hlen])
    assert header["schema"] == SCHEMA and header["point_count"] == len(world.position)
    arrays = header["arrays"]
    assert [arrays[k]["type"] for k in ("position", "color", "tree")] == [
        "uint16",
        "uint8",
        "uint16",
    ]
    assert all(a["offset"] % 4 == 0 for a in arrays.values())
    assert arrays["position"]["offset"] >= 8 + hlen
    assert set(data[8 + hlen : arrays["position"]["offset"]]) <= {0}
    n = header["point_count"]
    assert len(data) == arrays["tree"]["offset"] + 2 * n

    back = read_world(data)
    assert np.array_equal(back.quantized, world.position)
    assert np.array_equal(back.color, world.color) and np.array_equal(back.tree, world.tree)
    assert back.header["colorized"] is False
    assert back.header["trees"] == [
        {"index": i, "tree_id": t.tree_id} for i, t in enumerate(plot.positions)
    ]
    for key in ("origin_lat", "origin_lon", "origin_height_m"):
        assert back.header[key] == getattr(plot.meta, key)
    assert back.header["method"] == "lidar_world" and back.header["method_version"] == "0.1.0"
    assert back.header["params_hash"] == p.params_hash()


def test_no_time_fields_in_the_header(plot):
    """H05: no capture time, no trajectory, no frame order."""
    world = build_world(plot.points, meta(), plot.positions, [], WorldParams(voxel_m=0.2))
    text = json.dumps(read_world(encode_world(world)).header).lower()
    for word in ("time", "gps", "utc", "trajectory", "frame", "start", "end_", "camera"):
        assert word not in text, word


def test_same_input_same_bytes(plot):
    p = WorldParams(voxel_m=0.08)
    a = encode_world(build_world(plot.points, plot.meta, plot.positions, [], p))
    b = encode_world(build_world(plot.points.copy(), plot.meta, plot.positions, [], p))
    assert a == b


def test_quantization_error_below_a_millimetre():
    rng = np.random.default_rng(1)
    pts = rng.uniform([0, 0, 0], [100, 80, 12], (50_000, 3))
    q, lo, scale = quantize(pts)
    back = np.array(lo) + q.astype(np.float64) * np.array(scale)
    assert np.abs(back - pts).max() < 1e-3
    # Through the file (no thinning): the points in the stage's fixed-seed shuffle.
    p = WorldParams(voxel_m=0.0, carrier_radius_m=0)
    world = build_world(pts, meta(), [], [], p)
    read = read_world(encode_world(world)).position
    perm = np.random.default_rng(p.seed + 1).permutation(len(pts))
    assert np.abs(read - pts[perm]).max() < 1e-3


def test_order_is_shuffled_and_a_prefix_is_uniform(plot):
    world = build_world(plot.points, plot.meta, plot.positions, [], WorldParams(voxel_m=0.05))
    pos = read_world(encode_world(world)).position
    head = pos[: len(pos) // 10]
    # A prefix spans the whole cloud, not one corner.
    assert np.allclose(head.min(0)[:2], pos.min(0)[:2], atol=0.5)
    assert np.allclose(head.max(0)[:2], pos.max(0)[:2], atol=0.5)
    assert np.mean(head[:, 2]) == pytest.approx(np.mean(pos[:, 2]), abs=0.15)


def test_voxel_and_max_points(plot):
    full = build_world(plot.points, plot.meta, plot.positions, [], WorldParams(voxel_m=0.1))
    capped = build_world(
        plot.points, plot.meta, plot.positions, [], WorldParams(voxel_m=0.1, max_points=5000)
    )
    assert len(full.position) < len(plot.points)
    assert len(capped.position) == 5000
    assert full.header["voxel_m"] == 0.1


# --- carrier and trees --------------------------------------------------------------------


def test_carrier_is_removed_and_the_ground_under_it_kept():
    ground = plane((0, 0, 0), 2, 6.0, 0.05)
    person = plane((0.3, 0, 1.0), 0, 1.6, 0.05)  # vertical sheet next to the camera
    person = person[person[:, 2] > 0.2]
    crown = plane((0.5, 0, 2.6), 2, 1.0, 0.05)  # above the camera: kept
    pts = np.vstack([ground, person, crown])
    cams = np.array([[0.0, 0.0, 2.0]])
    keep = remove_carrier(pts, cams, WorldParams())
    n_g, n_p = len(ground), len(person)
    assert keep[:n_g].all()
    assert not keep[n_g : n_g + n_p].any()
    assert keep[n_g + n_p :].all()


def test_tree_index_follows_extract_trees(plot):
    p = WorldParams(voxel_m=0.0, carrier_radius_m=0)
    world = build_world(plot.points, plot.meta, plot.positions, [], p)
    back = read_world(encode_world(world))
    # Every tree point of the file is in that tree's extract_trees() cloud and vice versa.
    tcs = extract_trees(RegisteredCloud(plot.points, plot.meta), plot.positions)
    for i, tc in enumerate(tcs):
        mine = back.position[back.tree == i]
        assert len(mine) == len(tc.points)
        assert mine[:, 2].min() > tc.ground_z + 0.2
    ground = back.position[back.tree == NO_TREE]
    assert len(ground) > 0 and np.median(ground[:, 2]) < 0.5


# --- colour -------------------------------------------------------------------------------


def test_sample_follows_the_panorama_convention():
    """Centre column looks along the heading, azimuth grows to the right, top row zenith."""
    W, H = 360, 180
    img = np.zeros((H, W, 3), np.uint8)
    img[:, :, 0] = (np.arange(W) * 255 // (W - 1)).astype(np.uint8)[None, :]
    img[:, :, 1] = (np.arange(H) * 255 // (H - 1)).astype(np.uint8)[:, None]
    from orchados_pipeline.lidar.world import _directions

    cam = np.zeros(3)
    pts = np.array([[0.0, 10.0, 0.0], [10.0, 0.0, 0.0], [0.0, 0.0, 10.0]])  # N, E, up
    _d, u, v, _el = _directions(pts, cam, heading_deg=0.0)
    rgb = sample_bilinear(img, u, v)
    assert abs(int(rgb[0, 0]) - 128) <= 2 and abs(int(rgb[0, 1]) - 128) <= 2  # centre
    assert abs(int(rgb[1, 0]) - 191) <= 2  # east: three quarters across
    assert rgb[2, 1] <= 1  # zenith: top row
    _d, u, _v, _el = _directions(pts[:1], cam, heading_deg=90.0)
    assert u[0] == pytest.approx(0.25)  # north seen from a camera facing east: left


def scene():
    """A target behind a wall from camera A, in the open from camera B (farther away)."""
    ground = plane((10, 5, 0), 2, 30.0, 0.1)
    wall = plane((5, 0, 1.5), 0, 3.0, 0.04)
    target = plane((10, 0, 1.5), 0, 1.0, 0.04)
    pts = np.vstack([ground, wall, target])
    a = View(np.array([0.0, 0.0, 1.5]), 90.0, lambda: solid((255, 0, 0)))
    b = View(np.array([22.0, 6.0, 1.5]), 240.0, lambda: solid((0, 255, 0)))
    return pts, (len(ground), len(wall), len(target)), a, b


def test_an_occluded_point_takes_the_colour_of_the_panorama_that_sees_it():
    pts, _n, a, b = scene()
    p = WorldParams(voxel_m=0.0, carrier_radius_m=0)
    world = build_world(pts, meta(), [], [a, b], p)
    back = read_world(encode_world(world))
    assert back.header["colorized"] is True
    pos, col = back.position, back.color
    target = (np.abs(pos[:, 0] - 10) < 0.01) & (np.abs(pos[:, 1]) < 0.6) & (pos[:, 2] > 0.9)
    wall = (np.abs(pos[:, 0] - 5) < 0.01) & (pos[:, 2] > 0.1)
    assert target.sum() > 400 and wall.sum() > 4000
    # The wall faces A (nearest): red. The target is hidden from A: green from B.
    assert (col[wall] == [255, 0, 0]).all(axis=1).mean() > 0.95
    assert (col[target] == [0, 255, 0]).all(axis=1).mean() > 0.95


def test_without_the_wall_the_nearest_panorama_colours():
    pts, (n_g, n_w, _n_t), a, b = scene()
    pts = np.vstack([pts[:n_g], pts[n_g + n_w :]])
    world = build_world(pts, meta(), [], [a, b], WorldParams(voxel_m=0.0, carrier_radius_m=0))
    back = read_world(encode_world(world))
    pos, col = back.position, back.color
    target = (np.abs(pos[:, 0] - 10) < 0.01) & (pos[:, 2] > 0.9)
    assert (col[target] == [255, 0, 0]).all(axis=1).mean() > 0.95


def test_unseen_points_take_the_nearest_coloured_colour():
    pts, _n, a, _b = scene()
    world = build_world(pts, meta(), [], [a], WorldParams(voxel_m=0.0, carrier_radius_m=0))
    back = read_world(encode_world(world))
    # The target is seen by nobody: it is filled, not left black.
    target = (np.abs(back.position[:, 0] - 10) < 0.01) & (back.position[:, 2] > 0.9)
    assert (back.color[target].sum(1) > 0).all()


def test_no_panorama_far_enough_is_used():
    pts, _n, a, _b = scene()
    far = View(np.array([500.0, 0.0, 1.5]), 0.0, lambda: pytest.fail("image loaded"))
    world = build_world(pts, meta(), [], [far], WorldParams(voxel_m=0.1))
    assert world.header["colorized"] is False


# --- the command --------------------------------------------------------------------------


def write_panoramas(run, m: CloudMeta, cams: list[tuple[float, float, float, float]], color):
    """A run folder with panoramas.json and equirect images at (e, n, up, heading)."""
    frame = LocalFrame(m.origin_lat, m.origin_lon)
    recs = []
    prod = Producer(pipeline="t", version="0", params_hash="h", stage="panoramas")
    (run / "panoramas").mkdir(parents=True)
    for k, (e, n, up, heading) in enumerate(cams):
        name = f"panoramas/pano-{k}_2k.jpg"
        cv2.imwrite(str(run / name), solid(color)[:, :, ::-1])
        lat, lon = frame.to_latlon(e, n)
        ref = FileRef(path=name, sha256="0" * 64, size=1, media_type="image/jpeg")
        recs.append(
            PanoramaRecord(
                panorama_id=f"pano-{k}",
                session_id=m.session_id,
                gps_time_ns=k,
                utc="2026-07-14T05:00:00Z",
                pose=Pose(
                    lat=float(lat),
                    lon=float(lon),
                    height_m=m.origin_height_m + up,
                    heading_deg=heading,
                    sd_h_m=0.02,
                    quality="fix",
                ),
                quality_score=0.9,
                sharpness=100,
                source_video="v.mp4",
                source_video_sha256="0" * 64,
                frame_index=k,
                camera_s=k,
                image=FileRef(
                    path=f"panoramas/pano-{k}_4k.webp",
                    sha256="1" * 64,
                    size=1,
                    media_type="image/webp",
                ),
                preview=ref,
                producer=prod,
            )
        )
    (run / "panoramas.json").write_text(
        PanoramaSet(producer=prod, panoramas=recs, sidecars=[]).model_dump_json(by_alias=True)
    )


def test_command_colours_from_the_run(tmp_path, capsys):
    plot = make_plot([["productive"]], np.random.default_rng(5), leafy=True)
    session = write_plot_session(tmp_path / "s", plot)
    run = tmp_path / "s.processed" / "v0.1.0_abc"
    write_panoramas(run, plot.meta, [(0.0, 4.0, 2.0, 90.0), (0.0, -4.0, 2.0, 270.0)], (10, 200, 30))
    params = tmp_path / "params.json"
    params.write_text(json.dumps({"voxel_m": 0.1}))
    assert main(["lidar", "world", str(session), "--params", str(params)]) == 0
    assert "coloured from 2/2 panoramas" in capsys.readouterr().out
    out = tmp_path / "s.processed" / "lidar"
    side = json.loads((out / "world.json").read_text())
    data = (out / "world.owc").read_bytes()
    assert side["byte_size"] == len(data) and side["header"]["colorized"] is True
    back = read_world(data)
    assert side["header"] == back.header
    assert (back.color == [10, 200, 30]).all(axis=1).mean() > 0.9
    # A panorama of another session is refused.
    other = tmp_path / "other"
    other_meta = meta(session_id="00000000-0000-4000-8000-0000000000ff")
    write_panoramas(other, other_meta, [(0, 0, 2, 0)], (0, 0, 0))
    assert main(["lidar", "world", str(session), "--panoramas", str(other)]) != 0
    assert "is of session" in capsys.readouterr().err


def test_camera_height_from_the_ground_when_given():
    ground = plane((0, 0, 3.0), 2, 10.0, 0.1)  # ground 3 m above the origin height
    m = meta()
    cam = View(np.array([0.0, 0.0, 0.0]), 0.0, lambda: solid((1, 2, 3)))
    p = WorldParams(voxel_m=0.0, camera_height_m=2.0, min_elevation_deg=-89)
    world = build_world(ground, m, [], [cam], p)
    # With the pose height (0, below the ground) nothing would be seen.
    assert world.stats["seen_points"] > 0
    assert world.header["colorized"] is True


def test_tree_array_maps_to_header_trees():
    plot = make_plot([["productive", "young"]], np.random.default_rng(9), leafy=True)
    trees = [TreePosition(t.tree_id, t.slot_code, t.lat, t.lon) for t in plot.positions]
    world = build_world(plot.points, plot.meta, trees, [], WorldParams(voxel_m=0.1))
    back = read_world(encode_world(world))
    ids = {t["index"]: t["tree_id"] for t in back.header["trees"]}
    frame = LocalFrame(plot.meta.origin_lat, plot.meta.origin_lon)
    for idx, tid in ids.items():
        e0, n0 = (float(x) for x in frame.to_en(trees[idx].lat, trees[idx].lon))
        mine = back.position[back.tree == idx]
        assert tid == trees[idx].tree_id and len(mine) > 100
        assert np.hypot(mine[:, 0].mean() - e0, mine[:, 1].mean() - n0) < 0.6


# --- wood: winter skeleton and pruning (Faz 2b) -------------------------------------------

AFTER_ID = "00000000-0000-4000-8000-0000000000a2"
# The after scan sits a little off the before scan (registration drift): the pruning
# stage's alignment takes it back, the world file must undo that again.
DRIFT = np.array([0.05, -0.03, 0.015])


@pytest.fixture(scope="module")
def winter():
    """Two winter scans of the same trees, the second after three order-2 cuts per
    tree and with a drift; the real skeleton and pruning stages on both."""
    from orchados_pipeline.lidar import pruning, skeleton
    from orchados_pipeline.lidar.synthetic import prune

    rng = np.random.default_rng(4)
    before = make_plot([["productive", "old"]], rng, leafy=False)
    cut = {tid: prune(t, rng, n_cuts=3, orders=(2,)) for tid, t in before.trees.items()}
    after = make_plot(
        [["productive", "old"]],
        rng,
        leafy=False,
        trees_override=cut,
        session_id=AFTER_ID,
        parcel_id=before.meta.parcel_id,
    )
    after.points = after.points + DRIFT
    trees = before.positions  # one inventory for both scans
    tb = extract_trees(RegisteredCloud(before.points, before.meta), trees)
    ta = extract_trees(RegisteredCloud(after.points, after.meta), trees)
    sp = skeleton.SkeletonParams()
    sk_before = skeleton.make_report(before.meta, tb, sp)
    sk_after = skeleton.make_report(after.meta, ta, sp)
    report = pruning.make_report(before.meta, after.meta, tb, ta, pruning.PruningParams())
    return before, after, cut, trees, sk_before, sk_after, report


def _wood_world(winter, voxel=0.1):
    from orchados_pipeline.lidar.world import wood_from_reports

    _before, after, _cut, trees, sk_before, sk_after, report = winter
    wood = wood_from_reports(sk_after, trees, report, sk_before)
    world = build_world(after.points, after.meta, trees, [], WorldParams(voxel_m=voxel), wood=wood)
    return wood, world, encode_world(world)


def _nearest(query: np.ndarray, target: np.ndarray) -> np.ndarray:
    from orchados_pipeline.lidar.pruning import nearest

    d, _ = nearest(query, target, 0.5)
    return d


def test_wood_round_trip_and_layout(winter):
    from orchados_pipeline.lidar.world import CUT_ARRAYS, POINT_ARRAYS, SEGMENT_ARRAYS

    wood, world, data = _wood_world(winter)
    back = read_world(data)
    h = back.header
    assert h["segment_count"] == len(wood.a) > 100 and h["cut_count"] == len(wood.cut_position) > 0
    assert set(np.unique(back.segment_kind)) == {0, 1}
    # Arrays in the contract's order, 4-byte aligned, after the points and to the end.
    names = [a[0] for a in (*POINT_ARRAYS, *SEGMENT_ARRAYS, *CUT_ARRAYS)]
    offsets = [h["arrays"][n]["offset"] for n in names]
    assert offsets == sorted(offsets) and all(o % 4 == 0 for o in offsets)
    counts = {"segment": h["segment_count"], "cut": h["cut_count"]}
    for (name, typ, comp, nbytes), nxt in zip(
        (*SEGMENT_ARRAYS, *CUT_ARRAYS), [*names[4:], None], strict=True
    ):
        spec = h["arrays"][name]
        assert (spec["type"], spec["components"]) == (typ, comp)
        end = spec["offset"] + counts[name.split("_")[0]] * nbytes
        if nxt is None:
            assert end == len(data)  # the last array ends the file
        else:
            gap = h["arrays"][nxt]["offset"] - end
            assert 0 <= gap < 4 and set(data[end : end + gap]) <= {0}
    seg_start = h["arrays"]["segment_a"]["offset"]
    assert seg_start >= h["arrays"]["tree"]["offset"] + 2 * h["point_count"]
    # Values: positions within the quantisation step, radii and diameters in mm.
    step = np.array(h["quantization"]["scale"])
    assert np.all(np.abs(back.segment_a - wood.a) <= step)
    assert np.all(np.abs(back.cut_position - wood.cut_position) <= step)
    assert np.array_equal(back.segment_radius, np.rint(wood.radius_m * 1000).astype(np.uint16))
    assert np.array_equal(back.cut_diameter, np.rint(wood.cut_diameter_m * 1000))
    assert np.array_equal(back.segment_tree, wood.tree) and np.array_equal(
        back.cut_tree, wood.cut_tree
    )
    assert (np.linalg.norm(back.segment_a - back.segment_b, axis=1) >= 0.005 - 2 * step.max()).all()
    sk, pr = h["skeleton"], h["skeleton"]["pruning"]
    assert (sk["method"], sk["method_version"]) == ("lidar_qsm", "0.1.0")
    assert sk["params_hash"] == winter[5].producer.params_hash
    assert pr["method"] == "lidar_pruning" and pr["before_session_id"] == winter[0].meta.session_id
    assert pr["params_hash"] == winter[6].producer.params_hash
    # The bounding box covers the wood too.
    lo, hi = np.array(h["quantization"]["min"]), np.array(h["quantization"]["min"]) + 65535 * step
    for arr in (wood.a, wood.b, wood.cut_position):
        assert (arr >= lo - 1e-9).all() and (arr <= hi + 1e-9).all()


def test_wood_header_has_no_time(winter):
    """H05 also with the skeleton: no capture time, no trajectory, no frame order."""
    _wood, _world, data = _wood_world(winter, voxel=0.2)
    text = json.dumps(read_world(data).header).lower()
    for word in ("time", "gps", "utc", "trajectory", "frame", "start", "end_", "camera"):
        assert word not in text, word


def test_skeleton_sits_on_the_trees_of_the_cloud(winter):
    """Kind 0 lies on this scan's wood; each tree's lowest node stands on its ground
    near the inventory position."""
    _before, after, _cut, trees, _skb, sk_after, _report = winter
    _wood, _world, data = _wood_world(winter)
    back = read_world(data)
    standing = back.segment_kind == 0
    ends = np.vstack([back.segment_a[standing], back.segment_b[standing]])
    # Skeleton nodes are point centroids of a branch cross-section: inside the
    # branch, within its radius (a few cm) of the surface points.
    assert np.median(_nearest(ends, after.points)) < 0.05
    frame = LocalFrame(after.meta.origin_lat, after.meta.origin_lon)
    for i, t in enumerate(trees):
        mine = np.vstack([back.segment_a[standing & (back.segment_tree == i)]])
        assert len(mine) > 50
        low = mine[np.argmin(mine[:, 2])]
        e0, n0 = (float(x) for x in frame.to_en(t.lat, t.lon))
        ground = after.true_centers[t.tree_id][2] + DRIFT[2]
        assert np.hypot(low[0] - e0, low[1] - n0) < 0.5  # inventory error ~0.15 m
        assert 0.2 <= low[2] - ground <= 0.6  # the stage cuts the lowest 0.25 m


def test_pruned_wood_is_the_removed_subtrees(winter):
    """Kind 1 is the before skeleton's subtrees at the cuts, moved into this scan's frame:
    on the before scan's wood (as it lies in the after frame) and not on the after scan's."""
    from orchados_pipeline.lidar.world import before_to_after

    before, after, _cut, trees, sk_before, sk_after, report = winter
    wood, _world, data = _wood_world(winter)
    back = read_world(data)
    expected = 0
    by_tree = {s.tree_id: s for s in sk_before.skeletons}
    for d in report.details:
        nodes = by_tree[d.tree_id].nodes
        parent = {n.id: n.parent for n in nodes}
        children: dict[int, list[int]] = {}
        for n in nodes:
            if n.parent is not None:
                children.setdefault(n.parent, []).append(n.id)
        for c in d.cuts:
            todo, sub = [c.node], []
            while todo:
                k = todo.pop()
                sub.append(k)
                todo.extend(children.get(k, []))
            expected += sum(1 for k in sub if parent[k] is not None)
    pruned = back.segment_kind == 1
    # Short segments (< 5 mm) would be dropped; skeleton edges are ~8 cm.
    assert pruned.sum() == expected > 0
    mid = (back.segment_a[pruned] + back.segment_b[pruned]) / 2
    # The before scan in the after frame: the drift between the two scans.
    assert np.median(_nearest(mid, before.points + DRIFT)) < 0.05
    gone = _nearest(mid, after.points)
    assert np.mean(~np.isfinite(gone) | (gone > 0.08)) > 0.6
    # The inverse of the stage's alignment, exactly.
    from orchados_pipeline.lidar.pruning import transform

    x = np.random.default_rng(1).normal(size=(20, 3))
    for d in report.details:
        al = d.alignment
        assert al is not None and al.applied
        # Heights are above each scan's own ground: the vertical drift is gone already.
        assert np.allclose(al.shift_m[:2], -DRIFT[:2], atol=0.015) and abs(al.shift_m[2]) < 0.015
        b = transform(x, np.radians(al.yaw_deg), np.asarray(al.shift_m))
        assert np.allclose(before_to_after(b, al.yaw_deg, al.shift_m), x)


def test_cut_markers_follow_the_pruning_report(winter):
    from orchados_pipeline.lidar.world import before_to_after

    before, after, cut, trees, _skb, sk_after, report = winter
    wood, _world, data = _wood_world(winter)
    back = read_world(data)
    centers = {s.tree_id: s for s in sk_after.skeletons}
    index = {t.tree_id: i for i, t in enumerate(trees)}
    k = 0
    for d in report.details:
        al = d.alignment
        sk = centers[d.tree_id]
        for c in d.cuts:
            want = before_to_after(np.array([c.xyz]), al.yaw_deg, al.shift_m)[0]
            want = want + np.array([sk.center_en[0], sk.center_en[1], sk.ground_z])
            assert np.linalg.norm(back.cut_position[k] - want) < 0.01
            assert back.cut_tree[k] == index[d.tree_id]
            assert back.cut_diameter[k] == round(c.diameter_m * 1000)
            k += 1
    assert k == len(back.cut_position) == back.header["cut_count"]
    # And where the cuts really were: next to a true cut point in the after frame.
    hits = []
    for tid, tree in cut.items():
        true = np.array([c["cut_point"] for c in tree.pruned]) + after.true_centers[tid] + DRIFT
        mine = back.cut_position[back.cut_tree == index[tid]]
        for p in true:
            hits.append(np.linalg.norm(mine - p, axis=1).min() < 0.6)
    assert np.mean(hits) >= 0.5


def test_unusable_trees_and_mismatched_reports_are_left_out(winter):
    from orchados_pipeline.lidar.world import wood_from_reports

    before, after, _cut, trees, sk_before, sk_after, report = winter
    one_sided = sk_after.model_copy(deep=True)
    one_sided.trees[0] = one_sided.trees[0].model_copy(update={"status": "one_sided"})
    wood = wood_from_reports(one_sided, trees, None, None)
    assert set(wood.tree.tolist()) == {1} and wood.info["pruning"] is None
    assert len(wood.cut_position) == 0
    with pytest.raises(CloudError, match="session"):
        wood_from_reports(sk_before, trees, report, sk_before)
    with pytest.raises(CloudError, match="before"):
        wood_from_reports(sk_after, trees, report, sk_after)
    moved = [TreePosition(t.tree_id, t.slot_code, t.lat + 1e-6, t.lon) for t in trees]
    with pytest.raises(CloudError, match="another trees JSON"):
        wood_from_reports(sk_after, moved, report, sk_before)
    other = report.model_copy(deep=True)
    other.params.skeleton.bin_m = 0.1
    with pytest.raises(CloudError, match="parameters"):
        wood_from_reports(sk_after, trees, other, sk_before)


def test_without_wood_the_file_has_no_wood(plot):
    world = build_world(plot.points, plot.meta, plot.positions, [], WorldParams(voxel_m=0.2))
    data = encode_world(world)
    h = read_world(data).header
    assert not {"segment_count", "cut_count", "skeleton"} & set(h)
    assert list(h["arrays"]) == ["position", "color", "tree"]
    assert len(data) == h["arrays"]["tree"]["offset"] + 2 * h["point_count"]


def test_command_writes_the_skeleton_and_the_cuts(tmp_path, capsys):
    """synth --pruned-copy, skeleton of both, pruning, world of the after scan: the
    reports are picked up from the LiDAR folders, the before skeleton by its id."""
    before, after = tmp_path / "kis-once", tmp_path / "kis-sonra"
    args = ["lidar", "synth", str(before), "--leafless", "--rows", "productive"]
    assert main([*args, "--pruned-copy", str(after), "--cuts", "2"]) == 0
    # synth writes one inventory for both scans: no --trees needed.
    assert (before / "trees.json").read_text() == (after / "trees.json").read_text()
    assert main(["lidar", "skeleton", str(before)]) == 0
    assert main(["lidar", "skeleton", str(after)]) == 0
    assert main(["lidar", "pruning", str(before), str(after)]) == 0
    trees: list[str] = []
    params = tmp_path / "p.json"
    params.write_text(json.dumps({"voxel_m": 0.1}))
    capsys.readouterr()
    assert main(["lidar", "world", str(after), *trees, "--params", str(params)]) == 0
    assert "pruned)" in capsys.readouterr().out
    out = tmp_path / "kis-sonra.processed" / "lidar"
    back = read_world(out / "world.owc")
    assert back.header["cut_count"] > 0 and (back.segment_kind == 1).any()
    assert json.loads((out / "world.json").read_text())["header"] == back.header
    # The before scan: its skeleton only.
    assert main(["lidar", "world", str(before), "--params", str(params)]) == 0
    first = read_world(tmp_path / "kis-once.processed" / "lidar" / "world.owc")
    assert first.header["segment_count"] > 0 and first.header["cut_count"] == 0
    assert first.header["skeleton"]["pruning"] is None
    # --no-skeleton: the plain file.
    assert (
        main(["lidar", "world", str(after), *trees, "--params", str(params), "--no-skeleton"]) == 0
    )
    assert "segment_count" not in read_world(out / "world.owc").header
    # An explicit pruning report without its before skeleton is refused.
    stray = tmp_path / "x"
    stray.mkdir()
    (stray / "pruning.json").write_text((out / "pruning.json").read_text())
    (tmp_path / "kis-once.processed" / "lidar" / "skeleton.json").rename(stray / "skeleton.json")
    code = main(["lidar", "world", str(after), *trees, "--pruning", str(stray / "pruning.json")])
    assert code != 0 and "before" in capsys.readouterr().err
