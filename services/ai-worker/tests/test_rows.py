from __future__ import annotations

import pytest

from orchados_ai_worker.rows import measurements, save_args, uncertainty
from orchados_ai_worker.schema import season_metrics, validate


@pytest.fixture
def spring(registry):
    return season_metrics(registry, "spring")


def output(spring, **values):
    vals = {m.code: {"value": None, "confidence": 0.4} for m in spring}
    for code, (v, c) in values.items():
        vals[code] = {"value": v, "confidence": c}
    return validate(
        {
            "rationale": " Kuzeyde kuru dal. ",
            "tree_visible": "unsure",
            "values": vals,
            "overall_class": None,
            "class_confidence": 0.3,
            "flags": ["poor_image"],
        },
        spring,
    )


def test_uncertainty_maps_confidence_to_scale_steps(spring):
    scale = next(m for m in spring if m.code == "dead_branch_scale")
    cat = next(m for m in spring if m.code == "pest_sign_severity")
    assert uncertainty(scale, 1.0) == 0.0
    assert uncertainty(scale, 0.0) == 1.5
    assert uncertainty(scale, 0.8) == pytest.approx(0.3)
    assert uncertainty(cat, 0.5) is None


def test_only_given_values_become_measurements(spring, registry):
    out = output(
        spring,
        dead_branch_scale=(2, 0.75),
        pest_sign_severity=("mild", 0.6),
        pest_sign_type=("psylla", 0.5),
    )
    rows = measurements(out, spring)
    ids = {r["code"]: r["id"] for r in registry}
    assert rows == [
        {
            "metric_definition_id": ids["dead_branch_scale"],
            "value_scale": 2,
            "confidence": 0.75,
            "uncertainty": pytest.approx(0.375),
        },
        {
            "metric_definition_id": ids["pest_sign_severity"],
            "value_category": "mild",
            "confidence": 0.6,
            "uncertainty": None,
        },
        {
            "metric_definition_id": ids["pest_sign_type"],
            "value_category": "psylla",
            "confidence": 0.5,
            "uncertainty": None,
        },
    ]


def test_boolean_values(registry):
    harvest = season_metrics(registry, "harvest")
    vals = {m.code: {"value": None, "confidence": 0.5} for m in harvest}
    vals["branch_break"] = {"value": False, "confidence": 0.9}
    out = validate(
        {
            "rationale": "",
            "tree_visible": "yes",
            "values": vals,
            "overall_class": "healthy",
            "class_confidence": 0.9,
            "flags": [],
        },
        harvest,
    )
    (row,) = measurements(out, harvest)
    assert row["value_boolean"] is False and row["uncertainty"] is None


def test_save_args(spring):
    out = output(spring, dead_branch_scale=(1, 0.9))
    outcomes = [
        {
            "round": 1,
            "stage": 1,
            "model": "claude-haiku-5-5",
            "batch_id": "b1",
            "output": None,
            "usage": {"input_tokens": 1000, "output_tokens": 100},
        },
        {
            "round": 1,
            "stage": 2,
            "model": "claude-sonnet-5-5",
            "served_model": "claude-sonnet-5-5-x",
            "batch_id": "b2",
            "output": out.to_json(),
            "usage": {"input_tokens": 2000, "output_tokens": 500, "cache_read_input_tokens": 3000},
        },
    ]
    args = save_args(
        session_id="s",
        tree_id="t",
        methodology_version="methodology-v0",
        prompt_version="ai-v0.1/methodology-v0",
        config_key="claude-haiku-5-5>claude-sonnet-5-5",
        params_hash="h",
        metrics=spring,
        outcomes=outcomes,
        final=outcomes[1],
        output=out,
        review_reasons=["no_answer"],
        evidence_asset_ids=["c2", "c1"],
    )
    # No class: no class confidence either.
    assert args["p_overall_class"] is None and args["p_confidence"] is None
    assert args["p_model_name"] == "claude-sonnet-5-5"
    assert args["p_model_version"] == "claude-sonnet-5-5-x"
    assert args["p_notes"] == "Kuzeyde kuru dal."
    assert args["p_evidence_asset_ids"] == ["c1", "c2"]
    d = args["p_detail"]
    assert d["models"] == ["claude-haiku-5-5", "claude-sonnet-5-5"]
    assert d["final_stage"] == 2 and d["tree_visible"] == "unsure" and d["flags"] == ["poor_image"]
    assert (d["input_tokens"], d["output_tokens"], d["cache_read_input_tokens"]) == (
        3000,
        600,
        3000,
    )
    # Batch prices: Haiku 1000*0.10+100*0.50; Sonnet 2000*2+500*10+3000*0.2; halved, per million.
    assert d["cost_usd"] == pytest.approx((150 + 9600) / 1e6 / 2)
    assert d["batch_ids"] == ["b1", "b2"]
