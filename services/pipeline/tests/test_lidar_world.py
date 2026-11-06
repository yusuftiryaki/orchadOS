"""lidar world: the 3D world cloud (docs/arayuzler.md, "3D dünya bulutu"), synthetic data only."""

from __future__ import annotations

import json

import cv2
import numpy as np
import pytest

from orchados_pipeline.cli import main
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar.cloud import (
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
