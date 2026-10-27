"""Upload a finished run: files to the media bucket, rows to capture / asset / asset_source.

- Raw captures (video, UBX, events, session files, base data) are not uploaded.
  A session pulled from the raw store (orchados-ingest pull) points its capture
  rows at the store objects (s3://, az://, file://, from the location in
  .orchados/manifest.json); a session processed from a local folder points them
  at the processing station with a station:// uri.
- Derived files of the selected kinds go to the media bucket under
  org/<org_id>/parcel/<parcel_id>/<sha256>; asset.uri = storage://media/<key>.
- derived_from in outputs.json becomes asset_source rows. Parents that are not
  registered (internal JSON stages, kinds left out) are skipped; a crop whose
  full panorama is not registered points to that panorama's preview instead.
- The coverage summary (coverage.json) becomes a coverage_report row through
  record_coverage_report(); the database opens one extra visit request
  (followup_request, origin pipeline) when the scan is below the threshold or
  has blind spots.
- presence.json becomes tree_visible measurements (source algorithm, method
  crop_greenness) through record_tree_presence(), the crops as evidence;
  views of empty slots are tree_crop assets without a tree (pose.subject =
  slot) and a "yes" on an empty slot a slot measurement (possible new planting).
- Re-running is safe: objects are written before their rows, existing objects
  and rows are found and skipped (asset by session + content_hash +
  pipeline_version), missing lineage rows are added. A new pipeline version
  adds new rows and leaves the old ones.
"""

from __future__ import annotations

import json
import socket
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .gpstime import gps_ns_to_iso
from .hashing import sha256_file
from .ingest import CAMERA_HEIGHT_UNSET
from .media import MediaStore, media_key, media_uri
from .models import (
    ClockModel,
    CoverageReport,
    CropRecord,
    CropSet,
    FileRole,
    Manifest,
    PanoramaRecord,
    PanoramaSet,
    Pose,
    PresenceReport,
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


@dataclass(frozen=True)
class SessionRow:
    id: str
    org_id: str
    parcel_id: str
    status: str
    started_at: str | None = None
    rig_id: str | None = None
    # Recorded by the crew at the pre-check (field app sync).
    scan_platform: str | None = None
    camera_height_m: float | None = None


class Catalog(Protocol):
    """Database side of an upload (Supabase PostgREST now; a fake in unit tests)."""

    def session(self, session_id: str) -> SessionRow: ...

    def active_trees(self, parcel_id: str) -> dict[str, str]:
        """slot code -> id of the slot's active tree."""
        ...

    def empty_slots(self, parcel_id: str) -> dict[str, str]:
        """slot code -> slot id of the slots without an active tree."""
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

    def record_scan_setup(self, session_id: str, values: dict[str, Any]) -> None:
        """Fill scan_platform / camera_height_m of the session."""
        ...

    def record_coverage(self, session_id: str, report: dict[str, Any]) -> dict[str, Any]:
        """record_coverage_report(): {report_id, created, passed, rescan_needed}."""
        ...

    def rescan_request(self, session_id: str) -> dict[str, Any] | None:
        """The extra visit request the database opened for the visit: {id, status, ...}."""
        ...

    def record_presence(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """record_tree_presence(): {created, existing}."""
        ...


@dataclass
class UploadOptions:
    kinds: frozenset[str] = DEFAULT_KINDS
    station: str = field(default_factory=socket.gethostname)
    session_dir: Path | None = None  # default: <run_dir>/../../<session> for "<session>.processed"
    # Crops must come from run --trees-from-db (crops.json trees_source = database).
    require_db_trees: bool = False


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
    coverage: dict[str, Any] | None = None  # record_coverage_report() result
    rescan_request: dict[str, Any] | None = None  # pipeline_rescan_request()
    presence: dict[str, Any] | None = None  # record_tree_presence() result
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
        if self.coverage is not None:
            c = self.coverage
            out.append(
                f"coverage report: {'created' if c.get('created') else 'existing'}, "
                + ("passed" if c.get("passed") else "below the threshold")
                + ("; extra visit needed" if c.get("rescan_needed") else "")
            )
        if self.rescan_request is not None:
            r = self.rescan_request
            out.append(f"extra visit request {r['id']}: {r['status']}")
        if self.presence is not None:
            p = self.presence
            out.append(
                f"tree_visible measurements: {p.get('created', 0)} created, "
                f"{p.get('existing', 0)} existing"
            )
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


# Manifest copy that orchados-ingest pull leaves in the session folder.
RAW_MANIFEST = ".orchados/manifest.json"
RAW_MANIFEST_FORMAT = "orchados.raw-manifest/1"


@dataclass(frozen=True)
class RawLocation:
    """Where a pulled session lives in the raw store."""

    uri: str  # session prefix, ends with '/': s3://<bucket>/<key>/, az://..., file://...
    files: dict[str, str]  # path in the session folder -> SHA-256

    def capture_uri(self, path: str, sha256: str) -> str | None:
        """Store uri of a raw file, if the store holds this content under this path."""
        return self.uri + path if self.files.get(path) == sha256 else None


def raw_location(session_dir: Path, session_id: str) -> RawLocation | None:
    """Store location from the pulled manifest; None for a folder that was not pulled."""
    path = session_dir / RAW_MANIFEST
    if not path.is_file():
        return None
    try:
        d = json.loads(path.read_bytes())
    except ValueError as exc:
        raise UploadError(f"{path}: not JSON ({exc})") from exc
    if d.get("format") != RAW_MANIFEST_FORMAT:
        raise UploadError(f"{path}: not a raw manifest (format {d.get('format')!r})")
    if d.get("session_id") != session_id:
        raise UploadError(f"{path} is for session {d.get('session_id')}, not {session_id}")
    uri = (d.get("location") or {}).get("uri")
    if not isinstance(uri, str) or "://" not in uri or not uri.endswith("/"):
        return None
    return RawLocation(uri, {f["path"]: f["sha256"] for f in d.get("files", [])})


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
    trees_source: str | None  # crops.json trees_source; None without crops.json
    clock: ClockModel | None
    coverage: CoverageReport | None
    presence: PresenceReport | None

    @classmethod
    def load(cls, run_dir: Path) -> _Run:
        run_dir = Path(run_dir)
        if not (run_dir / "outputs.json").is_file():
            raise UploadError(f"{run_dir}/outputs.json not found; run the 'outputs' stage first")
        pset = read_model(PanoramaSet, run_dir / "panoramas.json")
        cpath = run_dir / "crops.json"
        cset = read_model(CropSet, cpath) if cpath.is_file() else None
        spath = run_dir / "sync.json"
        covpath = run_dir / "coverage.json"
        prespath = run_dir / "presence.json"
        return cls(
            run_dir=run_dir,
            outputs=load_outputs(run_dir / "outputs.json"),
            manifest=read_model(Manifest, run_dir / "manifest.json"),
            panoramas={p.image.sha256: p for p in pset.panoramas},
            preview_of={p.image.sha256: p.preview.sha256 for p in pset.panoramas},
            crops={c.image.sha256: c for c in cset.crops + cset.slot_crops} if cset else {},
            trees_source=cset.trees_source if cset else None,
            clock=read_model(ClockModel, spath) if spath.is_file() else None,
            coverage=read_model(CoverageReport, covpath) if covpath.is_file() else None,
            presence=read_model(PresenceReport, prespath) if prespath.is_file() else None,
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
    scan_setup = _scan_setup(run.manifest, session, report.warnings)

    wanted = {UPLOAD_KINDS[k] for k in options.kinds}
    selected: list[AssetEntry] = []
    for a in out.assets:
        if a.kind in wanted:
            selected.append(a)
        else:
            report.skipped_kinds[a.kind] = report.skipped_kinds.get(a.kind, 0) + 1

    has_crops = any(a.kind == "tree_crop" for a in selected)
    from_db = run.trees_source == "database"
    if options.require_db_trees and has_crops and not from_db:
        raise UploadError(
            "the crops were cut from a trees file, not from the database; "
            "process again with run --trees-from-db"
        )
    trees = catalog.active_trees(session.parcel_id) if has_crops else {}
    has_slot_crops = any(a.kind == "tree_crop" and _is_slot(a) for a in selected)
    empty = catalog.empty_slots(session.parcel_id) if has_slot_crops else {}
    crop_tree: dict[str, str] = {}
    crop_slot: dict[str, str] = {}
    unmatched: list[str] = []
    changed: list[str] = []
    planted: list[str] = []
    for a in selected:
        if a.kind != "tree_crop":
            continue
        subject = a.subject or {}
        code = subject.get("slot_code", "")
        label = f"{code or '?'} ({subject.get('direction', '?')})"
        if _is_slot(a):
            # View of an empty slot: kept while the slot is still empty.
            if code in empty:
                crop_slot[a.asset_id] = empty[code]
            else:
                planted.append(label)
        elif code not in trees:
            unmatched.append(label)
        elif from_db and subject.get("tree_id") != trees[code]:
            # Crops from the database carry the tree id; the slot now holds another tree.
            changed.append(label)
        else:
            crop_tree[a.asset_id] = trees[code]
    if unmatched:
        report.warnings.append(
            f"{len(unmatched)} tree crops not uploaded, no active tree in a slot with that code: "
            + ", ".join(sorted(unmatched))
        )
    if changed:
        report.warnings.append(
            f"{len(changed)} tree crops not uploaded, the slot's active tree changed since "
            "processing: " + ", ".join(sorted(changed))
        )
    if planted:
        report.warnings.append(
            f"{len(planted)} empty slot views not uploaded, the slot is no longer empty: "
            + ", ".join(sorted(planted))
        )
    if unmatched or changed or planted:
        selected = [
            a
            for a in selected
            if a.kind != "tree_crop" or a.asset_id in crop_tree or a.asset_id in crop_slot
        ]

    base = {"org_id": session.org_id, "parcel_id": session.parcel_id, "session_id": session.id}

    # --- captures (rows only; the files stay in the raw store or on the station) -------
    location = raw_location(session_dir, session.id)
    if location is None and (session_dir / RAW_MANIFEST).is_file():
        report.warnings.append(
            f"{RAW_MANIFEST} has no store location (pulled by an older orchados-ingest); "
            "capture uris point to the station"
        )
    not_in_store: list[str] = []
    capture_ids = catalog.captures(session.id)
    start = run.session_start(session)
    for c in out.captures:
        if c.capture_id in capture_ids:
            report.captures_existing += 1
            continue
        uri = location.capture_uri(c.path, c.capture_id) if location else None
        if uri is None:
            if location is not None:
                not_in_store.append(c.path)
            uri = station_uri(options.station, session_dir / c.path)
        kind, mime = CAPTURE_KIND.get(c.kind, ("other", "application/octet-stream"))
        started_at, ended_at = run.capture_times(c, start)
        capture_ids[c.capture_id] = catalog.insert_capture(
            {
                **base,
                "kind": kind,
                "rig_id": session.rig_id,
                "uri": uri,
                "content_hash": c.capture_id,
                "byte_size": c.size,
                "mime_type": mime,
                "started_at": started_at,
                "ended_at": ended_at,
                "metadata": {"role": c.kind.value, "path": c.path},
            }
        )
        report.captures_created += 1
    if not_in_store:
        report.warnings.append(
            f"{len(not_in_store)} raw files are not in the store's manifest with this content, "
            "their capture uris point to the station: " + ", ".join(sorted(not_in_store))
        )

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
            row = _asset_row(a, run, base, out, key, crop_tree, crop_slot, parents)
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

    # --- coverage summary ------------------------------------------------------------
    payload = coverage_payload(run.coverage) if run.coverage is not None else None
    if payload is not None:
        if run.coverage.session_id != session.id:
            raise UploadError(f"coverage.json is for session {run.coverage.session_id}")
        report.coverage = catalog.record_coverage(session.id, payload)
        report.rescan_request = catalog.rescan_request(session.id)

    # --- presence: tree_visible measurements -------------------------------------------
    if run.presence is not None and run.presence.status == "ok":
        if run.presence.session_id != session.id:
            raise UploadError(f"presence.json is for session {run.presence.session_id}")
        if "tree_crop" not in wanted:
            report.warnings.append("presence results not recorded: tree crops (evidence) left out")
        else:
            if not has_crops:
                trees = catalog.active_trees(session.parcel_id)
            if not has_slot_crops:
                empty = catalog.empty_slots(session.parcel_id)
            payload, warnings = presence_payload(
                run.presence, trees, empty, asset_ids, from_db, run.session_start(session)
            )
            report.warnings += warnings
            if payload["items"]:
                report.presence = catalog.record_presence(session.id, payload)

    if scan_setup:
        catalog.record_scan_setup(session.id, scan_setup)
    report.status_after = catalog.mark_processed(session.id, STATUS_BEFORE_PROCESSED)
    return report


# The crew measures the camera height to the centimetre; more than this between
# the visit's record and the run means the crops were projected wrongly.
CAMERA_HEIGHT_TOLERANCE_M = 0.05


def _scan_setup(manifest: Manifest, session: SessionRow, warnings: list[str]) -> dict[str, Any]:
    """Check the run's camera height and platform against the visit's record; return
    the values to fill where the visit has none."""
    info = manifest.session
    height_set = CAMERA_HEIGHT_UNSET not in manifest.warnings
    if session.camera_height_m is not None:
        if abs(info.camera_height_m - session.camera_height_m) > CAMERA_HEIGHT_TOLERANCE_M:
            raise UploadError(
                f"the visit's recorded camera height is {session.camera_height_m} m, the run used "
                f"{info.camera_height_m} m; set camera_height_m in session.json and process again"
            )
    if session.scan_platform and info.scan_platform and session.scan_platform != info.scan_platform:
        warnings.append(
            f"scan platform: the visit says {session.scan_platform}, "
            f"session.json says {info.scan_platform}; the visit's value is kept"
        )
    values: dict[str, Any] = {}
    if session.camera_height_m is None and height_set:
        values["camera_height_m"] = round(info.camera_height_m, 2)
    if session.scan_platform is None and info.scan_platform:
        values["scan_platform"] = info.scan_platform
    return values


def _is_slot(a: AssetEntry) -> bool:
    return (a.subject or {}).get("subject") == "slot"


def presence_payload(
    rep: PresenceReport,
    trees: dict[str, str],
    empty: dict[str, str],
    asset_ids: dict[str, str],
    from_db: bool,
    measured_at: str,
) -> tuple[dict[str, Any], list[str]]:
    """record_tree_presence()'s p_payload and warnings.

    Trees by slot code (and, for crops cut from the database, the same tree id);
    empty slots only when the signal says yes (possible new planting). Evidence:
    the uploaded crops the signal was read from."""
    items: list[dict[str, Any]] = []
    skipped: list[str] = []
    for r in rep.trees:
        tree_id = trees.get(r.slot_code)
        if tree_id is None or (from_db and r.tree_id != tree_id):
            skipped.append(r.slot_code)
            continue
        evidence = [asset_ids[v.crop_sha256] for v in r.views if v.crop_sha256 in asset_ids]
        items.append({"tree_id": tree_id, "value": r.value, "evidence_asset_ids": evidence})
    for r in rep.slots:
        if r.value != "yes":
            continue
        slot_id = empty.get(r.slot_code)
        if slot_id is None:
            skipped.append(r.slot_code)
            continue
        evidence = [asset_ids[v.crop_sha256] for v in r.views if v.crop_sha256 in asset_ids]
        items.append({"slot_id": slot_id, "value": r.value, "evidence_asset_ids": evidence})
    warnings = []
    if skipped:
        warnings.append(
            f"{len(skipped)} presence results not recorded, the slot's tree changed since "
            "processing: " + ", ".join(sorted(skipped))
        )
    payload = {
        "method": rep.method,
        "method_version": rep.method_version,
        "params_hash": rep.producer.params_hash,
        "measured_at": measured_at,
        "items": items,
    }
    return payload, warnings


def coverage_payload(rep: CoverageReport) -> dict[str, Any] | None:
    """record_coverage_report()'s p_report; None when there is nothing to record
    (no tree positions yet)."""
    if rep.status != "ok" or rep.summary is None or rep.summary.active_trees == 0:
        return None
    s = rep.summary
    return {
        "pipeline": rep.producer.pipeline,
        "pipeline_version": rep.producer.version,
        "params_hash": rep.producer.params_hash,
        "active_trees": s.active_trees,
        "covered_trees": s.covered_trees,
        "threshold": s.threshold,
        "blind_spots": s.blind_spots,
        "missing_slot_codes": [t.slot_code for t in rep.trees if not t.covered],
        "blind_spot_cells": [
            {
                "cell": list(c.cell),
                "trees": c.trees,
                "uncovered": c.uncovered,
                "slot_codes": c.uncovered_slot_codes,
                "south": c.south,
                "west": c.west,
                "north": c.north,
                "east": c.east,
            }
            for c in rep.cells
            if c.blind_spot
        ],
        "rule": rep.rule,
    }


def _asset_row(
    a: AssetEntry,
    run: _Run,
    base: dict[str, str],
    out: Outputs,
    key: str,
    crop_tree: dict[str, str],
    crop_slot: dict[str, str],
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
        row["pose"] = crop_pose(rec, next((p for p in parents if p), None))
        if a.asset_id in crop_slot:
            # No tree: the slot is named in the pose (docs/arayuzler.md, "Asset pose alanı").
            row["pose"].update(subject="slot", slot_id=crop_slot[a.asset_id])
        else:
            row["tree_id"] = crop_tree[a.asset_id]
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
            {
                "id": f"eq.{session_id}",
                "select": "id,org_id,parcel_id,status,started_at,rig_id,"
                "scan_platform,camera_height_m",
            },
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

    def empty_slots(self, parcel_id: str) -> dict[str, str]:
        slots = self.client.select("slot", {"parcel_id": f"eq.{parcel_id}", "select": "id,code"})
        trees = self.client.select(
            "tree",
            {"parcel_id": f"eq.{parcel_id}", "status": "eq.active", "select": "id,slot_id"},
        )
        taken = {t["slot_id"] for t in trees}
        return {s["code"]: s["id"] for s in slots if s["id"] not in taken}

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

    def record_scan_setup(self, session_id: str, values: dict[str, Any]) -> None:
        self.client.update("session", {"id": f"eq.{session_id}"}, values)

    def record_coverage(self, session_id: str, report: dict[str, Any]) -> dict[str, Any]:
        return self.client.rpc(
            "record_coverage_report", {"p_session_id": session_id, "p_report": report}
        )

    def rescan_request(self, session_id: str) -> dict[str, Any] | None:
        return self.client.rpc("pipeline_rescan_request", {"p_session_id": session_id})

    def record_presence(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.client.rpc(
            "record_tree_presence", {"p_session_id": session_id, "p_payload": payload}
        )


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
