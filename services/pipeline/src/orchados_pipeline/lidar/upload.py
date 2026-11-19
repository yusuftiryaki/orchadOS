"""orchados-pipeline lidar upload: LiDAR stage results as measurements in Supabase.

Every report in the output folder with the LidarReport header (crown.json,
skeleton.json, pruning.json) is read; its measurements become public.measurement
rows (source algorithm) through record_lidar_measurements(), signed in as the
ops user of the environment (Credentials.ENV, as for ``orchados-pipeline upload``).

- The reports must be of the session given with --session-id. A pruning report
  compares two scans and belongs to the scan after pruning.
- Tree ids are passed through: with trees from the database (--trees-from-db,
  trees.json) they are public.tree ids. The database refuses a tree that is not
  an active tree of the session's parcel.
- measured_at is the start of the scan: cloud.json of the registration run
  folder, else lidar/cloud.json of the session folder next to the output folder;
  without either the database takes the session start.
- Re-running is safe: a measurement with the same session, tree, metric, method,
  version, parameters and registration is not written again; a new method
  version or a new registration run adds rows.
- Reports and world.json carry the run_id of the cloud they were made from
  (cloud.json); with a registration they must name that run, without one
  (--allow-unregistered) none may name a run (check_run_ids).
- --dry-run prints every payload (registration, measurements, world cloud row)
  and writes nothing.
- The registered cloud of a registration run that was not rejected is kept:
  cloud.ply as a staff-only asset of kind point_cloud (position = the cloud
  origin, pose = {schema, point_count, crs: local_enu, registration_id, origin},
  no time) and its cloud.json as an asset of kind other (application/json,
  pose = {schema, registration_id, role: cloud_meta}), both content addressed in
  the media bucket. Re-running finds them and writes nothing.
- world.owc (lidar world, docs/arayuzler.md "3D dünya bulutu"), when the folder
  has one with its world.json, is uploaded to the media bucket (content
  addressed, as upload does) and recorded as an asset of kind world_cloud:
  position = the cloud origin, pose = {schema, point_count, crs: local_enu,
  registration_id}, no time (H05). Re-running finds the object and the row and
  writes nothing.

Registration (docs/arayuzler.md "Kaydın yüklenmesi"; spec
docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md §5.10, §5.11):

1. The registration run folder (--registration, or the output folder itself when
   it holds registration.json, as `lidar process` writes it) is recorded first
   with record_lidar_registration(); the same run_id again returns the same id.
2. The measurements carry that id as payload.registration_id, the world cloud as
   pose.registration_id.
3. A rejected registration (verdict rejected_auto, or rejected by ops) records
   only the report: no measurements, no world cloud.
4. Without a registration, measurements and world clouds are refused unless
   --allow-unregistered (demo and synthetic data only); they then have no
   registration_id and keep the visibility of older rows.

The metric list mirrors private.lidar_method_metrics()
(supabase/migrations/20261107300000_lidar_measurements.sql); the checks here only
give an early, readable error, the database checks again.
"""

from __future__ import annotations

import json
import math
import sys
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..gpstime import gps_ns_to_iso
from ..hashing import sha256_file
from ..media import MediaStore, media_key, media_uri
from ..upload import SupabaseCatalog, UploadError

RPC = "record_lidar_measurements"
REGISTRATION_RPC = "record_lidar_registration"
REGISTRATION_FILE = "registration.json"  # lidar/registration.py REPORT_FILE
REGISTRATION_SCHEMA = "orchados.lidar_registration/1"
# Stands in for the id record_lidar_registration() returns, in a dry run.
REGISTRATION_PLACEHOLDER = "<registration_id>"
# ppk_status values public.lidar_registration takes; a run without any trajectory
# ("none") used no PPK.
PPK_STATUSES = ("ppk", "no_ppk", "ppk_failed")
UNREGISTERED = (
    "LiDAR measurements and world clouds need their registration "
    "(--registration <run folder>); --allow-unregistered is for demo and synthetic data only"
)

# method -> metric codes it writes (private.lidar_method_metrics()).
METHOD_METRICS: dict[str, frozenset[str]] = {
    "lidar_crown": frozenset(
        {"tree_height", "crown_diameter", "crown_volume", "size_class", "crown_base_height"}
    ),
    "lidar_qsm": frozenset({"scaffold_branch_count", "wood_volume", "fractal_dimension"}),
    "lidar_pruning": frozenset(
        {"pruned_wood_volume", "pruned_wood_fraction", "pruning_cut_count", "pruning_status"}
    ),
}
# Category metrics and their codes (public.metric_definition.categories); the rest are numeric.
CATEGORIES: dict[str, frozenset[str]] = {
    "size_class": frozenset({"sapling", "young", "productive", "old"}),
    "pruning_status": frozenset({"done", "partial", "not_done"}),
}


class LidarUploadError(RuntimeError):
    pass


class _Lenient(BaseModel):
    # Stage reports add their own fields (schema, details, warnings, ...).
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class ReportProducer(_Lenient):
    pipeline: str
    version: str
    params_hash: str
    stage: str


class ReportMeasurement(_Lenient):
    tree_id: str
    slot_code: str | None = None
    metric: str
    value_numeric: float | None = None
    value_category: str | None = None
    unit: str | None = None
    uncertainty: float | None = None
    confidence: float | None = Field(None, ge=0, le=1)
    method: str
    method_version: str


class ReportFile(_Lenient):
    """The LidarReport header (lidar/models.py), read leniently."""

    producer: ReportProducer
    method: str
    method_version: str
    session_id: str
    parcel_id: str
    run_id: str | None = None  # the cloud's registration run (cloud.json)
    measurements: list[ReportMeasurement] = Field(default_factory=list)


def load_reports(out_dir: Path, required: bool = True) -> list[tuple[Path, ReportFile]]:
    """Reports in out_dir with the LidarReport header; other JSON files are left alone."""
    out_dir = Path(out_dir)
    if not out_dir.is_dir():
        raise LidarUploadError(f"{out_dir}: not a folder")
    reports = []
    for path in sorted(out_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise LidarUploadError(f"{path.name}: {exc}") from exc
        if not (isinstance(data, dict) and "producer" in data and "measurements" in data):
            continue
        try:
            reports.append((path, ReportFile.model_validate(data)))
        except ValidationError as exc:
            raise LidarUploadError(f"{path.name}: not a LiDAR report: {exc}") from exc
    if not reports and required:
        raise LidarUploadError(f"{out_dir}: no LiDAR reports (crown.json, skeleton.json, ...)")
    return reports


# --- world cloud --------------------------------------------------------------------------


def load_world(out_dir: Path):
    """world.json of the folder (WorldReport) if it has one; its world.owc must match it."""
    from .world import WORLD_FILE, WORLD_META_FILE, WorldReport

    meta = Path(out_dir) / WORLD_META_FILE
    if not meta.is_file():
        return None
    try:
        world = WorldReport.model_validate(json.loads(meta.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:
        raise LidarUploadError(f"{WORLD_META_FILE}: {exc}") from exc
    data = Path(out_dir) / WORLD_FILE
    if not data.is_file():
        raise LidarUploadError(f"{WORLD_META_FILE} without its {WORLD_FILE}")
    if sha256_file(data) != world.sha256 or data.stat().st_size != world.byte_size:
        raise LidarUploadError(f"{WORLD_FILE} does not match {WORLD_META_FILE} (rerun lidar world)")
    return world


def world_asset_row(
    world, org_id: str, parcel_id: str, session_id: str, registration_id: str | None = None
) -> dict[str, Any]:
    """public.asset row of a world cloud (kind world_cloud; no time, docs/arayuzler.md)."""
    h = world.header
    key = media_key(org_id, parcel_id, world.sha256)
    pose: dict[str, Any] = {
        "schema": h["schema"],
        "point_count": h["point_count"],
        "crs": "local_enu",
    }
    if registration_id is not None:
        pose["registration_id"] = registration_id
    return {
        "org_id": org_id,
        "parcel_id": parcel_id,
        "session_id": session_id,
        "kind": "world_cloud",
        "tree_id": None,
        "uri": media_uri(key),
        "content_hash": world.sha256,
        "byte_size": world.byte_size,
        "mime_type": world.media_type,
        # The origin of the local frame the positions are in; its uncertainty is the
        # registration's point sigma.
        "position": f"SRID=4326;POINT({h['origin_lon']!r} {h['origin_lat']!r})",
        "position_uncertainty_m": world.origin_sigma_m,
        "pose": pose,
        "quality_score": None,
        "pipeline": world.producer.pipeline,
        "pipeline_version": world.producer.version,
        "params_hash": world.producer.params_hash,
    }


def check_world(world, session_id: str) -> None:
    if world.header.get("session_id") != session_id:
        raise LidarUploadError(
            f"world.owc is for session {world.header.get('session_id')}, not {session_id}"
        )


def upload_world(
    out_dir: Path,
    world,
    session_id: str,
    catalog,
    store: MediaStore,
    log: Callable[[str], None] = print,
    registration_id: str | None = None,
) -> bool:
    """Object, then row (upload.upload_run's order). True if the row was created.

    catalog: session(), world_clouds() and insert_asset() (WorldCatalog). The row is
    already recorded when one with the same content, pipeline version and
    registration exists; a new registration run of the same cloud gets its own row.
    """
    from .world import WORLD_FILE

    check_world(world, session_id)
    session = catalog.session(session_id)
    if world.header.get("parcel_id") != session.parcel_id:
        raise LidarUploadError(
            f"world.owc parcel {world.header.get('parcel_id')} differs from the session's "
            f"{session.parcel_id}"
        )
    key = media_key(session.org_id, session.parcel_id, world.sha256)
    prefix = key.rsplit("/", 1)[0]
    if key not in store.keys(prefix):
        store.put(key, Path(out_dir) / WORLD_FILE, world.media_type)
    recorded = catalog.world_clouds(session.id)
    if (world.sha256, world.producer.version, registration_id) in recorded:
        log(f"world cloud: already recorded ({world.header['point_count']} points)")
        return False
    catalog.insert_asset(
        world_asset_row(world, session.org_id, session.parcel_id, session.id, registration_id)
    )
    log(f"world cloud: recorded ({world.header['point_count']} points, {world.byte_size} bytes)")
    return True


# --- registered cloud (staff only) -------------------------------------------------------

CLOUD_SCHEMA = "orchados.lidar_cloud/1"
PLY_MEDIA_TYPE = "application/x-ply"


def load_cloud(folder: Path, report) -> tuple[Any, int] | None:
    """(CloudMeta, point count) of a registration run folder's cloud, None without one.
    The cloud must be the run's (cloud.json run_id and session)."""
    from .cloud import CloudError, ply_point_count
    from .models import CloudMeta

    folder = Path(folder)
    ply, meta_path = folder / "cloud.ply", folder / "cloud.json"
    if not (ply.is_file() and meta_path.is_file()):
        return None
    try:
        meta = CloudMeta.model_validate(json.loads(meta_path.read_text(encoding="utf-8")))
        count = ply_point_count(ply)
    except (OSError, ValueError, CloudError) as exc:
        raise LidarUploadError(f"{folder.name}: registered cloud: {exc}") from exc
    if meta.run_id != report.run_id:
        raise LidarUploadError(
            f"cloud.json was made by registration run {str(meta.run_id)[:8]}, the folder's "
            f"registration.json is run {report.run_id[:8]}"
        )
    if meta.session_id != report.session_id or meta.parcel_id != report.parcel_id:
        raise LidarUploadError("cloud.json is of another session or parcel than its registration")
    return meta, count


def cloud_asset_rows(
    folder: Path,
    meta,
    point_count: int,
    report,
    org_id: str,
    parcel_id: str,
    session_id: str,
    registration_id: str,
) -> list[tuple[Path, dict[str, Any]]]:
    """(file, public.asset row) of cloud.ply (point_cloud) and its cloud.json (other)."""
    folder = Path(folder)
    common = {
        "org_id": org_id,
        "parcel_id": parcel_id,
        "session_id": session_id,
        "tree_id": None,
        "quality_score": None,
        "pipeline": report.producer.pipeline,
        "pipeline_version": report.producer.version,
        "params_hash": report.params_hash,
    }
    out = []
    for name, kind, mime in (
        ("cloud.ply", "point_cloud", PLY_MEDIA_TYPE),
        ("cloud.json", "other", "application/json"),
    ):
        path = folder / name
        sha = sha256_file(path)
        row = {
            **common,
            "kind": kind,
            "uri": media_uri(media_key(org_id, parcel_id, sha)),
            "content_hash": sha,
            "byte_size": path.stat().st_size,
            "mime_type": mime,
        }
        if kind == "point_cloud":
            row["position"] = f"SRID=4326;POINT({meta.origin_lon!r} {meta.origin_lat!r})"
            row["position_uncertainty_m"] = meta.point_sigma_m
            row["pose"] = {
                "schema": CLOUD_SCHEMA,
                "point_count": point_count,
                "crs": "local_enu",
                "registration_id": registration_id,
                "origin": {
                    "lat": meta.origin_lat,
                    "lon": meta.origin_lon,
                    "height_m": meta.origin_height_m,
                },
            }
        else:
            row["position"] = None
            row["position_uncertainty_m"] = None
            row["pose"] = {
                "schema": CLOUD_SCHEMA,
                "registration_id": registration_id,
                "role": "cloud_meta",
            }
        out.append((path, row))
    return out


def upload_cloud(
    plan: UploadPlan,
    catalog,
    store: MediaStore,
    registration_id: str,
    log: Callable[[str], None] = print,
) -> bool:
    """cloud.ply and cloud.json of the registration run: objects, then rows. True if a
    row was created; rows already recorded (same content in the session) are left."""
    meta, count = plan.cloud
    session = catalog.session(plan.session_id)
    rows = cloud_asset_rows(
        plan.registration_dir, meta, count, plan.registration, session.org_id,
        session.parcel_id, session.id, registration_id,
    )  # fmt: skip
    created = False
    for path, row in rows:
        key = row["uri"].removeprefix("storage://media/")
        if key not in store.keys(key.rsplit("/", 1)[0]):
            store.put(key, path, row["mime_type"])
        if row["content_hash"] in catalog.asset_hashes(session.id, row["kind"]):
            continue
        catalog.insert_asset(row)
        created = True
    size = rows[0][1]["byte_size"]
    log(
        f"registered cloud: {'recorded' if created else 'already recorded'} "
        f"({count} points, {size} bytes)"
    )
    return created


class WorldCatalog(SupabaseCatalog):
    """upload.SupabaseCatalog plus the world clouds and LiDAR assets of a session."""

    def asset_hashes(self, session_id: str, kind: str) -> set[str]:
        rows = self.client.select(
            "asset",
            {"session_id": f"eq.{session_id}", "kind": f"eq.{kind}", "select": "content_hash"},
        )
        return {r["content_hash"] for r in rows}

    def world_clouds(self, session_id: str) -> set[tuple[str, str, str | None]]:
        """(content_hash, pipeline_version, pose.registration_id) of its world_cloud rows."""
        rows = self.client.select(
            "asset",
            {
                "session_id": f"eq.{session_id}",
                "kind": "eq.world_cloud",
                "select": "content_hash,pipeline_version,pose",
            },
        )
        return {
            (r["content_hash"], r["pipeline_version"], (r.get("pose") or {}).get("registration_id"))
            for r in rows
        }


def cloud_start(folder: Path, session_id: str) -> str | None:
    """gps_time_start_ns of <folder>/cloud.json as ISO time, if it is the session's cloud."""
    try:
        meta = json.loads((Path(folder) / "cloud.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict) or meta.get("session_id") != session_id:
        return None
    start = meta.get("gps_time_start_ns")
    return gps_ns_to_iso(start) if isinstance(start, int) else None


def scan_start(out_dir: Path, session_id: str) -> str | None:
    """Start of the scan from <session>/lidar/cloud.json for <session>.processed/lidar."""
    processed = Path(out_dir).resolve().parent
    if not processed.name.endswith(".processed"):
        return None
    session = processed.with_name(processed.name.removesuffix(".processed"))
    return cloud_start(session / "lidar", session_id)


# --- registration -------------------------------------------------------------------------


def is_registration_folder(folder: Path) -> bool:
    """True if folder is a `lidar register` run folder (registration.json of the schema)."""
    try:
        body = json.loads((Path(folder) / REGISTRATION_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(body, dict) and body.get("schema") == REGISTRATION_SCHEMA


def load_registration(folder: Path):
    """registration.json of a run folder (RegistrationReport)."""
    from .models import RegistrationReport

    path = Path(folder) / REGISTRATION_FILE
    if not path.is_file():
        raise LidarUploadError(f"{folder}: no {REGISTRATION_FILE} (not a registration run folder)")
    try:
        return RegistrationReport.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, ValueError) as exc:  # ValidationError is a ValueError
        raise LidarUploadError(f"{path}: {exc}") from exc


def registration_payload(report) -> dict[str, Any]:
    """record_lidar_registration()'s p_payload: the registration.json subset."""
    ppk = report.ppk_status if report.ppk_status in PPK_STATUSES else "no_ppk"
    return {
        "run_id": report.run_id,
        "session_id": report.session_id,
        "parcel_id": report.parcel_id,
        "method": report.method,
        "method_version": report.method_version,
        "params_hash": report.params_hash,
        "ppk_status": ppk,
        "metrics": report.metrics,
        "verdict": report.verdict,
        "reasons": list(report.reasons),
    }


def build_payload(
    reports: list[tuple[Path, ReportFile]],
    session_id: str,
    measured_at: str | None = None,
    *,
    registration_id: str | None = None,
    allow_unregistered: bool = False,
) -> dict[str, Any]:
    """record_lidar_measurements()'s p_payload from the reports of one session.

    Measurements name the registration run their cloud came from; without one
    (registration_id None) they are refused unless allow_unregistered (demo and
    synthetic data).
    """
    if registration_id is None and reports and not allow_unregistered:
        raise LidarUploadError(UNREGISTERED)
    parcels = {r.parcel_id for _, r in reports}
    if len(parcels) > 1:
        raise LidarUploadError(f"reports of more than one parcel: {', '.join(sorted(parcels))}")
    items: list[dict[str, Any]] = []
    for path, rep in reports:
        if rep.session_id != session_id:
            raise LidarUploadError(
                f"{path.name} is for session {rep.session_id}, not {session_id}"
                + (
                    " (a pruning report belongs to the scan after pruning)"
                    if rep.method == "lidar_pruning"
                    else ""
                )
            )
        for m in rep.measurements:
            item: dict[str, Any] = {
                "tree_id": m.tree_id,
                "slot_code": m.slot_code,
                "metric": m.metric,
                "value_numeric": m.value_numeric,
                "value_category": m.value_category,
                "unit": m.unit,
                "uncertainty": m.uncertainty,
                "confidence": m.confidence,
                "method": m.method,
                "method_version": m.method_version,
                "params_hash": rep.producer.params_hash,
            }
            items.append({k: v for k, v in item.items() if v is not None})
    payload: dict[str, Any] = {"items": items}
    if measured_at:
        payload["measured_at"] = measured_at
    if registration_id is not None:
        payload["registration_id"] = registration_id
    return payload


def check_payload(payload: dict[str, Any]) -> list[str]:
    """Problems the database would refuse the payload for (empty: none found)."""
    problems: list[str] = []
    for item in payload["items"]:
        where = f"{item.get('slot_code') or item['tree_id']} {item['metric']}"
        try:
            uuid.UUID(item["tree_id"])
        except ValueError:
            problems.append(f"{where}: tree id {item['tree_id']!r} is not a database id")
        method, metric = item["method"], item["metric"]
        if metric not in METHOD_METRICS.get(method, ()):
            problems.append(f"{where}: not a metric of LiDAR method {method}")
            continue
        num, cat = item.get("value_numeric"), item.get("value_category")
        if num is None and cat is None:
            continue  # not measured; the database lists it as skipped
        if metric in CATEGORIES:
            if num is not None or cat not in CATEGORIES[metric]:
                problems.append(f"{where}: expects one of {', '.join(sorted(CATEGORIES[metric]))}")
        else:
            unc = item.get("uncertainty")
            if cat is not None or not math.isfinite(num):
                problems.append(f"{where}: expects a finite number")
            elif unc is None or not math.isfinite(unc) or unc < 0:
                problems.append(f"{where}: a numeric value needs an uncertainty")
    return problems


def summary_lines(result: dict[str, Any]) -> list[str]:
    lines = [
        f"LiDAR measurements: {result.get('created', 0)} created, "
        f"{result.get('existing', 0)} already recorded"
    ]
    skipped = result.get("skipped") or []
    if skipped:
        lines.append(f"{len(skipped)} not measured (no value), not recorded:")
        lines.extend(f"  {s.get('tree_id')} {s.get('metric')}" for s in skipped)
    return lines


# --- the upload ----------------------------------------------------------------------------


@dataclass
class UploadPlan:
    """What an upload of one output folder records, checked before signing in."""

    out_dir: Path
    session_id: str
    registration: Any = None  # RegistrationReport
    registration_dir: Path | None = None
    reports: list[tuple[Path, ReportFile]] = field(default_factory=list)
    world: Any = None  # WorldReport
    # (CloudMeta, point count) of the registration run's cloud.ply, kept as a
    # point_cloud asset; None: no cloud (or no registration, or rejected).
    cloud: tuple[Any, int] | None = None
    # record_lidar_measurements payload; registration_id is REGISTRATION_PLACEHOLDER
    # until the registration is recorded. None: no measurements (rejected registration).
    payload: dict[str, Any] | None = None
    # Outputs left out because the registration was rejected (file names).
    withheld: list[str] = field(default_factory=list)

    @property
    def rejected(self) -> bool:
        return self.registration is not None and self.registration.verdict == "rejected_auto"


def plan_upload(
    out_dir: Path,
    session_id: str,
    registration: Path | None = None,
    allow_unregistered: bool = False,
) -> UploadPlan:
    """Reads and checks everything an upload records (LidarUploadError if it cannot)."""
    from .world import WORLD_FILE, WORLD_META_FILE

    out_dir = Path(out_dir)
    if registration is None and is_registration_folder(out_dir):
        registration = out_dir
    plan = UploadPlan(out_dir, session_id)
    if registration is not None:
        if allow_unregistered:
            raise LidarUploadError(
                f"{registration} is a registration run; --allow-unregistered does not apply"
            )
        plan.registration_dir = Path(registration)
        plan.registration = rep = load_registration(registration)
        if rep.session_id != session_id:
            raise LidarUploadError(
                f"{REGISTRATION_FILE} is for session {rep.session_id}, not {session_id}"
            )
        if plan.rejected:
            names = [p.name for p, _ in load_reports(out_dir, required=False)]
            names += [n for n in (WORLD_META_FILE, WORLD_FILE) if (out_dir / n).is_file()]
            plan.withheld = names
            return plan
    if plan.registration is not None:
        plan.cloud = load_cloud(plan.registration_dir, plan.registration)
    plan.world = load_world(out_dir)
    plan.reports = load_reports(out_dir, required=plan.world is None and registration is None)
    if plan.registration is None and not allow_unregistered and (plan.reports or plan.world):
        raise LidarUploadError(UNREGISTERED)
    if plan.world is not None:
        check_world(plan.world, session_id)
    check_run_ids(plan)
    if plan.registration is not None:
        parcel = plan.registration.parcel_id
        for path, rep in plan.reports:
            if rep.parcel_id != parcel:
                raise LidarUploadError(f"{path.name} is of parcel {rep.parcel_id}, not {parcel}")
        if plan.world is not None and plan.world.header.get("parcel_id") != parcel:
            raise LidarUploadError(
                f"{WORLD_FILE} is of parcel {plan.world.header.get('parcel_id')}, not {parcel}"
            )
    measured_at = None
    if plan.registration_dir is not None:
        measured_at = cloud_start(plan.registration_dir, session_id)
    plan.payload = build_payload(
        plan.reports,
        session_id,
        measured_at or scan_start(out_dir, session_id),
        registration_id=REGISTRATION_PLACEHOLDER if plan.registration is not None else None,
        allow_unregistered=allow_unregistered,
    )
    return plan


def check_run_ids(plan: UploadPlan) -> None:
    """Every report and the world cloud must come from the cloud of the registration run
    being recorded (their run_id, from cloud.json). Without a registration
    (--allow-unregistered) none may name a run: those go up with their registration."""
    from .world import WORLD_META_FILE

    items = [(path.name, rep.run_id) for path, rep in plan.reports]
    if plan.world is not None:
        items.append((WORLD_META_FILE, plan.world.run_id))
    reg = plan.registration
    for name, run_id in items:
        if reg is None:
            if run_id is not None:
                raise LidarUploadError(
                    f"{name} was made from registration run {run_id[:8]}: upload it with "
                    "--registration <that run folder>"
                )
        elif run_id is None:
            raise LidarUploadError(
                f"{name} names no registration run (made from another cloud than run "
                f"{reg.run_id[:8]}'s; rerun the stage with --cloud <run folder>)"
            )
        elif run_id != reg.run_id:
            raise LidarUploadError(
                f"{name} was made from registration run {run_id[:8]}, not {reg.run_id[:8]} "
                "(rerun the stage with --cloud <run folder>)"
            )


def dry_run_lines(plan: UploadPlan) -> list[str]:
    """Every payload of the plan as JSON, with what would be written."""
    sid, lines = plan.session_id, []
    if plan.registration is not None:
        body = {"p_session_id": sid, "p_payload": registration_payload(plan.registration)}
        lines.append(json.dumps({"rpc": REGISTRATION_RPC, **body}, indent=2))
        lines.append(f"dry run: registration {plan.registration.verdict}, nothing written")
    if plan.rejected:
        withheld = f" ({', '.join(plan.withheld)})" if plan.withheld else ""
        lines.append(f"dry run: rejected registration, its results would not be uploaded{withheld}")
        return lines
    if plan.payload is not None:
        names = ", ".join(p.name for p, _ in plan.reports) or "no reports"
        body = {"p_session_id": sid, "p_payload": plan.payload}
        lines.append(json.dumps({"rpc": RPC, **body}, indent=2))
        lines.append(
            f"dry run: {len(plan.payload['items'])} measurements from {names}, nothing written"
        )
    if plan.world is not None:
        reg = REGISTRATION_PLACEHOLDER if plan.registration is not None else None
        row = world_asset_row(plan.world, "<org_id>", "<parcel_id>", sid, reg)
        lines.append(json.dumps({"world_cloud_asset": row}, indent=2))
        lines.append(f"dry run: world cloud {plan.world.byte_size} bytes, nothing uploaded")
    if plan.cloud is not None:
        meta, count = plan.cloud
        ply, js = cloud_asset_rows(
            plan.registration_dir, meta, count, plan.registration, "<org_id>", "<parcel_id>",
            sid, REGISTRATION_PLACEHOLDER,
        )  # fmt: skip
        lines.append(json.dumps({"point_cloud_asset": ply[1]}, indent=2))
        lines.append(json.dumps({"cloud_meta_asset": js[1]}, indent=2))
        lines.append(f"dry run: registered cloud {ply[1]['byte_size']} bytes, nothing uploaded")
    return lines


def registration_status(client, registration_id: str) -> str | None:
    rows = client.select("lidar_registration", {"id": f"eq.{registration_id}", "select": "status"})
    return rows[0]["status"] if rows else None


def upload(
    client,
    plan: UploadPlan,
    log: Callable[[str], None] = print,
    catalog=None,
    store: MediaStore | None = None,
) -> dict[str, Any] | None:
    """Records the plan as the signed-in user: registration, measurements, world cloud.

    Returns record_lidar_measurements()' summary (None when nothing was measured).
    """
    sid = plan.session_id
    registration_id = None
    if plan.registration is not None:
        rep = plan.registration
        registration_id = client.rpc(
            REGISTRATION_RPC, {"p_session_id": sid, "p_payload": registration_payload(rep)}
        )
        if not isinstance(registration_id, str):
            raise LidarUploadError(f"{REGISTRATION_RPC} returned {registration_id!r}")
        status = registration_status(client, registration_id)
        log(
            f"LiDAR registration {registration_id}: run {rep.run_id[:8]}, {rep.verdict}"
            + (f", {status}" if status else "")
        )
        if plan.rejected or status == "rejected":
            withheld = f" ({', '.join(plan.withheld)})" if plan.withheld else ""
            log(f"registration rejected: measurements and world cloud not uploaded{withheld}")
            return None
    result = None
    if plan.payload is not None and plan.payload["items"]:
        payload = dict(plan.payload)
        if registration_id is not None:
            payload["registration_id"] = registration_id
        result = client.rpc(RPC, {"p_session_id": sid, "p_payload": payload})
    if plan.world is not None or plan.cloud is not None:
        from ..media import SupabaseMediaStore

        catalog = catalog if catalog is not None else WorldCatalog(client)
        store = store if store is not None else SupabaseMediaStore(client)
    if plan.world is not None:
        upload_world(plan.out_dir, plan.world, sid, catalog, store, log, registration_id)
    if plan.cloud is not None:
        upload_cloud(plan, catalog, store, registration_id, log)
    if result is not None:
        for line in summary_lines(result):
            log(line)
    return result


def run(
    out_dir: Path,
    session_id: str,
    dry_run: bool = False,
    env: dict[str, str] | None = None,
    log: Callable[[str], None] = print,
    registration: Path | None = None,
    allow_unregistered: bool = False,
) -> int:
    """`lidar upload`: 0 done (or dry run), 1 refused or failed."""
    from ..supabase import Credentials, SupabaseClient, SupabaseError

    try:
        plan = plan_upload(out_dir, session_id, registration, allow_unregistered)
    except LidarUploadError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    problems = check_payload(plan.payload) if plan.payload is not None else []
    if dry_run:
        for line in dry_run_lines(plan):
            log(line)
    for p in problems:
        print(f"error: {p}", file=sys.stderr)
    if problems or dry_run:
        return 1 if problems else 0
    try:
        with SupabaseClient.sign_in(Credentials.from_env(env)) as client:
            upload(client, plan, log)
    except (SupabaseError, LidarUploadError, UploadError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0
