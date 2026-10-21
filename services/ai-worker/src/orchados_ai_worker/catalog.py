"""What the worker reads from and writes to the database.

Catalog is the interface; SupabaseCatalog talks to PostgREST and Storage as
the signed-in ops user. Tests use an in-memory catalog.

Reads are limited to what a request may contain or what the rows need: tree
ids and slot codes, crops (asset rows of kind tree_crop), staff yes/no
measurements, the metric registry, session status and time. Parcel names,
villages, owners and question texts are never read.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from .supabase import SupabaseClient

FACE_BLUR = "face_blur"


@dataclass(frozen=True)
class SessionInfo:
    id: str
    org_id: str
    parcel_id: str
    status: str
    kind: str
    methodology_version: str | None
    time: datetime


@dataclass(frozen=True)
class TreeRef:
    id: str
    code: str


@dataclass(frozen=True)
class Crop:
    asset_id: str
    tree_id: str
    direction: str | None
    uri: str
    content_hash: str
    quality_score: float | None
    produced_at: str
    # pose.filters_applied names face_blur (docs/arayuzler.md, "AI ön değerlendirme").
    blurred: bool


class Catalog(Protocol):
    def session(self, session_id: str) -> SessionInfo: ...

    def active_trees(self, parcel_id: str) -> list[TreeRef]: ...

    def crops(self, session_id: str) -> list[Crop]: ...

    def previous_published_session(self, session: SessionInfo) -> SessionInfo | None: ...

    def staff_answers(self, session_id: str) -> dict[str, dict[str, bool]]:
        """tree id -> metric code -> newest yes/no answer of the session."""
        ...

    def metric_registry(self) -> list[dict[str, Any]]: ...

    def existing_results(self, session_id: str, prompt_version: str, config_key: str) -> set[str]:
        """Trees that already have an AI result with this prompt version and cascade."""
        ...

    def download(self, crop: Crop) -> bytes: ...

    def save(self, args: dict[str, Any]) -> str:
        """Call save_ai_assessment; returns the assessment id."""
        ...


def session_time(row: dict[str, Any]) -> datetime:
    """started_at, else the planned day (UTC midnight), else created_at (as the latest views)."""
    if row.get("started_at"):
        return _ts(row["started_at"])
    if row.get("planned_date"):
        return datetime.fromisoformat(row["planned_date"]).replace(tzinfo=UTC)
    return _ts(row["created_at"])


def _ts(text: str) -> datetime:
    t = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def crop_from_row(row: dict[str, Any]) -> Crop:
    pose = row.get("pose") or {}
    filters = pose.get("filters_applied")
    return Crop(
        asset_id=row["id"],
        tree_id=row["tree_id"],
        direction=pose.get("direction"),
        uri=row["uri"],
        content_hash=row["content_hash"],
        quality_score=row.get("quality_score"),
        produced_at=row.get("produced_at") or "",
        blurred=isinstance(filters, list) and FACE_BLUR in filters,
    )


class CropIntegrityError(RuntimeError):
    pass


SESSION_COLUMNS = (
    "id,org_id,parcel_id,status,kind,methodology_version,started_at,planned_date,created_at"
)


class SupabaseCatalog:
    def __init__(self, client: SupabaseClient):
        self.db = client

    @staticmethod
    def _session(row: dict[str, Any]) -> SessionInfo:
        return SessionInfo(
            id=row["id"],
            org_id=row["org_id"],
            parcel_id=row["parcel_id"],
            status=row["status"],
            kind=row["kind"],
            methodology_version=row.get("methodology_version"),
            time=session_time(row),
        )

    def session(self, session_id: str) -> SessionInfo:
        rows = self.db.select("session", {"id": f"eq.{session_id}", "select": SESSION_COLUMNS})
        if not rows:
            raise LookupError(f"session {session_id} not found (or not visible to this user)")
        return self._session(rows[0])

    def active_trees(self, parcel_id: str) -> list[TreeRef]:
        rows = self.db.select(
            "tree",
            {
                "parcel_id": f"eq.{parcel_id}",
                "status": "eq.active",
                "select": "id,slot(code)",
            },
        )
        return [TreeRef(r["id"], (r.get("slot") or {}).get("code") or "") for r in rows]

    def crops(self, session_id: str) -> list[Crop]:
        rows = self.db.select(
            "asset",
            {
                "session_id": f"eq.{session_id}",
                "kind": "eq.tree_crop",
                "tree_id": "not.is.null",
                "select": "id,tree_id,uri,content_hash,quality_score,produced_at,pose",
            },
        )
        return [crop_from_row(r) for r in rows]

    def previous_published_session(self, session: SessionInfo) -> SessionInfo | None:
        rows = self.db.select(
            "session",
            {
                "parcel_id": f"eq.{session.parcel_id}",
                "status": "eq.published",
                "id": f"neq.{session.id}",
                "select": SESSION_COLUMNS,
            },
        )
        earlier = [self._session(r) for r in rows]
        earlier = [s for s in earlier if s.time < session.time]
        return max(earlier, key=lambda s: (s.time, s.id)) if earlier else None

    def metric_registry(self) -> list[dict[str, Any]]:
        return self.db.select(
            "metric_definition",
            {
                "select": "id,code,value_type,scale_min,scale_max,categories,"
                "valid_seasons,subject_kinds"
            },
        )

    def staff_answers(self, session_id: str) -> dict[str, dict[str, bool]]:
        codes = {r["id"]: r["code"] for r in self.metric_registry()}
        rows = self.db.select(
            "measurement",
            {
                "session_id": f"eq.{session_id}",
                "source": "eq.staff",
                "tree_id": "not.is.null",
                "value_boolean": "not.is.null",
                "select": "id,tree_id,metric_definition_id,value_boolean,measured_at,created_at",
            },
        )
        rows.sort(key=lambda r: (r["measured_at"], r["created_at"], r["id"]))
        out: dict[str, dict[str, bool]] = {}
        for r in rows:  # newest last, so it wins
            code = codes.get(r["metric_definition_id"])
            if code:
                out.setdefault(r["tree_id"], {})[code] = bool(r["value_boolean"])
        return out

    def existing_results(self, session_id: str, prompt_version: str, config_key: str) -> set[str]:
        rows = self.db.select(
            "ai_assessment_detail",
            {
                "session_id": f"eq.{session_id}",
                "prompt_version": f"eq.{prompt_version}",
                "config_key": f"eq.{config_key}",
                "select": "tree_id",
                "order": "tree_id",
            },
        )
        return {r["tree_id"] for r in rows}

    def download(self, crop: Crop) -> bytes:
        prefix = "storage://media/"
        if not crop.uri.startswith(prefix):
            raise CropIntegrityError(f"crop {crop.asset_id} is not in the media bucket: {crop.uri}")
        data = self.db.download(self.db.signed_url("media", crop.uri[len(prefix) :]))
        if hashlib.sha256(data).hexdigest() != crop.content_hash:
            raise CropIntegrityError(f"crop {crop.asset_id}: content hash mismatch")
        return data

    def save(self, args: dict[str, Any]) -> str:
        return self.db.rpc("save_ai_assessment", args)

    # --- evaluation (evaluate.EvalSource) ----------------------------------------

    def sessions_of_parcel(self, parcel_id: str) -> list[SessionInfo]:
        rows = self.db.select(
            "session",
            {"parcel_id": f"eq.{parcel_id}", "kind": "neq.inventory", "select": SESSION_COLUMNS},
        )
        return sorted((self._session(r) for r in rows), key=lambda s: (s.time, s.id))

    def assessments(self, session_id: str) -> list[dict[str, Any]]:
        rows = self.db.select(
            "assessment",
            {
                "session_id": f"eq.{session_id}",
                "tree_id": "not.is.null",
                "select": "id,tree_id,source,overall_class,confidence,model_name,auto_approved,"
                "assessed_at,created_at,assessment_measurement(measurement_id)",
            },
        )
        for r in rows:
            r["links"] = [link["measurement_id"] for link in r.pop("assessment_measurement")]
        return rows

    def measurements(self, session_id: str) -> dict[str, dict[str, Any]]:
        rows = self.db.select(
            "measurement",
            {
                "session_id": f"eq.{session_id}",
                "tree_id": "not.is.null",
                "select": "id,metric_definition_id,value_numeric,value_scale,value_category,"
                "value_boolean",
            },
        )
        return {r["id"]: r for r in rows}

    def ai_details(self, session_id: str) -> dict[str, dict[str, Any]]:
        rows = self.db.select(
            "ai_assessment_detail",
            {
                "session_id": f"eq.{session_id}",
                "select": "assessment_id,flags,tree_visible,final_model",
                "order": "assessment_id",
            },
        )
        return {r["assessment_id"]: r for r in rows}
