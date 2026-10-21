from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest
from conftest import REGISTRY
from fakes import FakeBatchApi, answer, make_catalog, scripted, tid

from orchados_ai_worker.catalog import SessionInfo
from orchados_ai_worker.cli import main
from orchados_ai_worker.config import WorkerConfig
from orchados_ai_worker.evaluate import evaluate, format_eval
from orchados_ai_worker.worker import RunOptions, Worker

METRIC = {r["code"]: r["id"] for r in REGISTRY}
ORG = "b0000000-0000-4000-8000-000000000001"
PARCEL = "c0000000-0000-4000-8000-000000000001"


@dataclass
class FakeEvalSource:
    sessions: dict[str, SessionInfo] = field(default_factory=dict)
    rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    values: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    details: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    previous: dict[str, str] = field(default_factory=dict)

    def session(self, session_id):
        return self.sessions[session_id]

    def sessions_of_parcel(self, parcel_id):
        return sorted(self.sessions.values(), key=lambda s: s.time)

    def previous_published_session(self, session):
        p = self.previous.get(session.id)
        return self.sessions[p] if p else None

    def metric_registry(self):
        return REGISTRY

    def assessments(self, session_id):
        return self.rows.get(session_id, [])

    def measurements(self, session_id):
        return self.values.get(session_id, {})

    def ai_details(self, session_id):
        return self.details.get(session_id, {})

    def add(
        self,
        session_id,
        tree,
        source,
        cls,
        values,
        *,
        conf=None,
        flags=(),
        auto=False,
        model=None,
        at="2027-01-15T10:00:00Z",
    ):
        aid = f"a{sum(len(v) for v in self.rows.values())}"
        links = []
        for code, v in values.items():
            mid = f"{aid}-{code}"
            col = {int: "value_scale", str: "value_category", bool: "value_boolean"}[type(v)]
            self.values.setdefault(session_id, {})[mid] = {
                "id": mid,
                "metric_definition_id": METRIC[code],
                col: v,
            }
            links.append(mid)
        self.rows.setdefault(session_id, []).append(
            {
                "id": aid,
                "tree_id": tree,
                "source": source,
                "overall_class": cls,
                "confidence": conf,
                "model_name": model,
                "auto_approved": auto,
                "assessed_at": at,
                "created_at": at,
                "links": links,
            }
        )
        if source == "ai":
            self.details.setdefault(session_id, {})[aid] = {"flags": list(flags)}


def session(sid, when, status="in_review"):
    return SessionInfo(sid, ORG, PARCEL, status, "periodic_scan", None, when)


@pytest.fixture
def src():
    s = FakeEvalSource()
    s.sessions["prev"] = session("prev", datetime(2026, 10, 1, tzinfo=UTC), "published")
    s.sessions["s1"] = session("s1", datetime(2027, 1, 15, tzinfo=UTC))
    s.previous["s1"] = "prev"
    s.add("prev", "t1", "expert", "healthy", {})
    s.add("prev", "t2", "expert", "healthy", {})
    # t1: AI and expert agree.
    s.add(
        "s1",
        "t1",
        "ai",
        "healthy",
        {"dead_branch_scale": 0, "pruning_status": "done"},
        conf=0.9,
        model="claude-haiku-5-5",
    )
    s.add("s1", "t1", "expert", "healthy", {"dead_branch_scale": 0, "pruning_status": "done"})
    # t2: AI says problem (3), expert corrects to attention (2); class changed from previous.
    s.add(
        "s1",
        "t2",
        "ai",
        "problem",
        {"dead_branch_scale": 3, "trunk_base_scale": 1},
        conf=0.8,
        model="claude-sonnet-5-5",
    )
    s.add(
        "s1",
        "t2",
        "expert",
        "attention",
        {"dead_branch_scale": 2, "trunk_base_scale": 0, "pruning_status": "partial"},
    )
    # t3: AI has no class and a staff conflict; expert healthy. An older AI row is ignored.
    s.add(
        "s1", "t3", "ai", "dead", {}, conf=0.9, model="claude-haiku-5-5", at="2027-01-14T10:00:00Z"
    )
    s.add(
        "s1",
        "t3",
        "ai",
        None,
        {},
        conf=None,
        flags=["staff_answer_conflict"],
        model="claude-sonnet-5-5",
    )
    s.add("s1", "t3", "expert", "healthy", {"dead_branch_scale": 0})
    # t4: bulk approval copies the AI; not an expert decision.
    s.add("s1", "t4", "ai", "healthy", {"dead_branch_scale": 0}, conf=0.95)
    s.add("s1", "t4", "expert", "healthy", {"dead_branch_scale": 0}, auto=True)
    # t5: expert only.
    s.add("s1", "t5", "expert", "healthy", {})
    return s


def test_agreement_confusion_and_review_share(src):
    r = evaluate(src, session_ids=["s1"])
    assert r["trees"] == 3
    assert r["sessions"] == [{"session_id": "s1", "expert": 4, "ai": 4, "pairs": 3}]
    dead = r["metrics"]["dead_branch_scale"]
    assert (dead["expert_values"], dead["ai_values"], dead["exact"]) == (3, 2, 1)
    assert dead["agreement"] == 0.5 and dead["within_one_rate"] == 1.0
    assert dead["coverage"] == pytest.approx(0.667, abs=1e-3)
    assert r["metrics"]["trunk_base_scale"]["within_one_rate"] == 1.0
    assert r["metrics"]["pruning_status"]["agreement"] == 1.0
    assert "within_one_rate" not in r["metrics"]["pruning_status"]
    assert r["confusion"]["problem"]["attention"] == 1
    assert r["confusion"]["healthy"]["healthy"] == 1
    assert r["confusion"]["none"]["healthy"] == 1
    assert r["class_agreement"] == pytest.approx(0.333, abs=1e-3)
    # t2 (problem, changed) and t3 (no class, staff conflict) go to mandatory review.
    assert r["mandatory_review_share"] == pytest.approx(0.667, abs=1e-3)
    assert r["mandatory_reasons"] == {
        "class_changed": 1,
        "flagged_class": 1,
        "low_confidence": 1,
        "staff_conflict": 1,
    }
    assert r["by_model"]["claude-sonnet-5-5"] == {"trees": 2, "class_agreement": 0.0}
    text = format_eval(r)
    assert "class agreement: 33%" in text and "mandatory review: 67%" in text


def test_threshold_changes_the_review_share(src):
    assert (
        evaluate(src, session_ids=["s1"], threshold=0.95)["mandatory_reasons"]["low_confidence"]
        == 3
    )


def test_parcel_wide_and_empty(src):
    r = evaluate(src, parcel_id=PARCEL)
    assert [s["session_id"] for s in r["sessions"]] == ["prev", "s1"] and r["trees"] == 3
    empty = evaluate(FakeEvalSource(sessions={"x": src.sessions["s1"]}), session_ids=["x"])
    assert empty["trees"] == 0 and "0 trees" in format_eval(empty)


def test_answers_from_the_job_state(tmp_path, capsys):
    """Published visits: run --no-write keeps the answers locally; eval --from-state uses them."""
    cat = make_catalog(("S1-1", "S1-2"), status="published")
    api = FakeBatchApi(
        scripted({"claude-haiku-5-5": {"S1-2": answer("attention", 0.9, {"dead_branch_scale": 2})}})
    )
    Worker(
        cat,
        api,
        WorkerConfig(poll_interval_s=0),
        tmp_path,
        RunOptions(write=False),
        log=lambda _: None,
    ).run(cat.session_row.id)
    src = FakeEvalSource(sessions={cat.session_row.id: cat.session_row})
    src.add(cat.session_row.id, tid("S1-1"), "expert", "healthy", {"dead_branch_scale": 0})
    src.add(cat.session_row.id, tid("S1-2"), "expert", "attention", {"dead_branch_scale": 2})

    assert evaluate(src, session_ids=[cat.session_row.id])["trees"] == 0
    r = evaluate(src, session_ids=[cat.session_row.id], state_dir=tmp_path)
    assert r["trees"] == 2 and r["class_agreement"] == 1.0
    assert r["metrics"]["dead_branch_scale"]["agreement"] == 1.0

    args = [
        "eval",
        "--session-id",
        cat.session_row.id,
        "--from-state",
        "--state-dir",
        str(tmp_path),
    ]
    assert main(args, catalog=src) == 0
    assert "class agreement: 100%" in capsys.readouterr().out
