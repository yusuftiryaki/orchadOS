"""End to end with the fake Batches API: submit -> results -> rows -> rerun / resume."""

from __future__ import annotations

import base64
import json
from dataclasses import replace

import pytest
from fakes import PERSONAL, FakeBatchApi, answer, make_catalog, message, scripted, tid

from orchados_ai_worker.cli import main
from orchados_ai_worker.config import HARD_MODEL, StageConfig, WorkerConfig
from orchados_ai_worker.worker import RunOptions, Worker, WorkerError

HAIKU, SONNET = "claude-haiku-5-5", "claude-sonnet-5-5"


def worker(cat, api, tmp_path, cfg=None, **opts) -> Worker:
    return Worker(
        cat,
        api,
        cfg or WorkerConfig(poll_interval_s=0),
        tmp_path / "state",
        RunOptions(**opts),
        log=lambda _: None,
        sleep=lambda _: None,
    )


def default_api(**kw) -> FakeBatchApi:
    return FakeBatchApi(
        scripted(
            {
                HAIKU: {
                    "S1-2": answer("problem", 0.8, {"dead_branch_scale": 3}),
                    "S1-3": answer("healthy", 0.5),
                },
                SONNET: {
                    "S1-2": answer("problem", 0.9, {"dead_branch_scale": 3}, ["poor_image"]),
                    "S1-3": answer("attention", 0.8, {"dead_branch_scale": 2}),
                },
            }
        ),
        **kw,
    )


def test_submit_results_write(tmp_path):
    cat, api = make_catalog(), default_api()
    report = worker(cat, api, tmp_path).run(cat.session_row.id)

    # Stage 1: every tree to Haiku; stage 2: the problem and the low-confidence tree.
    assert [len(b) for b in api.batches.values()] == [3, 2]
    assert {r["params"]["model"] for r in api.batches["msgbatch_001"]} == {HAIKU}
    assert {r["params"]["model"] for r in api.batches["msgbatch_002"]} == {SONNET}
    assert report.status == "done" and report.sent == 3 and report.written == 3
    assert report.final_models == {HAIKU: 1, SONNET: 2}

    rows = {a["p_tree_id"]: a for a in cat.saved}
    s11, s12, s13 = rows[tid("S1-1")], rows[tid("S1-2")], rows[tid("S1-3")]
    assert (s11["p_overall_class"], s11["p_model_name"]) == ("healthy", HAIKU)
    assert s11["p_detail"]["models"] == [HAIKU] and s11["p_detail"]["review_reasons"] == []
    assert (s12["p_overall_class"], s12["p_model_name"]) == ("problem", SONNET)
    assert s12["p_detail"]["review_reasons"] == ["class_problem"]
    assert s12["p_detail"]["flags"] == ["poor_image"]
    assert s12["p_detail"]["models"] == [HAIKU, SONNET] and s12["p_detail"]["final_stage"] == 2
    assert s13["p_detail"]["review_reasons"] == ["low_confidence"]
    assert s13["p_confidence"] == 0.8

    # Row contents: method version is the prompt version; evidence = the 4 crops.
    assert s12["p_methodology_version"] == "methodology-v0"
    assert s12["p_detail"]["prompt_version"] == "ai-v0.1/methodology-v0"
    assert s12["p_detail"]["config_key"] == f"{HAIKU}>{SONNET}"
    assert len(s12["p_evidence_asset_ids"]) == 4
    assert s12["p_notes"] == "Ağaç sağlıklı görünüyor."
    values = {m["metric_definition_id"]: m for m in s12["p_measurements"]}
    dead = next(r for r in cat.registry if r["code"] == "dead_branch_scale")["id"]
    assert values[dead]["value_scale"] == 3 and values[dead]["uncertainty"] == pytest.approx(0.225)
    assert s12["p_detail"]["batch_ids"] == ["msgbatch_001", "msgbatch_002"]
    assert s12["p_detail"]["input_tokens"] == 6000 and s12["p_detail"]["cost_usd"] > 0

    assert report.cost["total"]["requests"] == 5
    assert report.cost["models"][HAIKU]["requests"] == 3
    assert (tmp_path / "state").rglob("report.json")


def test_no_personal_data_in_requests(tmp_path):
    cat, api = make_catalog(), default_api()
    cat.answers = {tid("S1-1"): {"trunk_damage_present": True, "pruned": False}}
    worker(cat, api, tmp_path).run(cat.session_row.id)
    body = json.dumps(api.requests, ensure_ascii=False)
    for value in PERSONAL.values():
        assert value not in body
    # Images are the mosaics only; text is tree code, season, answers by code.
    s11 = next(r for r in api.requests if "Tree S1-1," in json.dumps(r))
    content = s11["params"]["messages"][0]["content"]
    assert "- pruned: no" in json.dumps(content) and "- trunk_damage_present: yes" in json.dumps(
        content
    )
    images = [b for b in content if b["type"] == "image"]
    assert len(images) == 2  # this visit and the previous one
    assert all(base64.b64decode(i["source"]["data"])[:2] == b"\xff\xd8" for i in images)
    allowed = {"model", "max_tokens", "system", "messages", "thinking", "output_config"}
    assert all(set(r["params"]) == allowed for r in api.requests)


def test_rerun_writes_nothing_new(tmp_path):
    cat, api = make_catalog(), default_api()
    worker(cat, api, tmp_path).run(cat.session_row.id)
    downloads = cat.downloads

    again = worker(cat, api, tmp_path).run(cat.session_row.id)
    assert again.status == "nothing_to_do" and again.already_done == 3
    assert len(api.batches) == 2 and len(cat.saved) == 3 and cat.downloads == downloads

    # A fresh state folder (another station): the database still says done.
    fresh = worker(cat, api, tmp_path / "other").run(cat.session_row.id)
    assert fresh.status == "nothing_to_do" and len(api.batches) == 2

    # A new prompt cascade is a new result.
    cfg = WorkerConfig(poll_interval_s=0, review=StageConfig("claude-opus-5-5", "medium"))
    worker(cat, api, tmp_path, cfg).run(cat.session_row.id)
    assert len(cat.saved) == 6


def test_resume_after_no_wait(tmp_path, capsys):
    cat, api = make_catalog(), default_api(polls_until_ended=3)
    first = worker(cat, api, tmp_path, wait=False).run(cat.session_row.id)
    assert first.status == "pending" and len(api.batches) == 1 and not cat.saved

    # resume polls the same batch; it is still running.
    second = worker(cat, api, tmp_path, wait=False).run(cat.session_row.id, resume_only=True)
    assert second.status == "pending" and len(api.batches) == 1

    # Through the command line, waiting: finishes both stages, nothing submitted twice.
    (tmp_path / "fast.json").write_text('{"poll_interval_s": 0}')
    args = ["resume", "--session-id", cat.session_row.id, "--state-dir", str(tmp_path / "state")]
    args += ["--config", str(tmp_path / "fast.json")]
    assert main(args, catalog=cat, api=api) == 0
    out = capsys.readouterr().out
    assert "written: 3 AI assessments" in out and "cost (batch prices, estimate)" in out
    assert len(api.batches) == 2 and len(cat.saved) == 3


def test_resume_without_a_job(tmp_path):
    cat = make_catalog()
    with pytest.raises(WorkerError, match="nothing to resume"):
        worker(cat, default_api(), tmp_path).run(cat.session_row.id, resume_only=True)


def test_interrupted_write_continues(tmp_path):
    cat, api = make_catalog(), default_api()
    cat.fail_save_after = 1
    with pytest.raises(ConnectionError):
        worker(cat, api, tmp_path).run(cat.session_row.id)
    assert len(cat.saved) == 1
    cat.fail_save_after = None
    report = worker(cat, api, tmp_path).run(cat.session_row.id, resume_only=True)
    assert report.written == 2 and len(cat.saved) == 3 and len(api.batches) == 2


def test_failed_review_keeps_the_triage_answer(tmp_path):
    cat = make_catalog(("S1-1",))
    refusal = {"stop_reason": "refusal", "content": [], "model": SONNET, "usage": {}}
    api = FakeBatchApi(scripted({HAIKU: {"S1-1": answer("dead", 0.9)}, SONNET: {"S1-1": refusal}}))
    report = worker(cat, api, tmp_path).run(cat.session_row.id)
    (row,) = cat.saved
    assert row["p_model_name"] == HAIKU and row["p_overall_class"] == "dead"
    assert row["p_detail"]["models"] == [HAIKU, SONNET]
    assert row["p_detail"]["final_stage"] == 1
    assert report.final_models == {HAIKU: 1}


def test_no_usable_answer_is_retried_later(tmp_path):
    cat = make_catalog(("S1-1", "S1-2"))
    broken = {"type": "errored", "error": {"type": "error", "error": {"type": "overloaded_error"}}}
    api = FakeBatchApi(
        scripted({HAIKU: {"S1-2": message(HAIKU, "{not json")}, SONNET: {"S1-2": broken}})
    )
    report = worker(cat, api, tmp_path).run(cat.session_row.id)
    assert report.written == 1 and report.no_answer == ["S1-2"]

    api.respond = scripted({})
    retry = worker(cat, api, tmp_path).run(cat.session_row.id)
    assert retry.sent == 1 and retry.written == 1 and len(cat.saved) == 2
    assert [len(b) for b in api.batches.values()] == [2, 1, 1]


def test_unblurred_crops_are_not_sent(tmp_path):
    cat, api = make_catalog(blurred=False), default_api()
    report = worker(cat, api, tmp_path).run(cat.session_row.id)
    assert report.status == "nothing_to_do" and not api.batches
    assert report.skipped == {"unblurred_crops": 12, "no_crops": 3}

    allowed = worker(cat, api, tmp_path, allow_unblurred=True).run(cat.session_row.id)
    assert allowed.written == 3


def test_published_session_needs_no_write(tmp_path):
    cat, api = make_catalog(status="published"), default_api()
    with pytest.raises(WorkerError, match="--no-write"):
        worker(cat, api, tmp_path).run(cat.session_row.id)
    report = worker(cat, api, tmp_path, write=False).run(cat.session_row.id)
    assert report.written == 0 and not cat.saved and report.sent == 3


def test_without_previous_visit_one_image(tmp_path):
    cat, api = make_catalog(("S1-1",), previous=False), default_api()
    worker(cat, api, tmp_path).run(cat.session_row.id)
    content = api.requests[0]["params"]["messages"][0]["content"]
    assert sum(b["type"] == "image" for b in content) == 1
    assert "There is no previous published visit." in json.dumps(content)


def test_spring_visit_uses_spring_scales(tmp_path):
    from datetime import UTC, datetime

    cat = make_catalog(("S1-1",), when=datetime(2027, 4, 20, tzinfo=UTC))
    api = FakeBatchApi(scripted({HAIKU: {"S1-1": answer(season="spring")}}))
    worker(cat, api, tmp_path).run(cat.session_row.id)
    schema = api.requests[0]["params"]["output_config"]["format"]["schema"]
    assert "crown_density_scale" in schema["properties"]["values"]["properties"]
    (row,) = cat.saved
    # pest_sign_type was null: not written.
    assert len(row["p_measurements"]) == 5


def test_hard_stage(tmp_path):
    cat = make_catalog(("S1-1", "S1-2"))
    api = FakeBatchApi(
        scripted(
            {
                HAIKU: {"S1-1": answer(conf=0.3), "S1-2": answer(conf=0.3)},
                SONNET: {"S1-1": answer(conf=0.4), "S1-2": answer(conf=0.8)},
                HARD_MODEL: {"S1-1": answer("attention", 0.7, {"dead_branch_scale": 2})},
            }
        )
    )
    cfg = WorkerConfig.load(None, with_hard=True)
    report = worker(cat, api, tmp_path, replace(cfg, poll_interval_s=0)).run(cat.session_row.id)
    assert [len(b) for b in api.batches.values()] == [2, 2, 1]
    assert report.final_models == {SONNET: 1, HARD_MODEL: 1}
    row = next(a for a in cat.saved if a["p_tree_id"] == tid("S1-1"))
    assert row["p_detail"]["review_reasons"] == ["low_confidence", "hard_low_confidence"]
    assert row["p_detail"]["config_key"] == f"{HAIKU}>{SONNET}>{HARD_MODEL}"


def test_large_stages_are_split_into_batches(tmp_path):
    cat, api = make_catalog(), default_api()
    worker(cat, api, tmp_path, max_batch_bytes=1).run(cat.session_row.id)
    assert [len(b) for b in api.batches.values()] == [1, 1, 1, 1, 1]
    assert len(cat.saved) == 3


def test_limit(tmp_path):
    cat, api = make_catalog(), default_api()
    report = worker(cat, api, tmp_path, limit=1).run(cat.session_row.id)
    assert report.sent == 1 and report.skipped == {"over_limit": 2}
    report = worker(cat, api, tmp_path).run(cat.session_row.id)
    assert report.sent == 2 and len(cat.saved) == 3
