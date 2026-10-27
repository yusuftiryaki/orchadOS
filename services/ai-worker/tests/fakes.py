"""In-memory catalog and a fake Batches API: the worker end to end without network."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from conftest import REGISTRY, jpeg

from orchados_ai_worker.catalog import Crop, SessionInfo, TreeRef

# Personal data that lives next to the trees in the database. The worker's
# catalog interface cannot read it; the tests assert it never shows up anyway.
PERSONAL = {
    "owner_name": "Hacı Mehmet Yılmaz",
    "owner_phone": "+90 532 111 22 33",
    "parcel_name": "Kuyubaşı bahçesi",
    "village": "Karkamış Elifoğlu",
    "deed": "Ada 112 Parsel 7",
    "question": "Gövdede yara ya da oyuk var mı?",
}

ORG = "b0000000-0000-4000-8000-000000000001"
PARCEL = "c0000000-0000-4000-8000-000000000001"


def tid(code: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"tree:{code}"))


@dataclass
class FakeCatalog:
    session_row: SessionInfo
    trees: list[TreeRef]
    crop_rows: dict[str, list[Crop]] = field(default_factory=dict)  # session id -> crops
    files: dict[str, bytes] = field(default_factory=dict)  # asset id -> bytes
    previous: SessionInfo | None = None
    answers: dict[str, dict[str, bool]] = field(default_factory=dict)
    registry: list[dict[str, Any]] = field(default_factory=lambda: copy.deepcopy(REGISTRY))
    personal: dict[str, str] = field(default_factory=lambda: dict(PERSONAL))
    saved: list[dict[str, Any]] = field(default_factory=list)
    downloads: int = 0
    fail_save_after: int | None = None

    def session(self, session_id: str) -> SessionInfo:
        if session_id != self.session_row.id:
            raise LookupError(session_id)
        return self.session_row

    def active_trees(self, parcel_id: str) -> list[TreeRef]:
        return list(self.trees)

    def crops(self, session_id: str) -> list[Crop]:
        return list(self.crop_rows.get(session_id, []))

    def previous_published_session(self, session: SessionInfo) -> SessionInfo | None:
        return self.previous

    def staff_answers(self, session_id: str) -> dict[str, dict[str, bool]]:
        return self.answers

    def metric_registry(self) -> list[dict[str, Any]]:
        return self.registry

    def existing_results(self, session_id: str, prompt_version: str, config_key: str) -> set[str]:
        return {
            a["p_tree_id"]
            for a in self.saved
            if a["p_detail"]["prompt_version"] == prompt_version
            and a["p_detail"]["config_key"] == config_key
        }

    def download(self, crop: Crop) -> bytes:
        self.downloads += 1
        return self.files[crop.asset_id]

    def save(self, args: dict[str, Any]) -> str:
        if self.fail_save_after is not None and len(self.saved) >= self.fail_save_after:
            raise ConnectionError("database went away")
        for i, a in enumerate(self.saved):
            same = (
                a["p_tree_id"] == args["p_tree_id"]
                and a["p_detail"]["prompt_version"] == args["p_detail"]["prompt_version"]
                and a["p_detail"]["config_key"] == args["p_detail"]["config_key"]
            )
            if same:
                return f"assessment-{i}"
        self.saved.append(json.loads(json.dumps(args)))
        return f"assessment-{len(self.saved) - 1}"


def make_catalog(
    codes=("S1-1", "S1-2", "S1-3"),
    *,
    when=datetime(2027, 1, 12, 9, tzinfo=UTC),
    previous: bool = True,
    status: str = "processed",
) -> FakeCatalog:
    session = SessionInfo(
        "11111111-1111-4111-8111-111111111111", ORG, PARCEL, status, "periodic_scan", None, when
    )
    prev = SessionInfo(
        "22222222-2222-4222-8222-222222222222",
        ORG,
        PARCEL,
        "published",
        "periodic_scan",
        None,
        datetime(2026, 10, 14, 9, tzinfo=UTC),
    )
    cat = FakeCatalog(
        session, [TreeRef(tid(c), c) for c in codes], previous=prev if previous else None
    )
    for s in (session, prev):
        for i, code in enumerate(codes):
            for j, d in enumerate("NESW"):
                data = jpeg((40 + 40 * i, 100 + 20 * j, 40), mark=f"{s.id[:4]}{code}{d}")
                aid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{s.id}:{code}:{d}"))
                cat.files[aid] = data
                cat.crop_rows.setdefault(s.id, []).append(
                    Crop(
                        aid,
                        tid(code),
                        d,
                        f"storage://media/org/{ORG}/parcel/{PARCEL}/x",
                        hashlib.sha256(data).hexdigest(),
                        0.8,
                        "2027-01-12T10:00:00+00:00",
                    )
                )
    return cat


# --- answers ----------------------------------------------------------------------


def answer(
    cls="healthy", conf=0.9, values=None, flags=(), visible="yes", season="winter"
) -> dict[str, Any]:
    defaults = {
        "winter": {
            "dead_branch_scale": 0,
            "trunk_base_scale": 0,
            "pruning_status": "done",
            "basal_sprout_level": "none",
        },
        "spring": {
            "dead_branch_scale": 0,
            "trunk_base_scale": 0,
            "crown_density_scale": 0,
            "frost_damage_scale": 0,
            "pest_sign_severity": "none",
            "pest_sign_type": None,
            "basal_sprout_level": "none",
            "dieback_pattern": "none",
            "dried_leaves_attached": False,
        },
    }[season]
    v = {**defaults, **(values or {})}
    return {
        "rationale": "Ağaç sağlıklı görünüyor.",
        "tree_visible": visible,
        "values": {k: {"value": x, "confidence": 0.85} for k, x in v.items()},
        "overall_class": cls,
        "class_confidence": conf,
        "flags": list(flags),
    }


def message(model: str, body: dict[str, Any] | str, stop="end_turn") -> dict[str, Any]:
    text = body if isinstance(body, str) else json.dumps(body)
    return {
        "id": "msg_fake",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "thinking", "thinking": ""}, {"type": "text", "text": text}],
        "stop_reason": stop,
        "usage": {
            "input_tokens": 3000,
            "output_tokens": 700,
            "cache_read_input_tokens": 2000,
            "cache_creation_input_tokens": 0,
        },
    }


Responder = Callable[[str, str, dict[str, Any]], dict[str, Any]]


def tree_code_of(params: dict[str, Any]) -> str:
    first = params["messages"][0]["content"][0]["text"]
    m = re.match(r"Tree (\S+),", first)
    assert m, first
    return m.group(1)


class FakeBatchApi:
    """Batches API stand-in. respond(model, tree_code, params) -> batch result 'result' dict."""

    def __init__(self, respond: Responder, polls_until_ended: int = 1):
        self.respond = respond
        self.polls_until_ended = polls_until_ended
        self.batches: dict[str, list[dict[str, Any]]] = {}
        self.polls: dict[str, int] = {}

    @property
    def requests(self) -> list[dict[str, Any]]:
        return [r for reqs in self.batches.values() for r in reqs]

    def create(self, requests: list[dict[str, Any]]) -> str:
        bid = f"msgbatch_{len(self.batches) + 1:03d}"
        # Round trip through JSON, as the HTTP client would.
        self.batches[bid] = json.loads(json.dumps(requests))
        self.polls[bid] = 0
        return bid

    def status(self, batch_id: str) -> str:
        self.polls[batch_id] += 1
        return "ended" if self.polls[batch_id] >= self.polls_until_ended else "in_progress"

    def results(self, batch_id: str):
        for r in reversed(self.batches[batch_id]):  # any order
            p = r["params"]
            yield {
                "custom_id": r["custom_id"],
                "result": self.respond(p["model"], tree_code_of(p), p),
            }


def scripted(by_model: dict[str, dict[str, Any]]) -> Responder:
    """Answers per model and tree code; a missing entry answers 'healthy, confident'."""

    def respond(model: str, code: str, params: dict[str, Any]) -> dict[str, Any]:
        spec = by_model.get(model, {}).get(code)
        if spec is None:
            spec = answer()
        if isinstance(spec, dict) and spec.get("type") in ("errored", "expired", "canceled"):
            return spec
        if isinstance(spec, dict) and "stop_reason" in spec:
            return {"type": "succeeded", "message": spec}
        return {"type": "succeeded", "message": message(model, spec)}

    return respond
