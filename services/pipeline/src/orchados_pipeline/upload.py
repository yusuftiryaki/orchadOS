"""Upload a finished run: files to the media bucket, rows to capture / asset / asset_source.

- Raw captures (video, UBX, events, session files, base data) stay on the
  processing station; their capture rows point there with a station:// uri.
- Derived files of the selected kinds go to the media bucket under
  org/<org_id>/parcel/<parcel_id>/<sha256>; asset.uri = storage://media/<key>.
- derived_from in outputs.json becomes asset_source rows. Parents that are not
  registered (internal JSON stages, kinds left out) are skipped; a crop whose
  full panorama is not registered points to that panorama's preview instead.
- Re-running is safe: objects are written before their rows, existing objects
  and rows are found and skipped (asset by session + content_hash +
  pipeline_version), missing lineage rows are added. A new pipeline version
  adds new rows and leaves the old ones.
"""

from __future__ import annotations

import socket
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .gpstime import gps_ns_to_iso
from .hashing import sha256_file
from .imaging import FACE_BLUR
from .media import MediaStore, media_key, media_uri
from .models import (
    ClockModel,
    CropRecord,
    CropSet,
    FileRole,
    Manifest,
    PanoramaRecord,
    PanoramaSet,
    Pose,
    read_model,
)
from .outputs import AssetEntry, CaptureEntry, Outputs, load_outputs

# Upload kinds (the --only option) -> outputs.json asset kind.
UPLOAD_KINDS = {
    "panorama": "panorama",  # full 4K
    "preview": "panorama_preview",  # 2K
    "tree_crop": "tree_crop",
    "trajectory": "trajectory",
}
# Full panoramas are left out by default: a whole visit of them does not fit the
# 1 GB of the free Supabase tier (README, "Yükleme").
DEFAULT_KINDS = frozenset({"preview", "tree_crop", "trajectory"})

# outputs.json asset kind -> public.asset_kind
ASSET_KIND = {
    "panorama": "panorama",
    "panorama_preview": "panorama",
    "tree_crop": "tree_crop",
    "trajectory": "trajectory",
}
IMAGE_KINDS = {"panorama", "panorama_preview", "tree_crop"}

# outputs.json capture kind (FileRole) -> public.capture_kind, media type
CAPTURE_KIND = {
    FileRole.video: ("video_360", "video/mp4"),
    FileRole.gnss_raw: ("gnss_raw", "application/octet-stream"),
    FileRole.base_obs: ("gnss_raw", "text/plain"),
    FileRole.base_nav: ("gnss_raw", "text/plain"),
    FileRole.gnss_events: ("other", "text/csv"),
    FileRole.session_meta: ("other", "application/json"),
    FileRole.logger_session: ("other", "application/json"),
}

# Solution quality in asset.pose: fix | float | dgps | single (docs/arayuzler.md).
POSE_QUALITY = {"fix": "fix", "float": "float", "dgps": "dgps", "sbas": "dgps"}

# Statuses that upload moves to 'processed'; later ones (in_review, published) are kept.
STATUS_BEFORE_PROCESSED = ("planned", "captured")


class UploadError(RuntimeError):
    pass


class UnblurredError(UploadError):
    pass


@dataclass(frozen=True)
class SessionRow:
    id: str
    org_id: str
    parcel_id: str
    status: str
    started_at: str | None = None
    rig_id: str | None = None


class Catalog(Protocol):
    """Database side of an upload (Supabase PostgREST now; a fake in unit tests)."""

    def session(self, session_id: str) -> SessionRow: ...

    def active_trees(self, parcel_id: str) -> dict[str, str]:
        """slot code -> id of the slot's active tree."""
        ...

    def captures(self, session_id: str) -> dict[str, str]:
        """content_hash -> capture id."""
        ...

    def insert_capture(self, row: dict[str, Any]) -> str: ...

    def assets(self, session_id: str, pipeline_version: str) -> dict[str, str]:
        """content_hash -> asset id."""
        ...

    def insert_asset(self, row: dict[str, Any]) -> str: ...

    def asset_sources(self, asset_ids: list[str]) -> set[tuple[str, str | None, str | None]]:
        """(asset_id, source_capture_id, source_asset_id) rows of these assets."""
        ...

    def insert_asset_sources(self, rows: list[dict[str, Any]]) -> None: ...

    def mark_processed(self, session_id: str, from_statuses: Iterable[str]) -> str:
        """Set status to 'processed' if it is one of from_statuses; return the status after."""
        ...


@dataclass
class UploadOptions:
    kinds: frozenset[str] = DEFAULT_KINDS
    allow_unblurred: bool = False  # synthetic data only
    station: str = field(default_factory=socket.gethostname)
    session_dir: Path | None = None  # default: <run_dir>/../../<session> for "<session>.processed"


@dataclass
class UploadReport:
    session_id: str
    status_before: str
    status_after: str = ""
    captures_created: int = 0
    captures_existing: int = 0
    assets_created: int = 0
    assets_existing: int = 0
    objects_uploaded: int = 0
    objects_existing: int = 0
    lineage_created: int = 0
    skipped_kinds: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def lines(self) -> list[str]:
        out = [
            f"session {self.session_id}: {self.status_before} -> {self.status_after}",
            f"captures: {self.captures_created} created, {self.captures_existing} existing",
            f"assets: {self.assets_created} created, {self.assets_existing} existing",
            f"objects: {self.objects_uploaded} uploaded, {self.objects_existing} existing",
            f"lineage rows: {self.lineage_created} created",
        ]
        if self.skipped_kinds:
            skipped = ", ".join(f"{k}={v}" for k, v in sorted(self.skipped_kinds.items()))
            out.append(f"not uploaded: {skipped}")
        out += [f"warning: {w}" for w in self.warnings]
        return out


def parse_kinds(text: str) -> frozenset[str]:
    kinds = frozenset(k.strip() for k in text.split(",") if k.strip())
    unknown = kinds - set(UPLOAD_KINDS)
    if unknown or not kinds:
        raise UploadError(
            f"unknown kinds {sorted(unknown)}; choose from {', '.join(sorted(UPLOAD_KINDS))}"
        )
    return kinds


def default_session_dir(run_dir: Path) -> Path | None:
    root = run_dir.resolve().parent
    if root.name.endswith(".processed"):
        return root.with_name(root.name.removesuffix(".processed"))
    return None


def station_uri(station: str, path: Path) -> str:
    return f"station://{station}{path.resolve().as_posix()}"


def _point(pose: Pose) -> str:
    return f"SRID=4326;POINT({pose.lon!r} {pose.lat!r})"


def _clamp01(x: float | None) -> float | None:
    return None if x is None else min(1.0, max(0.0, x))


def panorama_pose(entry: AssetEntry, variant: str) -> dict[str, Any]:
    """asset.pose of a panorama (docs/arayuzler.md, "Asset pose alanı")."""
    p = entry.pose
    assert p is not None
    return {
        "variant": variant,
        "heading_deg": p.heading_deg,
        "height_m": p.height_m,
        "sd_h_m": p.sd_h_m,
        "quality": POSE_QUALITY.get(p.quality.value, "single"),
        "gps_time_ns": str(entry.gps_time_ns),
        "width_px": entry.file.width,
        "height_px": entry.file.height,
    }


def crop_pose(rec: CropRecord, panorama_asset_id: str | None) -> dict[str, Any]:
    return {
        "direction": rec.direction,
        "slot_code": rec.slot_code,
        "panorama_asset_id": panorama_asset_id,
        "distance_m": rec.distance_m,
        "azimuth_deg": rec.azimuth_deg,
        "yaw_in_panorama_deg": rec.yaw_in_panorama_deg,
        "pitch_deg": rec.pitch_deg,
        "fov_deg": rec.fov_deg,
        "score": rec.score,
    }


@dataclass
class _Run:
    """outputs.json plus the stage files the rows need."""

    run_dir: Path
    outputs: Outputs
    manifest: Manifest
    panoramas: dict[str, PanoramaRecord]  # full image sha -> record
    preview_of: dict[str, str]  # full image sha -> preview sha
    crops: dict[str, CropRecord]  # crop image sha -> record
    clock: ClockModel | None

    @classmethod
    def load(cls, run_dir: Path) -> _Run:
        run_dir = Path(run_dir)
        if not (run_dir / "outputs.json").is_file():
            raise UploadError(f"{run_dir}/outputs.json not found; run the 'outputs' stage first")
        pset = read_model(PanoramaSet, run_dir / "panoramas.json")
        cpath = run_dir / "crops.json"
        cset = read_model(CropSet, cpath) if cpath.is_file() else None
        spath = run_dir / "sync.json"
        return cls(
            run_dir=run_dir,
            outputs=load_outputs(run_dir / "outputs.json"),
            manifest=read_model(Manifest, run_dir / "manifest.json"),
            panoramas={p.image.sha256: p for p in pset.panoramas},
            preview_of={p.image.sha256: p.preview.sha256 for p in pset.panoramas},
            crops={c.image.sha256: c for c in cset.crops} if cset else {},
            clock=read_model(ClockModel, spath) if spath.is_file() else None,
        )

    def session_start(self, session: SessionRow) -> str:
        start = self.manifest.logger.start if self.manifest.logger else None
        if start and start.gps_time_ns is not None:
            return gps_ns_to_iso(start.gps_time_ns)
        if start and start.utc:
            return start.utc
        if session.started_at:
            return session.started_at
        if self.clock is not None:
            return gps_ns_to_iso(self.clock.offset_ns)
        raise UploadError("no start time for the captures (logger start, session.started_at)")

    def capture_times(self, c: CaptureEntry, default_start: str) -> tuple[str, str | None]:
        if c.kind == FileRole.video and self.clock is not None:
            # Parts are consecutive (README); this part starts after the earlier ones.
            videos = self.manifest.by_role(FileRole.video)
            before = 0.0
            for v in videos:
                assert v.video is not None
                if v.sha256 == c.capture_id:
                    return (
                        gps_ns_to_iso(self.clock.camera_to_gps_ns(before)),
                        gps_ns_to_iso(self.clock.camera_to_gps_ns(before + v.video.duration_s)),
                    )
                before += v.video.duration_s
        return default_start, None


def upload_run(
    run_dir: Path,
    session_id: str,
    catalog: Catalog,
    store: MediaStore,
    options: UploadOptions | None = None,
    log: Callable[[str], None] | None = None,
) -> UploadReport:
    options = options or UploadOptions()
    log = log or (lambda _msg: None)
    run = _Run.load(Path(run_dir))
    out = run.outputs
    session = catalog.session(session_id)
    report = UploadReport(session_id=session_id, status_before=session.status)

    # --- checks before anything is written ------------------------------------------
    if out.session_id != session.id:
        raise UploadError(f"outputs.json is for session {out.session_id}, not {session.id}")
    if out.parcel_id != session.parcel_id:
        raise UploadError(
            f"outputs.json parcel {out.parcel_id} differs from the session's {session.parcel_id}"
        )
    if out.org_id is not None and out.org_id != session.org_id:
        raise UploadError(f"outputs.json org {out.org_id} differs from the session's org")
    session_dir = options.session_dir or default_session_dir(run.run_dir)
    if session_dir is None:
        raise UploadError("cannot infer the session folder from the run folder; give --session-dir")

    wanted = {UPLOAD_KINDS[k] for k in options.kinds}
    selected: list[AssetEntry] = []
    for a in out.assets:
        if a.kind in wanted:
            selected.append(a)
        else:
            report.skipped_kinds[a.kind] = report.skipped_kinds.get(a.kind, 0) + 1

    unblurred = [
        a for a in selected if a.kind in IMAGE_KINDS and FACE_BLUR not in (a.filters_applied or [])
    ]
    if unblurred:
        if not options.allow_unblurred:
            raise UnblurredError(
                f"{len(unblurred)} images are not face-blurred; nothing was uploaded "
                "(--allow-unblurred is for synthetic data only)"
            )
        report.warnings.append(f"{len(unblurred)} images uploaded without face blurring")

    trees = (
        catalog.active_trees(session.parcel_id)
        if any(a.kind == "tree_crop" for a in selected)
        else {}
    )
    crop_tree: dict[str, str] = {}
    unmatched: list[str] = []
    for a in selected:
        if a.kind != "tree_crop":
            continue
        code = (a.subject or {}).get("slot_code", "")
        if code in trees:
            crop_tree[a.asset_id] = trees[code]
        else:
            unmatched.append(f"{code or '?'} ({(a.subject or {}).get('direction', '?')})")
    if unmatched:
        report.warnings.append(
            f"{len(unmatched)} tree crops not uploaded, no active tree in a slot with that code: "
            + ", ".join(sorted(unmatched))
        )
        selected = [a for a in selected if a.kind != "tree_crop" or a.asset_id in crop_tree]

    base = {"org_id": session.org_id, "parcel_id": session.parcel_id, "session_id": session.id}

    # --- captures (rows only; the files stay on the station) --------------------------
    capture_ids = catalog.captures(session.id)
    start = run.session_start(session)
    for c in out.captures:
        if c.capture_id in capture_ids:
            report.captures_existing += 1
            continue
        kind, mime = CAPTURE_KIND.get(c.kind, ("other", "application/octet-stream"))
        started_at, ended_at = run.capture_times(c, start)
        capture_ids[c.capture_id] = catalog.insert_capture(
            {
                **base,
                "kind": kind,
                "rig_id": session.rig_id,
                "uri": station_uri(options.station, session_dir / c.path),
                "content_hash": c.capture_id,
                "byte_size": c.size,
                "mime_type": mime,
                "started_at": started_at,
                "ended_at": ended_at,
                "metadata": {"role": c.kind.value, "path": c.path},
            }
        )
        report.captures_created += 1

    # --- assets: object first, then row, then lineage ----------------------------------
    prefix = media_key(session.org_id, session.parcel_id, "").rstrip("/")
    keys = store.keys(prefix)
    asset_ids = catalog.assets(session.id, out.pipeline.version)
    # Rows of an interrupted upload may still lack their lineage.
    lineage = catalog.asset_sources(list(asset_ids.values())) if asset_ids else set()

    for n, a in enumerate(selected, 1):
        key = media_key(session.org_id, session.parcel_id, a.asset_id)
        if key in keys:
            report.objects_existing += 1
        else:
            path = run.run_dir / a.file.path
            if sha256_file(path) != a.asset_id:
                raise UploadError(f"{path}: content does not match outputs.json")
            if store.put(key, path, a.file.media_type):
                report.objects_uploaded += 1
            else:
                report.objects_existing += 1
            keys.add(key)

        parents = [asset_ids.get(h) for h in a.derived_from.assets]
        if a.kind == "tree_crop":
            # The crop was cut from the full panorama; without it, the preview stands in.
            parents = [
                asset_ids.get(h) or asset_ids.get(run.preview_of.get(h, ""))
                for h in a.derived_from.assets
            ]

        if a.asset_id in asset_ids:
            report.assets_existing += 1
            asset_id = asset_ids[a.asset_id]
        else:
            row = _asset_row(a, run, base, out, key, crop_tree, parents)
            asset_id = asset_ids[a.asset_id] = catalog.insert_asset(row)
            report.assets_created += 1

        sources = [(asset_id, capture_ids[h], None) for h in a.derived_from.captures] + [
            (asset_id, None, p) for p in parents if p is not None
        ]
        missing = [s for s in dict.fromkeys(sources) if s not in lineage]
        if missing:
            catalog.insert_asset_sources(
                [
                    {
                        "org_id": session.org_id,
                        "parcel_id": session.parcel_id,
                        "asset_id": s[0],
                        "source_capture_id": s[1],
                        "source_asset_id": s[2],
                    }
                    for s in missing
                ]
            )
            lineage.update(missing)
            report.lineage_created += len(missing)
        if n % 100 == 0:
            log(f"assets: {n}/{len(selected)}")

    report.status_after = catalog.mark_processed(session.id, STATUS_BEFORE_PROCESSED)
    return report


def _asset_row(
    a: AssetEntry,
    run: _Run,
    base: dict[str, str],
    out: Outputs,
    key: str,
    crop_tree: dict[str, str],
    parents: list[str | None],
) -> dict[str, Any]:
    row: dict[str, Any] = {
        **base,
        "kind": ASSET_KIND[a.kind],
        "tree_id": None,
        "uri": media_uri(key),
        "content_hash": a.asset_id,
        "byte_size": a.file.size,
        "mime_type": a.file.media_type,
        "position": None,
        "position_uncertainty_m": None,
        "pose": None,
        "quality_score": _clamp01(a.quality_score),
        "pipeline": out.pipeline.name,
        "pipeline_version": out.pipeline.version,
        "params_hash": out.pipeline.params_hash,
    }
    if a.kind in ("panorama", "panorama_preview"):
        assert a.pose is not None
        row["position"] = _point(a.pose)
        row["position_uncertainty_m"] = a.pose.sd_h_m
        row["pose"] = panorama_pose(a, "full" if a.kind == "panorama" else "preview")
    elif a.kind == "tree_crop":
        rec = run.crops.get(a.asset_id)
        if rec is None:
            raise UploadError(f"crop {a.file.path} is missing from crops.json")
        pano = run.panoramas.get(rec.panorama_sha256)
        if pano is not None:  # where the camera stood
            row["position"] = _point(pano.pose)
            row["position_uncertainty_m"] = pano.pose.sd_h_m
        row["tree_id"] = crop_tree[a.asset_id]
        row["pose"] = crop_pose(rec, next((p for p in parents if p), None))
    return row


# --- Supabase ---------------------------------------------------------------------------


def _in(values: Iterable[str]) -> str:
    return "in.(" + ",".join(values) + ")"


class SupabaseCatalog:
    """Catalog over PostgREST with the signed-in user's token."""

    def __init__(self, client):
        from .supabase import SupabaseClient

        self.client: SupabaseClient = client

    def session(self, session_id: str) -> SessionRow:
        rows = self.client.select(
            "session",
            {"id": f"eq.{session_id}", "select": "id,org_id,parcel_id,status,started_at,rig_id"},
        )
        if not rows:
            raise UploadError(f"session {session_id} not found or not visible to this user")
        return SessionRow(**rows[0])

    def active_trees(self, parcel_id: str) -> dict[str, str]:
        slots = self.client.select("slot", {"parcel_id": f"eq.{parcel_id}", "select": "id,code"})
        trees = self.client.select(
            "tree",
            {"parcel_id": f"eq.{parcel_id}", "status": "eq.active", "select": "id,slot_id"},
        )
        tree_of_slot = {t["slot_id"]: t["id"] for t in trees}
        return {s["code"]: tree_of_slot[s["id"]] for s in slots if s["id"] in tree_of_slot}

    def captures(self, session_id: str) -> dict[str, str]:
        rows = self.client.select(
            "capture", {"session_id": f"eq.{session_id}", "select": "id,content_hash"}
        )
        return {r["content_hash"]: r["id"] for r in rows}

    def insert_capture(self, row: dict[str, Any]) -> str:
        return self.client.insert("capture", [row])[0]["id"]

    def assets(self, session_id: str, pipeline_version: str) -> dict[str, str]:
        rows = self.client.select(
            "asset",
            {
                "session_id": f"eq.{session_id}",
                "pipeline_version": f"eq.{pipeline_version}",
                "select": "id,content_hash",
            },
        )
        return {r["content_hash"]: r["id"] for r in rows}

    def insert_asset(self, row: dict[str, Any]) -> str:
        return self.client.insert("asset", [row])[0]["id"]

    def asset_sources(self, asset_ids: list[str]) -> set[tuple[str, str | None, str | None]]:
        out: set[tuple[str, str | None, str | None]] = set()
        for i in range(0, len(asset_ids), 100):
            rows = self.client.select(
                "asset_source",
                {
                    "asset_id": _in(asset_ids[i : i + 100]),
                    "select": "id,asset_id,source_capture_id,source_asset_id",
                },
            )
            out |= {(r["asset_id"], r["source_capture_id"], r["source_asset_id"]) for r in rows}
        return out

    def insert_asset_sources(self, rows: list[dict[str, Any]]) -> None:
        self.client.insert("asset_source", rows)

    def mark_processed(self, session_id: str, from_statuses: Iterable[str]) -> str:
        self.client.update(
            "session",
            {"id": f"eq.{session_id}", "status": _in(from_statuses)},
            {"status": "processed"},
        )
        return self.session(session_id).status


def upload_to_supabase(
    run_dir: Path,
    session_id: str,
    options: UploadOptions | None = None,
    env: dict[str, str] | None = None,
    log: Callable[[str], None] | None = None,
) -> UploadReport:
    """Sign in with the credentials from the environment (Credentials.ENV) and upload."""
    from .media import SupabaseMediaStore
    from .supabase import Credentials, SupabaseClient

    with SupabaseClient.sign_in(Credentials.from_env(env)) as client:
        return upload_run(
            run_dir, session_id, SupabaseCatalog(client), SupabaseMediaStore(client), options, log
        )
