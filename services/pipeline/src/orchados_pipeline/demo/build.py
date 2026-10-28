"""Build the demo media and the per-visit run folders (docs/demo-turu.md §9, §10.1).

Cache layout (services/pipeline/.demo-build/v<version>-<profile>/):

    manifest.json            dataset, profile, generator, files, runs; dataset_sha256
                             is the SHA-256 of its canonical JSON (without that key)
    files/<sha256>           every uploaded file, content addressed
    runs/<visit>/            the pipeline's run files for upload.upload_run():
                             outputs.json, manifest.json, panoramas.json,
                             crops.json, coverage.json (inventory), presence.json (scans)

A run folder points its files at ../../files/<sha256>, so the SQL emitter
(sqlgen.py) reuses upload_run() as it is: captures, assets, lineage, coverage
and presence rows come from the pipeline's own row builders.
"""

from __future__ import annotations

import json
import math
import multiprocessing as mp
import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import cv2

from .. import __version__
from ..coverage import compute_coverage, rule_of
from ..crops import DIRECTIONS, candidate_views
from ..gpstime import utc_to_gps_ns
from ..hashing import canonical_json, sha256_bytes
from ..imaging import encode, resize
from ..models import (
    CoverageReport,
    CropRecord,
    CropSet,
    FileRef,
    FileRole,
    Manifest,
    ManifestFile,
    PanoramaRecord,
    PanoramaSet,
    Pose,
    PresenceReport,
    PresenceResult,
    Producer,
    SessionInfo,
    Tree,
    TreeList,
    VideoInfo,
    ViewSignal,
    write_model,
)
from ..outputs import AssetEntry, CaptureEntry, Lineage, Outputs, PipelineRef
from ..params import PipelineParams
from ..projection import gnomonic_crop
from . import closeups, ids
from .dataset import (
    CAMERA_HEIGHT_M,
    DATASET_NAME,
    DATASET_VERSION,
    PRODUCER,
    PRODUCER_VERSION,
    Dataset,
    Frame,
    Visit,
    load,
    rng,
    tree_class,
)
from .render import PROFILES, Profile, Scene, corner_stamp, make_scene, render

GENERATOR = f"orchados-demo/{DATASET_VERSION} (orchados-pipeline {__version__})"


def generator_hash() -> str:
    """Hash of the generator's source: a cached build of other code is rebuilt."""
    here = Path(__file__).parent
    body = b"".join(f.name.encode() + f.read_bytes() for f in sorted(here.glob("*.py")))
    return sha256_bytes(body)[:16]


SHORT = {"A-INV25": "A25I", "A-SCN25": "A25", "A-SCN26": "A26", "B-INV26": "B26I", "B-SCN26": "B26"}
# Ellipsoidal height of the antenna (WGS84): ground ~850 m + geoid ~25 m + pole.
ANTENNA_HEIGHT_M = 877.4
PIPELINE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ROOT = PIPELINE_ROOT / ".demo-build"


class BuildError(RuntimeError):
    pass


def params() -> PipelineParams:
    """Pipeline parameters the crops and coverage are computed with (the defaults)."""
    return PipelineParams()


def params_hash() -> str:
    return params().params_hash()


def build_dir(root: Path, profile: str, version: int = DATASET_VERSION) -> Path:
    return Path(root) / f"v{version}-{profile}"


def producer(stage: str) -> Producer:
    return Producer(
        pipeline=PRODUCER, version=PRODUCER_VERSION, params_hash=params_hash(), stage=stage
    )


def gps_ns(t: datetime) -> int:
    return utc_to_gps_ns(t)


def raw_sha(visit: Visit, name: str) -> str:
    """Content hash of a raw file that stays on the (synthetic) station."""
    return sha256_bytes(f"{DATASET_NAME}:v{DATASET_VERSION}:raw:{visit.key}:{name}".encode())


def raw_files(visit: Visit) -> list[tuple[str, FileRole, int]]:
    day = visit.start.strftime("%Y%m%d")
    minutes = (visit.end - visit.start).total_seconds() / 60
    return [
        (f"VID_{day}_{visit.start:%H%M%S}_00_001.insv", FileRole.video, int(minutes * 92_000_000)),
        (f"gnss_{day}.ubx", FileRole.gnss_raw, int(minutes * 410_000)),
    ]


# ---------------------------------------------------------------------------------------
# Frame records
# ---------------------------------------------------------------------------------------


def frame_pose(visit: Visit, f: Frame) -> Pose:
    lat, lon = visit.parcel.to_latlon(f.x, f.y)
    g = rng(f"pose:{visit.key}:{f.index}")
    return Pose(
        lat=lat,
        lon=lon,
        height_m=round(ANTENNA_HEIGHT_M + float(g.normal(0, 0.05)), 3),
        heading_deg=round(f.heading_deg, 3),
        sd_h_m=round(0.015 + float(g.uniform(0, 0.01)), 4),
        quality="fix",
    )


def placeholder(name: str) -> FileRef:
    """A file reference for a frame that is only used for geometry (not rendered)."""
    return FileRef(
        path=f"(not rendered)/{name}",
        sha256=sha256_bytes(name.encode()),
        size=0,
        media_type="image/webp",
    )


def frame_record(visit: Visit, f: Frame, image: FileRef, preview: FileRef) -> PanoramaRecord:
    t = gps_ns(f.time)
    video, _, _ = raw_files(visit)[0]
    return PanoramaRecord(
        panorama_id=f"{visit.key}-P{f.index:02d}",
        session_id=visit.id,
        gps_time_ns=t,
        utc=f.time.isoformat().replace("+00:00", "Z"),
        pose=frame_pose(visit, f),
        quality_score=round(f.quality, 4),
        sharpness=round(110 + 30 * f.quality, 2),
        source_video=video,
        source_video_sha256=raw_sha(visit, video),
        frame_index=int((f.time - visit.start).total_seconds() * 30),
        camera_s=(f.time - visit.start).total_seconds(),
        image=image,
        preview=preview,
        producer=producer("panoramas"),
    )


def tree_list(ds: Dataset, visit: Visit) -> TreeList:
    p = visit.parcel
    lats, lons = zip(*(p.to_latlon(x, y) for x, y in p.boundary), strict=True)
    trees = []
    for t in ds.trees[p.key]:
        lat, lon = p.to_latlon(*t.xy)
        trees.append(
            Tree(tree_id=t.id, slot_code=t.code, lat=lat, lon=lon, position_uncertainty_m=0.15)
        )
    return TreeList(
        source="database",
        session_id=visit.id,
        parcel_id=p.id,
        session_kind=visit.kind,
        trees=trees,
        boundary_bbox=(min(lons), min(lats), max(lons), max(lats)),
    )


@dataclass
class CropJob:
    tree_id: str
    code: str
    direction: str
    geometry: dict
    score: float
    key: str


def crop_plan(ds: Dataset, visit: Visit, records: list[PanoramaRecord]) -> dict[int, list[CropJob]]:
    """Best view per (tree, side), then the two best sides of each tree; by frame index."""
    p = params().crops
    tl = tree_list(ds, visit)
    best: dict[tuple[str, str], tuple[float, PanoramaRecord, dict]] = {}
    for tree, pano, g, score in candidate_views(tl.trees, records, CAMERA_HEIGHT_M, p):
        k = (tree.tree_id, g["direction"])
        if k not in best or score > best[k][0]:
            best[k] = (score, pano, g)
    plan: dict[int, list[CropJob]] = {}
    index = {r.panorama_id: int(r.panorama_id.rsplit("P", 1)[1]) for r in records}
    for tree in tl.trees:
        sides = sorted(
            ((best[(tree.tree_id, d)], d) for d in DIRECTIONS if (tree.tree_id, d) in best),
            key=lambda x: -x[0][0],
        )[:2]
        for (score, pano, g), d in sides:
            plan.setdefault(index[pano.panorama_id], []).append(
                CropJob(
                    tree.tree_id,
                    tree.slot_code,
                    d,
                    g,
                    score,
                    f"{SHORT[visit.key]}-{tree.slot_code}-{d}",
                )
            )
    return plan


# ---------------------------------------------------------------------------------------
# Rendering (in worker processes)
# ---------------------------------------------------------------------------------------

_SCENE: Scene | None = None


def _render_frame(job: tuple) -> dict:
    """Render one frame: encoded panorama variants and the crops cut from it."""
    f, label, crops = job
    assert _SCENE is not None
    prof = _SCENE.profile
    img = render(_SCENE, f.x, f.y, f.heading_deg, label)
    out: dict = {"index": f.index, "files": {}, "crops": []}
    if "full" in f.variants:
        out["files"]["full"] = encode(img, ".webp", prof.full_quality)
    if "preview" in f.variants:
        out["files"]["preview"] = encode(resize(img, prof.preview), ".webp", prof.preview_quality)
    for c in crops:
        g = c.geometry
        crop = gnomonic_crop(img, g["yaw_deg"], g["pitch_deg"], g["fov_deg"], prof.crop)
        crop = corner_stamp(crop, c.key)
        out["crops"].append((c, encode(crop, ".jpg", prof.jpeg_quality)))
    return out


def _init_worker(visit_key: str, profile: str) -> None:
    """Spawned worker: single-threaded OpenCV, its own copy of the visit's scene."""
    global _SCENE
    cv2.setNumThreads(1)
    ds = load()
    _SCENE = make_scene(ds, ds.visit(visit_key), PROFILES[profile])


def render_visit(
    ds: Dataset, visit: Visit, profile: Profile, jobs: list[tuple], workers: int
) -> list[dict]:
    """Render the jobs; with workers > 1 in spawned processes (a fork after OpenCV has
    started its thread pool can deadlock), each building the scene itself."""
    global _SCENE
    if workers <= 1 or len(jobs) <= 2:
        _SCENE = make_scene(ds, visit, profile)
        try:
            return [_render_frame(j) for j in jobs]
        finally:
            _SCENE = None
    ctx = mp.get_context("spawn")
    n = min(workers, len(jobs))
    with ctx.Pool(n, initializer=_init_worker, initargs=(visit.key, profile.name)) as pool:
        return list(pool.imap(_render_frame, jobs, chunksize=1))


# ---------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------


@dataclass
class FileEntry:
    key: str
    sha256: str
    bytes: int
    mime: str
    width: int
    height: int
    parcel: str
    org: str
    session: str
    kind: str  # panorama | preview | tree_crop | closeup

    def as_dict(self) -> dict:
        return dict(self.__dict__)


class Builder:
    def __init__(self, out: Path, profile: Profile, log: Callable[[str], None]):
        self.out = out
        self.profile = profile
        self.log = log
        self.files: dict[str, FileEntry] = {}
        (out / "files").mkdir(parents=True, exist_ok=True)

    def add(
        self, data: bytes, key: str, mime: str, size: tuple[int, int], visit: Visit, kind: str
    ) -> FileRef:
        sha = sha256_bytes(data)
        if sha in self.files:
            raise BuildError(f"{key}: same bytes as {self.files[sha].key}")
        path = self.out / "files" / sha
        if not path.exists():
            path.write_bytes(data)
        self.files[sha] = FileEntry(
            key, sha, len(data), mime, size[0], size[1], visit.parcel.id, ids.ORG_ID, visit.id, kind
        )
        return FileRef(
            path=f"../../files/{sha}",
            sha256=sha,
            size=len(data),
            media_type=mime,
            width=size[0],
            height=size[1],
        )


def _manifest_model(visit: Visit) -> Manifest:
    files = []
    for name, role, size in raw_files(visit):
        video = None
        if role == FileRole.video:
            dur = (visit.end - visit.start).total_seconds()
            video = VideoInfo(
                width=5760, height=2880, fps=30.0, frame_count=int(dur * 30), duration_s=dur
            )
        files.append(
            ManifestFile(path=name, role=role, size=size, sha256=raw_sha(visit, name), video=video)
        )
    return Manifest(
        producer=producer("ingest"),
        session=SessionInfo(
            session_id=visit.id,
            parcel_id=visit.parcel.id,
            org_id=ids.ORG_ID,
            kind=visit.kind,
            camera_height_m=CAMERA_HEIGHT_M,
            scan_platform="walk",
        ),
        files=files,
        event_counts={},
        ubx_frame_counts={},
    )


def build_visit(ds: Dataset, visit: Visit, b: Builder, workers: int) -> dict:
    """Render a visit's panoramas and crops; write its run folder. Returns run info."""
    prof = b.profile
    short = SHORT[visit.key]
    frames = visit.frames
    rendered = [f for f in frames if f.variants]
    placeholders = [
        frame_record(
            visit,
            f,
            placeholder(f"{visit.key}-{f.index}"),
            placeholder(f"{visit.key}-{f.index}-pv"),
        )
        for f in frames
    ]
    scan = visit.kind == "periodic_scan"
    plan = crop_plan(ds, visit, placeholders) if scan else {}
    jobs = [(f, f"{short}-P{f.index:02d}", plan.get(f.index, [])) for f in rendered]
    b.log(f"{visit.key}: rendering {len(jobs)} panoramas ({sum(len(j[2]) for j in jobs)} crops)")
    results = render_visit(ds, visit, prof, jobs, workers)

    records: list[PanoramaRecord] = []
    crop_recs: list[CropRecord] = []
    assets: list[AssetEntry] = []
    video_sha = raw_sha(visit, raw_files(visit)[0][0])
    gnss_sha = raw_sha(visit, raw_files(visit)[1][0])
    for f, res in zip(rendered, results, strict=True):
        label = f"{short}-P{f.index:02d}"
        full = None
        if "full" in res["files"]:
            full = b.add(res["files"]["full"], label, "image/webp", prof.full, visit, "panorama")
        pv = b.add(
            res["files"]["preview"], f"{label}-pv", "image/webp", prof.preview, visit, "preview"
        )
        rec = frame_record(visit, f, full or pv, pv)
        records.append(rec)
        lineage = Lineage(captures=[video_sha])
        common = dict(
            gps_time_ns=rec.gps_time_ns,
            pose=rec.pose,
            quality_score=rec.quality_score,
            producer_stage="panoramas",
        )
        if full is not None:
            assets.append(
                AssetEntry(
                    asset_id=full.sha256, kind="panorama", file=full, derived_from=lineage, **common
                )
            )
        assets.append(
            AssetEntry(
                asset_id=pv.sha256, kind="panorama_preview", file=pv, derived_from=lineage, **common
            )
        )
        for job, data in res["crops"]:
            ref = b.add(data, job.key, "image/jpeg", (prof.crop, prof.crop), visit, "tree_crop")
            g = job.geometry
            cr = CropRecord(
                tree_id=job.tree_id,
                slot_code=job.code,
                direction=job.direction,
                panorama_id=rec.panorama_id,
                panorama_sha256=rec.image.sha256,
                gps_time_ns=rec.gps_time_ns,
                distance_m=round(g["distance_m"], 3),
                azimuth_deg=round(g["azimuth_deg"], 3),
                yaw_in_panorama_deg=round(g["yaw_deg"], 3),
                pitch_deg=round(g["pitch_deg"], 3),
                fov_deg=round(g["fov_deg"], 3),
                score=round(job.score, 4),
                image=ref,
                producer=producer("crops"),
            )
            crop_recs.append(cr)
            assets.append(
                AssetEntry(
                    asset_id=ref.sha256,
                    kind="tree_crop",
                    file=ref,
                    gps_time_ns=cr.gps_time_ns,
                    quality_score=cr.score,
                    subject={
                        "tree_id": job.tree_id,
                        "slot_code": job.code,
                        "direction": job.direction,
                    },
                    derived_from=Lineage(assets=[rec.image.sha256]),
                    producer_stage="crops",
                )
            )

    run = b.out / "runs" / visit.key
    run.mkdir(parents=True, exist_ok=True)
    write_model(_manifest_model(visit), run / "manifest.json")
    write_model(
        PanoramaSet(producer=producer("panoramas"), panoramas=records, sidecars=[]),
        run / "panoramas.json",
    )
    write_model(
        CropSet(
            producer=producer("crops"),
            crops=crop_recs,
            sidecars=[],
            trees_source="database",
            status="ok" if scan else "inventory_session",
        ),
        run / "crops.json",
    )
    for stale in ("coverage.json", "presence.json"):
        (run / stale).unlink(missing_ok=True)
    if visit.kind == "inventory":
        write_model(_coverage(ds, visit, placeholders), run / "coverage.json")
    if scan:
        write_model(_presence(visit, crop_recs), run / "presence.json")
    captures = [
        CaptureEntry(
            capture_id=video_sha,
            kind=FileRole.video,
            path=raw_files(visit)[0][0],
            size=raw_files(visit)[0][2],
        ),
        CaptureEntry(
            capture_id=gnss_sha,
            kind=FileRole.gnss_raw,
            path=raw_files(visit)[1][0],
            size=raw_files(visit)[1][2],
        ),
    ]
    p = params()
    out = Outputs(
        pipeline=PipelineRef(
            name=PRODUCER,
            version=PRODUCER_VERSION,
            params_hash=p.params_hash(),
            params=p.model_dump(mode="json"),
        ),
        session_id=visit.id,
        parcel_id=visit.parcel.id,
        org_id=ids.ORG_ID,
        captures=captures,
        assets=assets,
        crops_status="ok" if scan else "inventory_session",
    )
    write_model(out, run / "outputs.json")
    return {
        "visit": visit.key,
        "session_id": visit.id,
        "panoramas": len(records),
        "crops": len(crop_recs),
        "files": {n: _sha_file(run / n) for n in sorted(os.listdir(run))},
    }


def _sha_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _coverage(ds: Dataset, visit: Visit, frames: list[PanoramaRecord]) -> CoverageReport:
    """Coverage of the whole drive: every frame position, rendered or not."""
    p = params()
    tl = tree_list(ds, visit)
    res = compute_coverage(
        tl,
        PanoramaSet(producer=producer("panoramas"), panoramas=frames, sidecars=[]),
        CAMERA_HEIGHT_M,
        p.crops,
        p.coverage,
        visit.kind,
    )
    if res is None:
        raise BuildError(f"{visit.key}: no coverage")
    trees, summary, cells, frame = res
    if not summary.passed or summary.blind_spots:
        raise BuildError(f"{visit.key}: inventory coverage does not pass ({summary.ratio})")
    return CoverageReport(
        producer=producer("coverage"),
        session_id=visit.id,
        parcel_id=visit.parcel.id,
        session_kind=visit.kind,
        status="ok",
        trees_source="database",
        rule=rule_of(p.coverage),
        summary=summary,
        frame=frame,
        trees=trees,
        cells=cells,
    )


def _presence(visit: Visit, crops: list[CropRecord]) -> PresenceReport:
    """tree_visible per tree: what the scene shows (absent trees: no)."""
    by_tree: dict[str, list[CropRecord]] = {}
    for c in crops:
        by_tree.setdefault(c.tree_id or "", []).append(c)
    results = []
    for tree_id, recs in by_tree.items():
        absent = tree_class(visit.key, recs[0].slot_code) == "absent"
        views = [
            ViewSignal(
                direction=r.direction,
                crop_sha256=r.image.sha256,
                score=r.score,
                state="absent" if absent else "present",
            )
            for r in recs
        ]
        results.append(
            PresenceResult(
                subject="tree",
                tree_id=tree_id,
                slot_code=recs[0].slot_code,
                value="no" if absent else "yes",
                reason="synthetic scene: tree cut" if absent else "synthetic scene: tree drawn",
                views=views,
            )
        )
    return PresenceReport(
        producer=producer("presence"),
        method=PRODUCER,
        method_version=PRODUCER_VERSION,
        session_id=visit.id,
        parcel_id=visit.parcel.id,
        month=visit.start.month,
        leafy=True,
        status="ok",
        trees=results,
    )


def build_closeups(ds: Dataset, b: Builder) -> list[dict]:
    """Close-up photos of the findings that call for them."""
    out = []
    for f in ds.findings():
        if not f.closeups:
            continue
        visit = ds.visit(f.visit)
        tree = ds.tree(visit.parcel.key, f.tree)
        for i, kind in enumerate(f.closeups, 1):
            key = f"{SHORT[visit.key]}-{f.tree}-C{i}"
            img = closeups.render_closeup(kind, key, b.profile.closeup)
            ref = b.add(
                encode(img, ".jpg", b.profile.jpeg_quality),
                key,
                "image/jpeg",
                b.profile.closeup,
                visit,
                "closeup",
            )
            t = visit.start + timedelta(
                minutes=40 + 3 * i + (tree.slot.row * 7 + tree.slot.pos) % 60
            )
            out.append(
                {
                    "key": key,
                    "visit": visit.key,
                    "session_id": visit.id,
                    "tree": f.tree,
                    "tree_id": tree.id,
                    "finding": f.id,
                    "kind": kind,
                    "shot_code": closeups.SHOT_CODE[kind],
                    "sha256": ref.sha256,
                    "bytes": ref.size,
                    "time": t.isoformat(),
                    "gps_time_ns": str(gps_ns(t)),
                }
            )
    return out


def manifest_sha(manifest: dict) -> str:
    body = {k: v for k, v in manifest.items() if k != "dataset_sha256"}
    return sha256_bytes(canonical_json(body).encode("utf-8"))


def build(
    profile: str = "full",
    out: Path | None = None,
    force: bool = False,
    workers: int | None = None,
    log: Callable[[str], None] = print,
    visits: tuple[str, ...] | None = None,
) -> tuple[Path, dict]:
    """Build (or reuse) the cache of a profile; returns its folder and manifest."""
    if profile not in PROFILES:
        raise BuildError(f"unknown profile {profile}; choose from {', '.join(PROFILES)}")
    target = Path(out) if out else build_dir(DEFAULT_ROOT, profile)
    mpath = target / "manifest.json"
    if mpath.is_file() and not force and visits is None:
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
        if (
            manifest.get("generator_hash") == generator_hash()
            and manifest.get("dataset_sha256") == manifest_sha(manifest)
            and all((target / "files" / f["sha256"]).is_file() for f in manifest["files"])
        ):
            log(f"build: reusing {target}")
            return target, manifest
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    workers = workers or max(1, min(8, os.cpu_count() or 1))
    ds = load()
    b = Builder(target, PROFILES[profile], log)
    runs = []
    for v in ds.visits:
        if not v.frames or (visits and v.key not in visits):
            continue
        runs.append(build_visit(ds, v, b, workers))
    photos = build_closeups(ds, b)
    manifest = {
        "dataset": DATASET_NAME,
        "version": DATASET_VERSION,
        "profile": profile,
        "generator": GENERATOR,
        "generator_hash": generator_hash(),
        "source": "synthetic",
        "params_hash": params_hash(),
        "files": [f.as_dict() for f in sorted(b.files.values(), key=lambda f: f.key)],
        "runs": runs,
        "closeups": photos,
    }
    manifest["dataset_sha256"] = manifest_sha(manifest)
    mpath.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(f.bytes for f in b.files.values())
    log(f"build: {len(b.files)} files, {total / 1e6:.1f} MB in {target}")
    return target, manifest


def total_bytes(manifest: dict) -> int:
    return sum(f["bytes"] for f in manifest["files"])


def estimate_mb(manifest: dict) -> float:
    return math.ceil(total_bytes(manifest) / 1e5) / 10
