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
- measured_at is the start of the scan (lidar/cloud.json of the session folder
  next to the output folder); without it the database takes the session start.
- Re-running is safe: a measurement with the same session, tree, metric, method,
  version and parameters is not written again; a new method version adds rows.
- --dry-run prints the payload and writes nothing.

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
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..gpstime import gps_ns_to_iso

RPC = "record_lidar_measurements"

# method -> metric codes it writes (private.lidar_method_metrics()).
METHOD_METRICS: dict[str, frozenset[str]] = {
    "lidar_crown": frozenset({"tree_height", "crown_diameter", "crown_volume", "size_class"}),
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
    measurements: list[ReportMeasurement] = Field(default_factory=list)


def load_reports(out_dir: Path) -> list[tuple[Path, ReportFile]]:
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
    if not reports:
        raise LidarUploadError(f"{out_dir}: no LiDAR reports (crown.json, skeleton.json, ...)")
    return reports


def scan_start(out_dir: Path, session_id: str) -> str | None:
    """Start of the scan from <session>/lidar/cloud.json for <session>.processed/lidar."""
    processed = Path(out_dir).resolve().parent
    if not processed.name.endswith(".processed"):
        return None
    cloud = processed.with_name(processed.name.removesuffix(".processed")) / "lidar" / "cloud.json"
    try:
        meta = json.loads(cloud.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict) or meta.get("session_id") != session_id:
        return None
    start = meta.get("gps_time_start_ns")
    return gps_ns_to_iso(start) if isinstance(start, int) else None


def build_payload(
    reports: list[tuple[Path, ReportFile]], session_id: str, measured_at: str | None = None
) -> dict[str, Any]:
    """record_lidar_measurements()'s p_payload from the reports of one session."""
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


def run(
    out_dir: Path,
    session_id: str,
    dry_run: bool = False,
    env: dict[str, str] | None = None,
    log: Callable[[str], None] = print,
) -> int:
    from ..supabase import Credentials, SupabaseClient, SupabaseError

    try:
        reports = load_reports(out_dir)
        payload = build_payload(reports, session_id, scan_start(out_dir, session_id))
    except LidarUploadError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    problems = check_payload(payload)
    names = ", ".join(p.name for p, _ in reports)
    if dry_run:
        log(json.dumps({"p_session_id": session_id, "p_payload": payload}, indent=2))
        log(f"dry run: {len(payload['items'])} measurements from {names}, nothing written")
    for p in problems:
        print(f"error: {p}", file=sys.stderr)
    if problems or dry_run:
        return 1 if problems else 0
    try:
        with SupabaseClient.sign_in(Credentials.from_env(env)) as client:
            result = client.rpc(RPC, {"p_session_id": session_id, "p_payload": payload})
    except SupabaseError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for line in summary_lines(result):
        log(line)
    return 0
