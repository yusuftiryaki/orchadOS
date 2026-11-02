"""The demo dataset as one SQL transaction (docs/demo-turu.md §8.3, §10.2).

Insert order (no notification is ever queued):

    1 personas, org, memberships
    2 device, sensors, rig, calibration
    3 parcels
    4 sessions, inserted as published / approved (no status update)
    4b boundaries, slots, trees, zones: after the sessions, since a boundary and a
       tree name the inventory visit (foreign keys)
    5 inventory chain, captures, assets, lineage
    6 measurements, assessments, findings and their evidence (and the field
       question weed_height)
    6b service layer: the billing setting with services_enabled, the weed mowing
       catalogue row (no price: the demo org has no price list) and its season per
       fruit species, the done job of parcel B (operation, request, history, proof
       photos) and the robot notes (docs/MVP.md Module 6; dataset version 2)
    7 viewer profile, parcel_access
    8 questions and replies, under their authors' claims
    9 the registry row (loaded_at null), when private.demo_org exists

Captures, assets, lineage, the coverage report and the presence measurements
come from upload.upload_run() over the build's run folders with an SQL-emitting
Catalog (SqlCatalog), so the pipeline's row builders and ordering are used as
they are. Every insert names its conflict target: a second run inserts nothing,
and a (session_id, content_hash) collision fails instead of being swallowed.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from ..geo import LocalFrame, bearing_deg, wrap180
from ..media import media_key, media_uri
from ..upload import SessionRow, UploadOptions, upload_run
from . import ids
from .build import frame_pose
from .dataset import (
    CAMERA_HEIGHT_M,
    DATASET_VERSION,
    DEMO_SPECIES,
    FIELD_PROTOCOL,
    FIELD_QUESTION_METHOD,
    METHODOLOGY,
    PRICING_RULE,
    QUESTIONS,
    ROBOT_NOTES,
    SEASON_OF_MONTH,
    SERVICE_JOBS,
    SERVICE_SEASON,
    SERVICE_TERMS_VERSION,
    SERVICE_TYPE,
    SERVICES_VERSION,
    UNSURE_LABELS,
    VERIFICATION,
    WEED_HEIGHTS,
    ZONES,
    Dataset,
    ServiceJob,
    Visit,
    inventory_values,
    tree_values,
)

STEPS = (
    "personas",
    "acquisition",
    "parcels",
    "sessions",
    "layout",
    "chain",
    "results",
    "services",
    "access",
    "questions",
    "registry",
)
STATION = "orchados-demo"
TOKEN_COLUMNS = (
    "confirmation_token",
    "recovery_token",
    "email_change_token_new",
    "email_change",
    "email_change_token_current",
    "phone_change",
    "phone_change_token",
    "reauthentication_token",
)
BANNED_UNTIL = "2999-01-01 00:00:00+00"


class Raw(str):
    """An SQL expression, written as is."""


def lit(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, Raw):
        return str(v)
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if not math.isfinite(v):
            raise ValueError(f"not a finite number: {v}")
        return repr(v)
    if isinstance(v, datetime):
        return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list, tuple)):
        return (
            "'" + json.dumps(v, ensure_ascii=False, sort_keys=True).replace("'", "''") + "'::jsonb"
        )
    return "'" + str(v).replace("'", "''") + "'"


@dataclass
class Statement:
    table: str
    columns: tuple[str, ...]
    rows: list[tuple]
    conflict: str
    prefix: str = ""  # SQL run before (role and claims)
    suffix: str = ""

    def sql(self) -> str:
        values = ",\n  ".join("(" + ", ".join(lit(v) for v in r) + ")" for r in self.rows)
        return (
            f"\\echo @insert {self.table}\n{self.prefix}"
            f"insert into {self.table} ({', '.join(self.columns)}) values\n  {values}\n"
            f"on conflict ({self.conflict}) do nothing;\n{self.suffix}"
        )


@dataclass
class Script:
    """Statements by step; rows of one table and step are batched."""

    steps: dict[str, list[Statement]] = field(default_factory=lambda: {s: [] for s in STEPS})
    raw: dict[str, list[str]] = field(default_factory=lambda: {s: [] for s in STEPS})

    def insert(self, step: str, table: str, row: dict[str, Any], conflict: str = "id") -> None:
        """Add a row. Rows of a table join that table's open statement in the step:
        a table's rows then come before those of any table first used after it,
        which keeps the foreign key order."""
        cols = tuple(row)
        for st in reversed(self.steps[step]):
            if (
                st.table == table
                and st.columns == cols
                and st.conflict == conflict
                and not st.prefix
            ):
                if len(st.rows) < 500:
                    st.rows.append(tuple(row.values()))
                    return
                break
        self.steps[step].append(Statement(table, cols, [tuple(row.values())], conflict))

    def statement(self, step: str, st: Statement) -> None:
        self.steps[step].append(st)

    def sql(self, header: str = "") -> str:
        out = [header] if header else []
        for s in STEPS:
            out.append(f"-- step: {s}")
            # A table's statements together, tables in the order they were first used.
            first: dict[str, int] = {}
            for i, st in enumerate(self.steps[s]):
                first.setdefault(st.table, i)
            out += [st.sql() for st in sorted(self.steps[s], key=lambda st: first[st.table])]
            out += self.raw[s]
        return "\n".join(out) + "\n"

    def count(self, table: str | None = None) -> int:
        return sum(
            len(st.rows)
            for sts in self.steps.values()
            for st in sts
            if table is None or st.table == table
        )


# ---------------------------------------------------------------------------------------
# Metric registry
# ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Metric:
    id: str
    code: str
    value_type: str
    valid_seasons: tuple[str, ...]
    card_visibility: str
    subject_kinds: tuple[str, ...]


def metric_id_fallback(code: str) -> str:
    """Id rule of 20261021180000_metric_registry.sql: md5('orchados-seed:metric:' || code)."""
    import hashlib
    import uuid

    return str(uuid.UUID(hashlib.md5(f"orchados-seed:metric:{code}".encode()).hexdigest()))


# What the database had when this was written; tests use it without a database.
FALLBACK_METRICS = {
    code: Metric(metric_id_fallback(code), code, vt, tuple(seasons), vis, ("tree",))
    for code, vt, seasons, vis in (
        ("basal_sprout_level", "category", ("winter", "spring", "summer", "harvest"), "shown"),
        ("crown_density_scale", "scale", ("spring", "summer"), "shown"),
        ("dead_branch_scale", "scale", ("winter", "spring", "summer", "harvest"), "shown"),
        ("dieback_pattern", "category", ("winter", "spring", "summer", "harvest"), "shown"),
        ("dried_leaves_attached", "boolean", ("spring", "summer", "harvest"), "shown"),
        ("fruit_load_scale", "scale", ("summer",), "shown"),
        ("pest_sign_severity", "category", ("spring", "summer"), "shown"),
        ("pest_sign_type", "category", ("spring", "summer"), "shown"),
        ("trunk_base_scale", "scale", ("winter", "spring", "summer", "harvest"), "shown"),
        ("tree_visible", "category", ("winter", "spring", "summer", "harvest"), "hidden"),
    )
}
FALLBACK_METRICS["weed_height"] = Metric(
    metric_id_fallback("weed_height"),
    "weed_height",
    "category",
    ("spring", "summer"),
    "shown",
    ("parcel",),
)


def portal_codes(metrics: dict[str, Metric], season: str) -> list[str]:
    """Tree metrics the report card shows and the crew scores by eye, valid in the season.

    The portal reads every shown metric (metrics.ts) and the dimension codes
    (dimensions.ts); numeric instrument metrics (crown_diameter, trunk_diameter_h30,
    ...) need sensors the demo kit does not have.
    """
    return sorted(
        m.code
        for m in metrics.values()
        if m.card_visibility == "shown"
        and "tree" in m.subject_kinds
        and m.value_type != "numeric"
        and season in m.valid_seasons
    )


# ---------------------------------------------------------------------------------------
# Catalog for upload_run
# ---------------------------------------------------------------------------------------


class SqlCatalog:
    """upload.Catalog that writes SQL instead of calling PostgREST."""

    def __init__(
        self,
        script: Script,
        ds: Dataset,
        visit: Visit,
        keys: dict[str, str],
        metrics: dict[str, Metric],
    ):
        self.script = script
        self.ds = ds
        self.visit = visit
        self.keys = keys  # sha256 -> file key
        self.metrics = metrics
        self.asset_rows: dict[str, dict] = {}  # asset id -> row
        self.presence: dict[str, str] = {}  # tree id -> measurement id

    def session(self, session_id: str) -> SessionRow:
        v = self.visit
        return SessionRow(
            id=v.id,
            org_id=ids.ORG_ID,
            parcel_id=v.parcel.id,
            status=v.status,
            started_at=v.start.isoformat(),
            rig_id=RIG,
            scan_platform="walk",
            camera_height_m=CAMERA_HEIGHT_M,
        )

    def active_trees(self, parcel_id: str) -> dict[str, str]:
        return {t.code: t.id for t in self.ds.trees[self.visit.parcel.key]}

    def empty_slots(self, parcel_id: str) -> dict[str, str]:
        taken = {t.code for t in self.ds.trees[self.visit.parcel.key]}
        return {s.code: s.id for s in self.ds.slots[self.visit.parcel.key] if s.code not in taken}

    def captures(self, session_id: str) -> dict[str, str]:
        return {}

    def insert_capture(self, row: dict[str, Any]) -> str:
        cid = ids.did("capture", f"{self.visit.key}:{row['metadata']['path']}")
        row = {
            "id": cid,
            **row,
            "sensor_id": SENSOR_CAM if row["kind"] == "video_360" else SENSOR_GNSS,
            "calibration_id": CALIBRATION,
            "captured_by": ids.FIELD,
        }
        self.script.insert("chain", "public.capture", row)
        return cid

    def assets(self, session_id: str, pipeline_version: str) -> dict[str, str]:
        return {}

    def insert_asset(self, row: dict[str, Any]) -> str:
        key = self.keys[row["content_hash"]]
        aid = ids.did("asset", key)
        row = {"id": aid, **row, "produced_at": self.visit.end + timedelta(hours=3)}
        self.script.insert("chain", "public.asset", row)
        self.asset_rows[aid] = row
        return aid

    def asset_sources(self, asset_ids: list[str]) -> set:
        return set()

    def insert_asset_sources(self, rows: list[dict[str, Any]]) -> None:
        for r in rows:
            src = r["source_capture_id"] or r["source_asset_id"]
            self.script.insert(
                "chain",
                "public.asset_source",
                {"id": ids.did("asset_source", f"{r['asset_id']}:{src}"), **r},
            )

    def mark_processed(self, session_id: str, from_statuses: Iterable[str]) -> str:
        return self.visit.status

    def record_scan_setup(self, session_id: str, values: dict[str, Any]) -> None:
        raise AssertionError(f"the visit row already has its scan setup: {values}")

    def record_coverage(self, session_id: str, report: dict[str, Any]) -> dict[str, Any]:
        rid = ids.did("coverage_report", self.visit.key)
        self.script.insert(
            "chain",
            "public.coverage_report",
            {
                "id": rid,
                "org_id": ids.ORG_ID,
                "parcel_id": self.visit.parcel.id,
                "session_id": self.visit.id,
                "pipeline": report["pipeline"],
                "pipeline_version": report["pipeline_version"],
                "params_hash": report["params_hash"],
                "active_trees": report["active_trees"],
                "covered_trees": report["covered_trees"],
                "threshold": report["threshold"],
                "blind_spots": report["blind_spots"],
                "missing_slot_codes": Raw(_text_array(report["missing_slot_codes"])),
                "blind_spot_cells": report["blind_spot_cells"],
                "rule": report["rule"],
                "created_by": ids.OPS,
                "created_at": self.visit.end + timedelta(hours=4),
            },
        )
        passed = report["covered_trees"] / report["active_trees"] >= report["threshold"]
        return {
            "report_id": rid,
            "created": True,
            "passed": passed,
            "rescan_needed": not passed or report["blind_spots"] > 0,
        }

    def rescan_request(self, session_id: str) -> dict[str, Any] | None:
        return None

    def record_presence(self, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        metric = self.metrics["tree_visible"]
        for item in payload["items"]:
            tid = item["tree_id"]
            mid = ids.did("measurement", f"{self.visit.key}:{tid}:tree_visible")
            self.presence[tid] = mid
            self.script.insert(
                "results",
                "public.measurement",
                {
                    "id": mid,
                    "org_id": ids.ORG_ID,
                    "parcel_id": self.visit.parcel.id,
                    "tree_id": tid,
                    "metric_definition_id": metric.id,
                    "value_scale": None,
                    "value_category": item["value"],
                    "value_boolean": None,
                    "uncertainty": None,
                    "confidence": 0.9,
                    "method": payload["method"],
                    "method_version": payload["method_version"],
                    "params_hash": payload["params_hash"],
                    "source": "algorithm",
                    "session_id": self.visit.id,
                    "measured_at": payload["measured_at"],
                    "recorded_by": ids.OPS,
                },
            )
            for aid in item["evidence_asset_ids"]:
                self.script.insert(
                    "results",
                    "public.measurement_evidence",
                    {
                        "org_id": ids.ORG_ID,
                        "parcel_id": self.visit.parcel.id,
                        "measurement_id": mid,
                        "asset_id": aid,
                    },
                    conflict="measurement_id, asset_id",
                )
        return {"created": len(payload["items"]), "existing": 0}


def _text_array(values: list[str]) -> str:
    return "array[" + ", ".join(lit(v) for v in values) + "]::text[]" if values else "'{}'::text[]"


# ---------------------------------------------------------------------------------------
# Fixed rows
# ---------------------------------------------------------------------------------------

DEVICE = ids.did("device", "kit")
SENSOR_CAM = ids.did("sensor", "camera_360")
SENSOR_GNSS = ids.did("sensor", "gnss")
RIG = ids.did("rig", "kit-pole")
CALIBRATION = ids.did("calibration", "kit-pole:v1")
CREATED = datetime.fromisoformat("2025-05-20T09:00:00+00:00")


def _point(lat: float, lon: float) -> str:
    return f"SRID=4326;POINT({lon!r} {lat!r})"


def _geom(parcel, geom) -> str:
    if isinstance(geom[0], (int, float)):
        return _point(*parcel.to_latlon(*geom))
    pts = ", ".join(f"{lon!r} {lat!r}" for lat, lon in (parcel.to_latlon(x, y) for x, y in geom))
    return f"SRID=4326;LINESTRING({pts})"


def _polygon(parcel) -> str:
    ring = list(parcel.boundary) + [parcel.boundary[0]]
    pts = ", ".join(f"{lon!r} {lat!r}" for lat, lon in (parcel.to_latlon(x, y) for x, y in ring))
    return f"SRID=4326;POLYGON(({pts}))"


def personas(script: Script) -> None:
    for pid, _role, local, name in ids.PERSONAS:
        email = ids.persona_email(local)
        script.insert(
            "personas",
            "auth.users",
            {
                "instance_id": "00000000-0000-0000-0000-000000000000",
                "id": pid,
                "aud": "authenticated",
                "role": "authenticated",
                "email": email,
                "encrypted_password": "",
                "email_confirmed_at": CREATED,
                "phone": None,
                "raw_app_meta_data": {
                    "provider": "email",
                    "providers": ["email"],
                    "demo_persona": True,
                },
                "raw_user_meta_data": {"display_name": name},
                "created_at": CREATED,
                "updated_at": CREATED,
                **{c: "" for c in TOKEN_COLUMNS},
                "banned_until": Raw(lit(BANNED_UNTIL) + "::timestamptz"),
            },
        )
    for pid, _role, local, _name in ids.PERSONAS:
        script.insert(
            "personas",
            "auth.identities",
            {
                "id": pid,
                "provider_id": pid,
                "user_id": pid,
                "identity_data": {
                    "sub": pid,
                    "email": ids.persona_email(local),
                    "email_verified": True,
                },
                "provider": "email",
                "last_sign_in_at": CREATED,
                "created_at": CREATED,
                "updated_at": CREATED,
            },
        )
    script.insert(
        "personas",
        "public.org",
        {"id": ids.ORG_ID, "name": ids.ORG_NAME, "kind": "service_provider", "created_at": CREATED},
    )
    for pid, role in ((ids.EXPERT, "expert"), (ids.FIELD, "field_staff"), (ids.OPS, "ops")):
        script.insert(
            "personas",
            "public.membership",
            {
                "id": ids.did("membership", role),
                "org_id": ids.ORG_ID,
                "user_id": pid,
                "role": role,
                "created_at": CREATED,
            },
        )


def acquisition(script: Script) -> None:
    o = ids.ORG_ID
    script.insert(
        "acquisition",
        "public.device",
        {
            "id": DEVICE,
            "org_id": o,
            "kind": "human_kit",
            "name": "Örnek kit",
            "manufacturer": "orchadOS",
            "model": "scan-kit-v0",
            "serial_number": "DEMO-KIT-1",
            "firmware_version": "0.1.0",
        },
    )
    for sid, kind, model in (
        (SENSOR_CAM, "camera_360", "360-cam"),
        (SENSOR_GNSS, "gnss", "gnss-logger"),
    ):
        script.insert(
            "acquisition",
            "public.sensor",
            {
                "id": sid,
                "org_id": o,
                "device_id": DEVICE,
                "kind": kind,
                "manufacturer": "Example",
                "model": model,
                "serial_number": f"DEMO-{kind.upper()}",
            },
        )
    script.insert(
        "acquisition",
        "public.rig",
        {
            "id": RIG,
            "org_id": o,
            "name": "Örnek kit direği",
            "description": "360 kamera ve GNSS anteni aynı direkte",
        },
    )
    for sid, mount in (
        (SENSOR_CAM, {"lever_arm_m": [0, 0, -0.15]}),
        (SENSOR_GNSS, {"lever_arm_m": [0, 0, 0]}),
    ):
        script.insert(
            "acquisition",
            "public.rig_sensor",
            {"org_id": o, "rig_id": RIG, "sensor_id": sid, "mount": mount},
            conflict="rig_id, sensor_id",
        )
    script.insert(
        "acquisition",
        "public.calibration",
        {
            "id": CALIBRATION,
            "org_id": o,
            "rig_id": RIG,
            "sensor_id": None,
            "version": "v1",
            "extrinsics": {"camera_to_antenna_m": [0, 0, 0.15]},
            "valid_from": CREATED,
        },
    )


def parcels(script: Script, ds: Dataset) -> None:
    o = ids.ORG_ID
    for p in (ds.parcel("A"), ds.parcel("B")):
        clat, clon = p.to_latlon(p.length_m / 2, p.width_m / 2)
        olat, olon = p.to_latlon(0, 0)
        script.insert(
            "parcels",
            "public.parcel",
            {
                "id": p.id,
                "org_id": o,
                "name": p.name,
                "province": "Gaziantep",
                "district": p.district,
                "village": p.village,
                "estimated_area_m2": round(p.area_m2 * 1.04),
                "irrigation": p.irrigation,
                "species": DEMO_SPECIES,
                "estimated_tree_count": p.estimated_tree_count,
                "status": "active_monitoring",
                "position": _point(clat, clon),
                "position_uncertainty_m": 30.0,
                "numbering_origin_corner": "sw",
                "row_azimuth_deg": p.row_azimuth_deg,
                "local_origin": _point(olat, olon),
                "local_origin_uncertainty_m": 0.05,
                "created_at": CREATED,
            },
        )


def boundaries(script: Script, ds: Dataset) -> None:
    """Field survey boundaries, approved by the owner. After the sessions: a boundary
    names the inventory visit it was walked on (foreign key)."""
    o = ids.ORG_ID
    for p in (ds.parcel("A"), ds.parcel("B")):
        inv = next(v for v in ds.visits if v.parcel.key == p.key and v.kind == "inventory")
        script.insert(
            "layout",
            "public.boundary",
            {
                "id": ids.did("boundary", f"{p.key}:1"),
                "org_id": o,
                "parcel_id": p.id,
                "version": 1,
                "geom": _polygon(p),
                "source": "field_survey",
                "vertex_uncertainty_m": 0.05,
                "session_id": inv.id,
                "surveyed_at": inv.start + timedelta(minutes=5),
                "owner_approved_at": inv.published_at + timedelta(days=4),
                "owner_approved_by": ids.OWNER,
                "created_by": ids.OPS,
                "created_at": inv.published_at - timedelta(days=1),
            },
        )


def layout(script: Script, ds: Dataset) -> None:
    o = ids.ORG_ID
    for p in (ds.parcel("A"), ds.parcel("B")):
        for s in ds.slots[p.key]:
            lat, lon = s.latlon
            script.insert(
                "layout",
                "public.slot",
                {
                    "id": s.id,
                    "org_id": o,
                    "parcel_id": p.id,
                    "row_no": s.row,
                    "position_no": s.pos,
                    "kind": "row",
                    "position": _point(lat, lon),
                    "position_uncertainty_m": 0.15,
                    "local_x_m": s.xy[0],
                    "local_y_m": s.xy[1],
                },
            )
    for p in (ds.parcel("A"), ds.parcel("B")):
        inv = next(v for v in ds.visits if v.parcel.key == p.key and v.kind == "inventory")
        for t in ds.trees[p.key]:
            script.insert(
                "layout",
                "public.tree",
                {
                    "id": t.id,
                    "org_id": o,
                    "parcel_id": p.id,
                    "slot_id": t.slot.id,
                    "sex": t.sex,
                    "graft": t.graft,
                    "age_class": t.age_class,
                    "cultivar": t.cultivar,
                    "status": "active",
                    "first_seen_at": inv.start + timedelta(minutes=30),
                    "first_seen_session_id": inv.id,
                    "stem_form": t.stem_form,
                },
            )
    for key, pk, kind, name, geom in ZONES:
        p = ds.parcel(pk)
        script.insert(
            "layout",
            "public.zone",
            {
                "id": zone_id(pk, key),
                "org_id": o,
                "parcel_id": p.id,
                "kind": kind,
                "name": name,
                "geom": _geom(p, geom),
                "position_uncertainty_m": 0.3,
            },
        )


def zone_id(parcel: str, key: str) -> str:
    return ids.did("zone", f"{parcel}:{key}")


def sessions(script: Script, ds: Dataset) -> None:
    for v in ds.visits:
        script.insert(
            "sessions",
            "public.session",
            {
                "id": v.id,
                "org_id": ids.ORG_ID,
                "parcel_id": v.parcel.id,
                "kind": v.kind,
                "performer": "crew",
                "status": v.status,
                "planned_date": v.day,
                "started_at": v.start,
                "ended_at": v.end,
                "methodology_version": METHODOLOGY,
                "rig_id": RIG if v.frames else None,
                "lead_user_id": ids.FIELD,
                "weather": v.weather,
                "notes": None,
                "created_by": ids.OPS,
                "created_at": v.start - timedelta(days=6),
                "published_at": v.published_at,
                "published_by": ids.EXPERT if v.published_at else None,
                "scan_platform": "walk" if v.frames else None,
                "camera_height_m": CAMERA_HEIGHT_M if v.frames else None,
            },
        )
    for job in SERVICE_JOBS:
        # As ops_schedule_service_request opens it and ops_complete_service_request
        # closes it: captured, never published (not an audit visit).
        script.insert(
            "sessions",
            "public.session",
            {
                "id": job.id,
                "org_id": ids.ORG_ID,
                "parcel_id": job.parcel.id,
                "kind": "mowing",
                "performer": "crew",
                "status": "captured",
                "planned_date": job.completed_on,
                "started_at": job.work_start,
                "ended_at": None,
                "methodology_version": None,
                "rig_id": None,
                "lead_user_id": ids.FIELD,
                "weather": None,
                "notes": f"Hizmet işi {job.number}",
                "created_by": ids.OPS,
                "created_at": job.scheduled_at,
                "published_at": None,
                "published_by": None,
                "scan_platform": None,
                "camera_height_m": None,
            },
        )


# ---------------------------------------------------------------------------------------
# Visit rows
# ---------------------------------------------------------------------------------------


@dataclass
class Context:
    ds: Dataset
    build: Path
    manifest: dict
    metrics: dict[str, Metric]
    script: Script
    catalogs: dict[str, SqlCatalog] = field(default_factory=dict)

    @property
    def keys(self) -> dict[str, str]:
        return {f["sha256"]: f["key"] for f in self.manifest["files"]}


def visit_uploads(ctx: Context) -> None:
    """Captures, assets, lineage, coverage and presence of each visit through upload_run()."""
    for run in ctx.manifest["runs"]:
        v = ctx.ds.visit(run["visit"])
        cat = SqlCatalog(ctx.script, ctx.ds, v, ctx.keys, ctx.metrics)
        opts = UploadOptions(
            kinds=frozenset({"panorama", "preview", "tree_crop"}),
            station=STATION,
            session_dir=Path("/synthetic") / v.id,
            require_db_trees=True,
        )

        class _Store:
            def keys(self, prefix: str) -> set[str]:
                return set()

            def put(self, key: str, local_path: Path, media_type: str) -> bool:
                return True

        report = upload_run(ctx.build / "runs" / v.key, v.id, cat, _Store(), opts)
        if report.warnings:
            raise RuntimeError(f"{v.key}: {report.warnings}")
        ctx.catalogs[v.key] = cat


def _assets(cat: SqlCatalog, kind: str, tree_id: str | None = None) -> list[dict]:
    return [
        r
        for r in cat.asset_rows.values()
        if r["kind"] == kind and (tree_id is None or r["tree_id"] == tree_id)
    ]


def inventory_chain(ctx: Context) -> None:
    """Trunk labels on the inventory panoramas, verification visits and their items."""
    ds, s = ctx.ds, ctx.script
    for v in ds.visits:
        if v.kind != "inventory":
            continue
        cat = ctx.catalogs[v.key]
        p = v.parcel
        frames = {f.index: f for f in v.frames if f.variants}
        panos = []
        for r in _assets(cat, "panorama"):
            gps = int(r["pose"]["gps_time_ns"])
            f = next(f for f in frames.values() if int(_gps(f.time)) == gps)
            panos.append((r, f))
        lf = LocalFrame(p.origin_lat, p.origin_lon)
        for t in ds.trees[p.key]:
            tlat, tlon = p.to_latlon(*t.xy)
            near = sorted(panos, key=lambda rf: math.dist(t.xy, (rf[1].x, rf[1].y)))[:2]
            for n, (r, f) in enumerate(near):
                pose = frame_pose(v, f)
                ce, cn = lf.to_en(pose.lat, pose.lon)
                te, tn = lf.to_en(tlat, tlon)
                az = bearing_deg(float(te - ce), float(tn - cn))
                dist = math.hypot(float(te - ce), float(tn - cn))
                s.insert(
                    "chain",
                    "public.trunk_label",
                    {
                        "id": ids.did("trunk_label", f"{v.key}:{t.code}:{n}"),
                        "org_id": ids.ORG_ID,
                        "parcel_id": p.id,
                        "session_id": v.id,
                        "panorama_asset_id": r["id"],
                        "panorama_gps_time_ns": int(r["pose"]["gps_time_ns"]),
                        "yaw_deg": round(wrap180(az - pose.heading_deg), 3),
                        "pitch_deg": round(
                            math.degrees(math.atan2(0.3 - CAMERA_HEIGHT_M, max(dist, 0.5))), 3
                        ),
                        "azimuth_deg": round(az % 360.0, 3),
                        "tree_id": t.id,
                        "slot_id": t.slot.id,
                        "unsure": (p.key, t.code) in UNSURE_LABELS,
                        "moved": False,
                        "method": "office_triangulation",
                        "method_version": "office-v0.2",
                        "labelled_by": ids.OPS,
                        "labelled_at": v.end + timedelta(days=1, minutes=2 * n),
                        "created_at": v.end + timedelta(days=1),
                    },
                )
    for v in ds.visits:
        if v.kind != "verification":
            continue
        p = v.parcel
        for code, reasons, present, note in VERIFICATION[v.key]:
            slot = next(x for x in ds.slots[p.key] if x.code == code)
            tree = next((t for t in ds.trees[p.key] if t.code == code), None)
            s.insert(
                "chain",
                "public.verification_item",
                {
                    "id": ids.did("verification_item", f"{v.key}:{code}"),
                    "org_id": ids.ORG_ID,
                    "parcel_id": p.id,
                    "session_id": v.id,
                    "slot_id": slot.id,
                    "tree_id": tree.id if tree else None,
                    "reasons": Raw(
                        "array["
                        + ", ".join(lit(r) for r in reasons)
                        + "]::public.verification_reason[]"
                    ),
                    "note": None,
                    "status": "checked",
                    "tree_present": present,
                    "result_note": note,
                    "checked_by": ids.FIELD,
                    "checked_at": v.start + timedelta(minutes=20),
                    "created_by": ids.OPS,
                    "created_at": v.start - timedelta(days=1),
                },
            )


def _gps(t: datetime) -> int:
    from ..gpstime import utc_to_gps_ns

    return utc_to_gps_ns(t)


def closeup_captures(ctx: Context) -> None:
    for c in ctx.manifest["closeups"]:
        v = ctx.ds.visit(c["visit"])
        p = v.parcel
        tree = ctx.ds.tree(p.key, c["tree"])
        x, y = tree.xy
        lat, lon = p.to_latlon(x, y - 1.2)
        ctx.script.insert(
            "chain",
            "public.capture",
            {
                "id": ids.did("capture", f"{v.key}:{c['key']}"),
                "org_id": ids.ORG_ID,
                "parcel_id": p.id,
                "session_id": v.id,
                "kind": "photo",
                "tree_id": tree.id,
                "uri": media_uri(media_key(ids.ORG_ID, p.id, c["sha256"])),
                "content_hash": c["sha256"],
                "byte_size": c["bytes"],
                "mime_type": "image/jpeg",
                "started_at": c["time"],
                "position": _point(lat, lon),
                "position_uncertainty_m": 3.0,
                "captured_by": ids.FIELD,
                "metadata": {
                    "source": "orchados-demo",
                    "local_kind": "closeup",
                    "sensor": "phone_camera",
                    "shot_code": c["shot_code"],
                    "slot_code": c["tree"],
                    "gps_time_ns": int(c["gps_time_ns"]),
                    "time_source": "gnss",
                    "protocol": "summer-v0.1",
                    "quality": {"verdict": "ok", "version": "qc-v0.1", "findings": []},
                },
            },
        )


def results(ctx: Context) -> None:
    """Expert values, assessments and findings of the scans; the inventory's first observations."""
    ds, s = ctx.ds, ctx.script
    for v in ds.visits:
        if v.kind == "verification":
            continue
        season = SEASON_OF_MONTH[v.start.month]
        allowed = set(portal_codes(ctx.metrics, season))
        cat = ctx.catalogs[v.key]
        p = v.parcel
        measured = v.end + timedelta(days=2, hours=3)
        approved = v.published_at - timedelta(hours=1)
        if v.kind == "inventory":
            for t in ds.trees[p.key]:
                for code, value in inventory_values(v, t).items():
                    _measure(ctx, v, t, code, value, allowed, measured, [])
            continue
        if v.key in WEED_HEIGHTS:
            weed_question(ctx, v, WEED_HEIGHTS[v.key])
        classes = ds.classes(v)
        for t in ds.trees[p.key]:
            crops = [r["id"] for r in _assets(cat, "tree_crop", t.id)]
            mids = []
            for code, value in tree_values(v, t, classes[t.code]).items():
                mids.append(_measure(ctx, v, t, code, value, allowed, measured, crops))
            aid = ids.did("assessment", f"{v.key}:{t.code}")
            s.insert(
                "results",
                "public.assessment",
                {
                    "id": aid,
                    "org_id": ids.ORG_ID,
                    "parcel_id": p.id,
                    "session_id": v.id,
                    "tree_id": t.id,
                    "source": "expert",
                    "overall_class": classes[t.code],
                    "confidence": None,
                    "model_name": None,
                    "model_version": None,
                    "methodology_version": METHODOLOGY,
                    "assessed_by": ids.EXPERT,
                    "approved_by": ids.EXPERT,
                    "approved_at": approved,
                    "notes": None,
                    "assessed_at": measured + timedelta(minutes=5),
                    "created_at": measured + timedelta(minutes=5),
                },
            )
            for mid in mids + ([cat.presence[t.id]] if t.id in cat.presence else []):
                s.insert(
                    "results",
                    "public.assessment_measurement",
                    {
                        "org_id": ids.ORG_ID,
                        "parcel_id": p.id,
                        "assessment_id": aid,
                        "measurement_id": mid,
                    },
                    conflict="assessment_id, measurement_id",
                )
        for f in ds.findings(v.key):
            tree = ds.tree(p.key, f.tree) if f.tree else None
            zone = (
                next((z for z in ZONES if z[0] == f.zone and z[1] == p.key), None)
                if f.zone
                else None
            )
            loc = None
            if zone is not None:
                g = zone[4]
                if isinstance(g[0], (int, float)):
                    pt = g
                elif f.key == "irrigation":  # the leak, on the line at S1-4
                    pt = (ds.tree(p.key, "S1-4").xy[0], g[0][1])
                else:
                    pt = ((g[0][0] + g[-1][0]) / 2, g[0][1])
                loc = (pt, p.to_latlon(*pt))
            s.insert(
                "results",
                "public.finding",
                {
                    "id": f.id,
                    "org_id": ids.ORG_ID,
                    "parcel_id": p.id,
                    "session_id": v.id,
                    "tree_id": tree.id if tree else None,
                    "zone_id": zone_id(p.key, f.zone) if f.zone else None,
                    "assessment_id": ids.did("assessment", f"{v.key}:{f.tree}") if tree else None,
                    "location": _point(*loc[1]) if loc else None,
                    "position_uncertainty_m": 1.0 if loc else None,
                    "kind": f.kind,
                    "severity": f.severity,
                    "description": f.description,
                    "recommendation": f.recommendation,
                    "approved_by": ids.EXPERT,
                    "approved_at": approved,
                    "created_by": ids.EXPERT,
                    "created_at": measured + timedelta(minutes=30),
                },
            )
            if tree is not None:
                evidence = [r["id"] for r in _assets(cat, "tree_crop", tree.id)]
            else:
                # The preview panorama nearest to the place.
                lat, lon = loc[1]
                evidence = [
                    min(
                        _assets(cat, "panorama"),
                        key=lambda r: _dist_deg(r["position"], lat, lon),
                    )["id"]
                ]
            for aid in evidence:
                s.insert(
                    "results",
                    "public.finding_evidence",
                    {"org_id": ids.ORG_ID, "parcel_id": p.id, "finding_id": f.id, "asset_id": aid},
                    conflict="finding_id, asset_id",
                )


def _dist_deg(point: str, lat: float, lon: float) -> float:
    lo, la = (float(x) for x in point.split("POINT(")[1].rstrip(")").split())
    return math.hypot((lo - lon) * math.cos(math.radians(lat)), la - lat)


def _measure(
    ctx: Context, v: Visit, t, code: str, value, allowed: set[str], at, evidence: list[str]
) -> str:
    if code not in allowed:
        raise ValueError(
            f"{v.key}: metric {code} is not valid in the visit's season or not on the card"
        )
    m = ctx.metrics[code]
    mid = ids.did("measurement", f"{v.key}:{t.code}:{code}")
    vt = m.value_type
    ctx.script.insert(
        "results",
        "public.measurement",
        {
            "id": mid,
            "org_id": ids.ORG_ID,
            "parcel_id": v.parcel.id,
            "tree_id": t.id,
            "metric_definition_id": m.id,
            "value_scale": int(value) if vt == "scale" else None,
            "value_category": str(value) if vt == "category" else None,
            "value_boolean": bool(value) if vt == "boolean" else None,
            "uncertainty": 0.5 if vt == "scale" else None,
            "confidence": 0.95,
            "method": "expert_review",
            "method_version": METHODOLOGY,
            "params_hash": None,
            "source": "expert",
            "session_id": v.id,
            "measured_at": at,
            "recorded_by": ids.EXPERT,
        },
    )
    for aid in evidence:
        ctx.script.insert(
            "results",
            "public.measurement_evidence",
            {
                "org_id": ids.ORG_ID,
                "parcel_id": v.parcel.id,
                "measurement_id": mid,
                "asset_id": aid,
            },
            conflict="measurement_id, asset_id",
        )
    return mid


def weed_question(ctx: Context, v: Visit, height: str) -> str:
    """The field question "Bahçede yabani ot ne boyda?" as the field app writes it:
    parcel subject, method field_question, the season's protocol version, staff."""
    season = SEASON_OF_MONTH[v.start.month]
    m = ctx.metrics.get("weed_height")
    if m is None:
        raise ValueError("metric weed_height is not registered (service layer migration)")
    if season not in m.valid_seasons or "parcel" not in m.subject_kinds:
        raise ValueError(f"{v.key}: weed_height is not a parcel metric valid in {season}")
    mid = ids.did("measurement", f"{v.key}:parcel:weed_height", SERVICES_VERSION)
    ctx.script.insert(
        "results",
        "public.measurement",
        {
            "id": mid,
            "org_id": ids.ORG_ID,
            "parcel_id": v.parcel.id,
            "tree_id": None,
            "metric_definition_id": m.id,
            "value_scale": None,
            "value_category": height,
            "value_boolean": None,
            "uncertainty": None,
            "confidence": None,
            "method": FIELD_QUESTION_METHOD,
            "method_version": FIELD_PROTOCOL[season],
            "params_hash": None,
            "source": "staff",
            "session_id": v.id,
            "measured_at": v.start + timedelta(minutes=15),
            "recorded_by": ids.FIELD,
        },
    )
    return mid


# ---------------------------------------------------------------------------------------
# Service layer (docs/MVP.md Module 6)
# ---------------------------------------------------------------------------------------

SERVICE_TYPE_ID = ids.did("service_type", SERVICE_TYPE["code"], SERVICES_VERSION)
PROOF_PIPELINE = ("service-proof", "v1")  # as ops_add_service_photo registers a photo


def services(ctx: Context) -> None:
    """The service layer switched on for the demo org, its catalogue row and season
    per fruit species, the done mowing job of parcel B with its history and proof
    photos, and the robot notes.

    No price list: the service is unpriced, so the portal shows "Fiyat teklifle
    bildirilir" and the done job carries only the amount ops entered.

    Rows are written as the ops functions would leave them; nothing goes through the
    functions, which refuse demo orgs and would queue messages. The billing setting
    only turns the service layer on: sign-ups and fake payments stay off (the demo
    billing guard refuses them).
    """
    s, ds = ctx.script, ctx.ds
    o = ids.ORG_ID
    s.insert(
        "services",
        "public.org_billing_setting",
        {
            "org_id": o,
            "accepts_signups": False,
            "allow_fake_payments": False,
            "services_enabled": True,
            "created_at": CREATED,
            "updated_at": CREATED,
        },
        conflict="org_id",
    )
    s.insert(
        "services",
        "public.service_type",
        {
            "id": SERVICE_TYPE_ID,
            "org_id": o,
            **SERVICE_TYPE,
            "created_at": CREATED,
            "updated_at": CREATED,
        },
    )
    # The season per fruit species, for every species there is (as the migration
    # seeds it for other orgs): a set-based insert, so a species added later is
    # covered too.
    sm, sd, em, ed = SERVICE_SEASON
    s.raw["services"].append(
        "\\echo @insert public.service_type_season\n"
        "insert into public.service_type_season (org_id, service_type_id, species, "
        "season_start_month, season_start_day, season_end_month, season_end_day, updated_at)\n"
        f"select {lit(o)}, {lit(SERVICE_TYPE_ID)}, f.code, {sm}, {sd}, {em}, {ed}, {lit(CREATED)}\n"
        "from public.fruit_species f\n"
        "on conflict (service_type_id, species) do nothing;\n"
    )
    photos = {p["key"]: p for p in ctx.manifest.get("service_photos", [])}
    for job in SERVICE_JOBS:
        service_job(ctx, job, photos)
    for key, (slope, stoniness, branch, note) in ROBOT_NOTES.items():
        p = ds.parcel(key)
        s.insert(
            "services",
            "public.parcel_robot_note",
            {
                "parcel_id": p.id,
                "org_id": o,
                "slope": slope,
                "stoniness": stoniness,
                "lowest_branch_cm": branch,
                "note": note,
                "updated_by": ids.FIELD,
                "created_at": CREATED,
            },
            conflict="parcel_id",
        )


def _boundary_area(parcel_key: str) -> Raw:
    """The quote's area: the parcel's boundary (version 1), as parcel_service_area reads it."""
    bid = ids.did("boundary", f"{parcel_key}:1")
    return Raw(
        f"(select round(b.area_m2::numeric, 2) from public.boundary b where b.id = {lit(bid)})"
    )


def service_job(ctx: Context, job: ServiceJob, photos: dict[str, dict]) -> None:
    s = ctx.script
    o, p = ids.ORG_ID, job.parcel
    assets: list[tuple[str, str]] = []  # (phase, asset id)
    for photo in job.photos:
        f = photos.get(photo.key(job))
        if f is None:
            raise ValueError(f"build has no service photo {photo.key(job)}; rebuild it")
        aid = ids.did("asset", f["key"], SERVICES_VERSION)
        lat, lon = p.to_latlon(p.length_m * 0.4, p.row_spacing_m * 1.5)
        s.insert(
            "services",
            "public.asset",
            {
                "id": aid,
                "org_id": o,
                "parcel_id": p.id,
                "session_id": job.id,
                "kind": "photo",
                "tree_id": None,
                "uri": media_uri(media_key(o, p.id, f["sha256"])),
                "content_hash": f["sha256"],
                "byte_size": f["bytes"],
                "mime_type": f["mime"],
                "position": _point(lat, lon),
                "position_uncertainty_m": 5.0,
                "pipeline": PROOF_PIPELINE[0],
                "pipeline_version": PROOF_PIPELINE[1],
                "produced_at": datetime.fromisoformat(f["time"]),
                "created_at": job.done_at - timedelta(minutes=20),
            },
        )
        assets.append((photo.phase, aid))
    s.insert(
        "services",
        "public.operation",
        {
            "id": job.operation_id,
            "org_id": o,
            "parcel_id": p.id,
            "session_id": job.id,
            "kind": SERVICE_TYPE["operation_kind"],
            "performer": "crew",
            "performed_by": None,
            "started_at": job.work_start,
            "area_m2": _boundary_area(p.key),
            "details": {
                "service_request_id": job.request_id,
                "service_request_number": job.number,
                "service_code": SERVICE_TYPE["code"],
                "by": "orchados",
            },
            "notes": None,
            "created_by": ids.OPS,
            "created_at": job.done_at,
        },
    )
    s.insert(
        "services",
        "public.service_request",
        {
            "id": job.request_id,
            "org_id": o,
            "parcel_id": p.id,
            "service_type_id": SERVICE_TYPE_ID,
            "number": job.number,
            "status": "done",
            "requested_by": ids.OWNER,
            "season_year": job.season_year,
            "preferred_window": job.preferred_window,
            "customer_note": job.customer_note,
            "terms_version": SERVICE_TERMS_VERSION,
            "early_performance_requested": job.early_performance,
            "recommended_measurement_id": None,
            "recommended_weed_height": None,
            "area_m2": _boundary_area(p.key),
            "area_source": "boundary",
            # Unpriced at the request: no price list, no frozen estimate (all eight
            # null, as customer_request_service leaves them).
            "price_list_id": None,
            "price_list_version": None,
            "price_per_donum_kurus": None,
            "minimum_fee_kurus": None,
            "vat_rate_bp": None,
            "estimate_subtotal_kurus": None,
            "estimate_vat_kurus": None,
            "estimate_total_kurus": None,
            "pricing_rule": PRICING_RULE,
            "quote_total_kurus": job.quote_total_kurus,
            "scheduled_date": job.scheduled_date,
            "session_id": job.id,
            "operation_id": job.operation_id,
            "completed_on": job.completed_on,
            "payment_received_on": job.payment_on,
            "payment_amount_kurus": job.quote_total_kurus,
            "payment_method": job.payment_method,
            "payment_recorded_by": ids.OPS,
            "created_at": job.requested_at,
            "updated_at": job.done_at,
        },
    )
    for n, (frm, to, actor, role, at) in enumerate(
        (
            (None, "requested", ids.OWNER, "owner", job.requested_at),
            ("requested", "scheduled", ids.OPS, "ops", job.scheduled_at),
            ("scheduled", "done", ids.OPS, "ops", job.done_at),
        )
    ):
        s.insert(
            "services",
            "public.service_request_event",
            {
                "id": ids.did("service_request_event", f"{job.key}:{n}", SERVICES_VERSION),
                "org_id": o,
                "parcel_id": p.id,
                "request_id": job.request_id,
                "from_status": frm,
                "to_status": to,
                "actor_user_id": actor,
                "actor_role": role,
                "note": None,
                "created_at": at,
            },
        )
    for phase, aid in assets:
        s.insert(
            "services",
            "public.service_request_photo",
            {
                "id": ids.did(
                    "service_request_photo", f"{job.key}:{aid}:{phase}", SERVICES_VERSION
                ),
                "org_id": o,
                "parcel_id": p.id,
                "request_id": job.request_id,
                "asset_id": aid,
                "phase": phase,
                "linked_by": ids.OPS,
                "created_at": job.done_at - timedelta(minutes=20),
            },
        )


def access(script: Script, ds: Dataset) -> None:
    a, b = ds.parcel("A"), ds.parcel("B")
    script.insert(
        "access",
        "private.owner_profile",
        {
            "id": ids.did("owner_profile", "viewer"),
            "org_id": ids.ORG_ID,
            "user_id": ids.VIEWER,
            "full_name": "Örnek Hissedar",
            "phone": None,
            "email": None,
            "contact_preference": "whatsapp",
            "kvkk_consent": False,
            "kvkk_consent_at": None,
            "kvkk_text_version": None,
            "created_at": CREATED,
            "updated_at": CREATED,
        },
    )
    for key, parcel, user, role, by in (
        ("owner:A", a, ids.OWNER, "owner", ids.OPS),
        ("owner:B", b, ids.OWNER, "owner", ids.OPS),
        ("viewer:A", a, ids.VIEWER, "viewer", ids.OWNER),
    ):
        script.insert(
            "access",
            "public.parcel_access",
            {
                "id": ids.did("parcel_access", key),
                "org_id": ids.ORG_ID,
                "parcel_id": parcel.id,
                "user_id": user,
                "role": role,
                "granted_by": by,
                "created_at": CREATED,
            },
        )


def _as(user: str) -> str:
    claims = json.dumps({"sub": user, "role": "authenticated"})
    return (
        f"select set_config('request.jwt.claims', {lit(claims)}, true);\n"
        "set local role authenticated;\n"
    )


def questions(script: Script, ds: Dataset) -> None:
    """Question threads, inserted under their authors' claims (question_prepare sets
    the org, the author's role, created_by and created_at from the caller)."""
    for q in QUESTIONS:
        p = ds.parcel(q.parcel)
        qid = ids.did("question", q.key)
        tree = ds.tree(p.key, q.tree).id if q.tree else None
        finding = (
            next(f.id for f in ds.findings() if f"{f.visit}:{f.key}" == q.finding)
            if q.finding
            else None
        )
        script.statement(
            "questions",
            Statement(
                "public.question",
                ("id", "parcel_id", "tree_id", "finding_id", "body"),
                [(qid, p.id, tree, finding, q.body)],
                "id",
                prefix=_as(q.author),
                suffix="reset role;\n",
            ),
        )
        script.statement(
            "questions",
            Statement(
                "public.question_reply",
                ("id", "question_id", "body"),
                [(ids.did("question_reply", q.key), qid, q.reply)],
                "id",
                prefix=_as(ids.EXPERT),
                suffix="reset role;\n",
            ),
        )


def registry(script: Script, ds: Dataset, version: int, dataset_sha256: str, source: str) -> None:
    """The registry row with loaded_at null, only where stream A's table exists."""
    if type(version) is not int:
        raise ValueError(f"dataset version must be an int, not {version!r}")
    script.raw["registry"].append(
        "do $$\nbegin\n"
        "  if to_regclass('private.demo_org') is null then\n"
        "    raise notice 'private.demo_org does not exist: registry skipped';\n"
        "    return;\n"
        "  end if;\n"
        "  insert into private.demo_org (org_id, dataset_version, dataset_sha256, "
        "dataset_source, tour)\n"
        f"  values ({lit(ids.ORG_ID)}, {lit(version)}, {lit(dataset_sha256)}, {lit(source)}, "
        f"{lit(ds.tour())})\n"
        "  on conflict (org_id) do nothing;\n"
        "end\n$$;\n"
    )


def generate(ds: Dataset, build: Path, manifest: dict, metrics: dict[str, Metric]) -> Script:
    """The whole load as a Script (sql() renders it)."""
    script = Script()
    ctx = Context(ds, Path(build), manifest, metrics, script)
    personas(script)
    acquisition(script)
    parcels(script, ds)
    sessions(script, ds)
    boundaries(script, ds)
    layout(script, ds)
    visit_uploads(ctx)
    inventory_chain(ctx)
    closeup_captures(ctx)
    results(ctx)
    services(ctx)
    access(script, ds)
    questions(script, ds)
    registry(
        script,
        ds,
        DATASET_VERSION,
        manifest["dataset_sha256"],
        manifest.get("source", "synthetic"),
    )
    return script
