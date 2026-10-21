"""AI rows against the local Supabase stack, with the fake Batches API.

Skipped when Supabase is not reachable (pnpm db:start && pnpm db:reset at the
repo root). The test opens its own processed visit on the seed parcel, puts
crops of three seed trees into storage and asset rows (marked face_blur, as
the pipeline will), runs the worker as the ops user and checks the rows as
the expert panel and the owner read them. The session is purged afterwards.
"""

from __future__ import annotations

import hashlib
import json
import uuid

import pytest
from conftest import jpeg
from fakes import FakeBatchApi, answer, scripted
from supabase_util import ORG, PARCEL, SEED_PERSONAL, client

from orchados_ai_worker.catalog import SupabaseCatalog
from orchados_ai_worker.config import WorkerConfig
from orchados_ai_worker.supabase import PermissionDenied
from orchados_ai_worker.worker import RunOptions, Worker

pytestmark = pytest.mark.supabase

HAIKU, SONNET = "claude-haiku-5-5", "claude-sonnet-5-5"
CODES = ("S1-1", "S1-2", "S1-3")


def tree_ids(ops) -> dict[str, str]:
    rows = ops.select(
        "tree",
        {"parcel_id": f"eq.{PARCEL}", "status": "eq.active", "select": "id,slot!inner(code)"},
    )
    return {r["slot"]["code"]: r["id"] for r in rows if r["slot"]["code"] in CODES}


@pytest.fixture(scope="module")
def visit(supabase_env, test_sessions, tmp_path_factory):
    ops, field = client(supabase_env, "ops"), client(supabase_env, "field")
    session_id = str(uuid.uuid4())
    test_sessions.append(session_id)
    ops.insert(
        "session",
        [
            {
                "id": session_id,
                "org_id": ORG,
                "parcel_id": PARCEL,
                "kind": "periodic_scan",
                "status": "processed",
                "started_at": "2027-01-15T08:00:00Z",
                "methodology_version": "methodology-v0",
            }
        ],
    )
    trees = tree_ids(ops)
    assert set(trees) == set(CODES)
    assets = []
    for code, tree_id in trees.items():
        for d in "NESW":
            data = jpeg(mark=f"{session_id}{code}{d}")
            sha = hashlib.sha256(data).hexdigest()
            key = f"org/{ORG}/parcel/{PARCEL}/{sha}"
            ops.storage_upload("media", key, data, "image/jpeg")
            assets.append(
                {
                    "org_id": ORG,
                    "parcel_id": PARCEL,
                    "session_id": session_id,
                    "kind": "tree_crop",
                    "tree_id": tree_id,
                    "uri": f"storage://media/{key}",
                    "content_hash": sha,
                    "byte_size": len(data),
                    "mime_type": "image/jpeg",
                    "quality_score": 0.8,
                    "pose": {"direction": d, "slot_code": code, "filters_applied": ["face_blur"]},
                    "pipeline": "orchados-pipeline",
                    "pipeline_version": "test",
                }
            )
    ops.insert("asset", assets)
    # A staff answer for S1-1: no dead branch seen.
    metric = ops.select("metric_definition", {"code": "eq.dead_branch_present", "select": "id"})[0][
        "id"
    ]
    field.insert(
        "measurement",
        [
            {
                "org_id": ORG,
                "parcel_id": PARCEL,
                "tree_id": trees["S1-1"],
                "metric_definition_id": metric,
                "value_boolean": False,
                "method": "staff_question",
                "method_version": "1",
                "source": "staff",
                "session_id": session_id,
                "measured_at": "2027-01-15T08:30:00Z",
            }
        ],
    )
    api = FakeBatchApi(
        scripted(
            {
                HAIKU: {
                    "S1-2": answer(
                        "problem", 0.8, {"dead_branch_scale": 3}, ["staff_answer_conflict"]
                    )
                },
                SONNET: {"S1-2": answer("problem", 0.9, {"dead_branch_scale": 3})},
            }
        )
    )
    state = tmp_path_factory.mktemp("ai-state")
    worker = Worker(
        SupabaseCatalog(ops),
        api,
        WorkerConfig(poll_interval_s=0),
        state,
        RunOptions(),
        log=lambda _: None,
        sleep=lambda _: None,
    )
    report = worker.run(session_id)
    yield ops, session_id, trees, api, report, worker
    ops.close()
    field.close()


def test_ai_rows_are_written(visit):
    ops, session_id, trees, api, report, _ = visit
    assert report.written == 3 and report.final_models == {HAIKU: 2, SONNET: 1}
    rows = ops.select(
        "assessment",
        {
            "session_id": f"eq.{session_id}",
            "select": "id,tree_id,source,overall_class,confidence,model_name,model_version,"
            "methodology_version,notes",
        },
    )
    assert len(rows) == 3 and {r["source"] for r in rows} == {"ai"}
    by_tree = {r["tree_id"]: r for r in rows}
    s12 = by_tree[trees["S1-2"]]
    assert (s12["overall_class"], s12["model_name"]) == ("problem", SONNET)
    assert s12["confidence"] == pytest.approx(0.9)
    assert s12["methodology_version"] == "methodology-v0" and s12["notes"]

    details = ops.select(
        "ai_assessment_detail",
        {"session_id": f"eq.{session_id}", "select": "*", "order": "tree_id"},
    )
    d12 = next(d for d in details if d["tree_id"] == trees["S1-2"])
    assert d12["models"] == [HAIKU, SONNET] and d12["final_model"] == SONNET
    assert "class_problem" in d12["review_reasons"]
    assert d12["prompt_version"] == "ai-v0.1/methodology-v0"
    assert float(d12["cost_usd"]) > 0 and d12["batch_ids"] == ["msgbatch_001", "msgbatch_002"]

    ms = ops.select(
        "measurement",
        {
            "session_id": f"eq.{session_id}",
            "source": "eq.ai",
            "select": "id,tree_id,method,method_version,confidence,uncertainty,value_scale,"
            "value_category,measurement_evidence(asset_id)",
        },
    )
    assert len(ms) == 9  # three winter scales per tree
    assert {(m["method"], m["method_version"]) for m in ms} == {
        ("ai_preassessment", "ai-v0.1/methodology-v0")
    }
    assert all(len(m["measurement_evidence"]) == 4 for m in ms)


def test_no_personal_data_left_the_database(visit):
    _, _, _, api, _, _ = visit
    body = json.dumps(api.requests, ensure_ascii=False)
    for value in SEED_PERSONAL:
        assert value not in body
    s11 = next(r for r in api.requests if "Tree S1-1," in json.dumps(r))
    assert "- dead_branch_present: no" in json.dumps(s11, ensure_ascii=False)


def test_rerun_adds_nothing(visit):
    ops, session_id, _, api, _, worker = visit
    batches = len(api.batches)
    again = worker.run(session_id)
    assert again.status == "nothing_to_do" and again.already_done == 3
    assert len(api.batches) == batches
    assert len(ops.select("assessment", {"session_id": f"eq.{session_id}", "select": "id"})) == 3


def test_owner_and_viewer_see_nothing(visit, supabase_env):
    _, session_id, _, _, _, _ = visit
    for who in ("owner", "viewer"):
        c = client(supabase_env, who)
        try:
            for table in ("assessment", "measurement"):
                assert c.select(table, {"session_id": f"eq.{session_id}", "select": "id"}) == []
            assert (
                c.select(
                    "ai_assessment_detail",
                    {"session_id": f"eq.{session_id}", "select": "tree_id", "order": "tree_id"},
                )
                == []
            )
        finally:
            c.close()


def test_expert_panel_reads_the_suggestion(visit, supabase_env):
    """The queries of apps/web/src/lib/expert/review.ts see the AI suggestion."""
    _, session_id, trees, _, _, _ = visit
    expert = client(supabase_env, "expert")
    try:
        queue = expert.select(
            "assessment",
            {
                "session_id": f"eq.{session_id}",
                "tree_id": "not.is.null",
                "select": "id,tree_id,source,overall_class,confidence,assessed_at,created_at",
            },
        )
        assert {(r["source"], r["tree_id"]) for r in queue} == {("ai", t) for t in trees.values()}
        assert all(r["confidence"] is not None for r in queue)

        tree = trees["S1-2"]
        (suggestion,) = expert.select(
            "assessment",
            {
                "tree_id": f"eq.{tree}",
                "session_id": f"in.({session_id})",
                "select": "id,session_id,source,overall_class,confidence,model_name,"
                "model_version,notes,assessed_at,created_at,assessment_measurement(measurement_id)",
            },
        )
        values = expert.select(
            "measurement",
            {
                "tree_id": f"eq.{tree}",
                "session_id": f"in.({session_id})",
                "select": "id,metric_definition_id,value_scale,value_category,value_boolean,"
                "uncertainty,source",
            },
        )
        linked = {link["measurement_id"] for link in suggestion["assessment_measurement"]}
        assert linked == {m["id"] for m in values}
        assert suggestion["model_name"] == SONNET
        (detail,) = expert.select(
            "ai_assessment_detail",
            {
                "assessment_id": f"eq.{suggestion['id']}",
                "select": "tree_visible,flags,review_reasons",
                "order": "assessment_id",
            },
        )
        assert detail["tree_visible"] == "yes"
    finally:
        expert.close()


def test_field_staff_cannot_write_ai_rows(visit, supabase_env):
    _, session_id, trees, _, _, _ = visit
    field = client(supabase_env, "field")
    try:
        with pytest.raises(PermissionDenied):
            field.rpc(
                "save_ai_assessment",
                {
                    "p_session_id": session_id,
                    "p_tree_id": trees["S1-3"],
                    "p_overall_class": "healthy",
                    "p_confidence": 0.9,
                    "p_model_name": HAIKU,
                    "p_model_version": HAIKU,
                    "p_methodology_version": "methodology-v0",
                    "p_notes": None,
                    "p_measurements": [],
                    "p_evidence_asset_ids": [],
                    "p_detail": {"prompt_version": "x", "config_key": "y", "tree_visible": "yes"},
                },
            )
    finally:
        field.close()


def test_eval_against_expert_decisions(visit, supabase_env):
    """Runs last: the expert accepts S1-1 and corrects S1-2; eval compares."""
    from orchados_ai_worker.evaluate import evaluate

    ops, session_id, trees, _, _, _ = visit
    dead = ops.select("metric_definition", {"code": "eq.dead_branch_scale", "select": "id"})[0]
    expert = client(supabase_env, "expert")
    try:
        for code, cls, value in (("S1-1", "healthy", 0), ("S1-2", "attention", 2)):
            expert.rpc(
                "save_expert_assessment",
                {
                    "p_session_id": session_id,
                    "p_tree_id": trees[code],
                    "p_overall_class": cls,
                    "p_measurements": [
                        {
                            "metric_definition_id": dead["id"],
                            "value_scale": value,
                            "uncertainty": 0.5,
                        }
                    ],
                    "p_evidence_asset_ids": [],
                    "p_method_version": "methodology-v0",
                },
            )
        r = evaluate(SupabaseCatalog(expert), session_ids=[session_id])
    finally:
        expert.close()
    assert r["trees"] == 2
    assert r["confusion"]["healthy"]["healthy"] == 1
    assert r["confusion"]["problem"]["attention"] == 1
    assert r["metrics"]["dead_branch_scale"]["exact"] == 1
    assert r["mandatory_reasons"]["flagged_class"] == 1
