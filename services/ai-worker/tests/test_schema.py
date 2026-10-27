from __future__ import annotations

import copy
import json

import pytest

from orchados_ai_worker.schema import (
    FLAGS,
    OutputError,
    output_schema,
    parse_message,
    season_metrics,
    validate,
)


def answer(**kw):
    base = {
        "rationale": "Kuzey ve doğuda kuru dal görünüyor.",
        "tree_visible": "yes",
        "values": {
            "dead_branch_scale": {"value": 2, "confidence": 0.8},
            "trunk_base_scale": {"value": None, "confidence": 0.6},
            "pruning_status": {"value": "done", "confidence": 0.9},
            "basal_sprout_level": {"value": "few", "confidence": 0.7},
        },
        "overall_class": "attention",
        "class_confidence": 0.75,
        "flags": [],
    }
    base.update(kw)
    return base


@pytest.fixture
def winter(registry):
    return season_metrics(registry, "winter")


def test_valid_answer(winter):
    out = validate(json.dumps(answer()), winter)
    assert out.overall_class == "attention" and out.class_confidence == 0.75
    assert out.given() == {
        "dead_branch_scale": 2,
        "pruning_status": "done",
        "basal_sprout_level": "few",
    }
    assert out.values["trunk_base_scale"].confidence == 0.6
    assert validate(out.to_json(), winter).to_json() == out.to_json()


@pytest.mark.parametrize(
    "change, message",
    [
        (lambda a: a["values"]["dead_branch_scale"].update(value=4), "dead_branch_scale"),
        (lambda a: a["values"]["dead_branch_scale"].update(value=True), "dead_branch_scale"),
        (lambda a: a["values"]["pruning_status"].update(value="maybe"), "pruning_status"),
        (lambda a: a["values"]["pruning_status"].update(confidence=1.2), "outside 0..1"),
        (lambda a: a["values"].pop("trunk_base_scale"), "season's metrics"),
        (lambda a: a["values"].update(crown_density_scale={"value": 1, "confidence": 1}), "season"),
        (lambda a: a.update(overall_class="sick"), "overall_class"),
        (lambda a: a.update(class_confidence=-0.1), "outside 0..1"),
        (lambda a: a.update(tree_visible="perhaps"), "tree_visible"),
        (lambda a: a.update(flags=["bad_weather"]), "flags"),
        (lambda a: a.update(extra=1), "unexpected keys"),
    ],
)
def test_invalid_answers(winter, change, message):
    a = copy.deepcopy(answer())
    change(a)
    with pytest.raises(OutputError, match=message):
        validate(a, winter)


def test_not_json(winter):
    with pytest.raises(OutputError, match="not JSON"):
        validate("{oops", winter)


def test_pest_type_without_signs_is_dropped(registry):
    spring = season_metrics(registry, "spring")
    values = {m.code: {"value": None, "confidence": 0.5} for m in spring}
    values["pest_sign_severity"] = {"value": "none", "confidence": 0.9}
    values["pest_sign_type"] = {"value": "psylla", "confidence": 0.3}
    out = validate(answer(values=values, overall_class="healthy"), spring)
    assert out.values["pest_sign_type"].value is None


def test_null_class_and_flags(winter):
    out = validate(
        answer(overall_class=None, tree_visible="unsure", flags=list(FLAGS) + ["poor_image"]),
        winter,
    )
    assert out.overall_class is None and out.flags == list(FLAGS)


def test_schema_matches_validation(registry):
    for season in ("winter", "spring", "summer", "harvest"):
        metrics = season_metrics(registry, season)
        schema = output_schema(metrics)
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"])
        props = schema["properties"]["values"]["properties"]
        assert list(props) == [m.code for m in metrics]
        for m in metrics:
            value = props[m.code]["properties"]["value"]["anyOf"]
            assert value[1] == {"type": "null"}
        # No numeric or string length constraints: the API does not support them.
        text = json.dumps(schema)
        assert "minimum" not in text and "maxLength" not in text


def test_parse_message(winter):
    msg = {
        "stop_reason": "end_turn",
        "content": [
            {"type": "thinking", "thinking": ""},
            {"type": "text", "text": json.dumps(answer())},
        ],
    }
    assert parse_message(msg, winter).overall_class == "attention"
    with pytest.raises(OutputError, match="refused"):
        parse_message({"stop_reason": "refusal", "content": []}, winter)
    with pytest.raises(OutputError, match="truncated"):
        parse_message({**msg, "stop_reason": "max_tokens"}, winter)
    with pytest.raises(OutputError, match="no text block"):
        parse_message({"stop_reason": "end_turn", "content": []}, winter)


def test_dieback_pattern_is_not_asked_in_winter(registry):
    from orchados_ai_worker.schema import season_metrics

    winter = {m.code for m in season_metrics(registry, "winter")}
    summer = {m.code for m in season_metrics(registry, "summer")}
    assert "basal_sprout_level" in winter and "dieback_pattern" not in winter
    assert {"dieback_pattern", "dried_leaves_attached", "basal_sprout_level"} <= summer


def test_dieback_and_dried_leaves_raise_the_class():
    from orchados_ai_worker.methodology import expected_class

    assert expected_class({"dead_branch_scale": 1, "dieback_pattern": "one_sided"}) == "attention"
    assert expected_class({"dead_branch_scale": 1, "dieback_pattern": "tip_dieback"}) == "healthy"
    assert expected_class({"dead_branch_scale": 1, "dried_leaves_attached": True}) == "problem"
    assert expected_class({"basal_sprout_level": "dense"}) is None


def test_methodology_v01_pest_signs():
    from orchados_ai_worker.methodology import expected_class

    v0, v01 = "methodology-v0", "methodology-v0.1"
    assert expected_class({"dead_branch_scale": 0, "pest_sign_severity": "mild"}, v0) == "attention"
    assert expected_class({"dead_branch_scale": 0, "pest_sign_severity": "mild"}, v01) == "healthy"
    assert expected_class({"dead_branch_scale": 0, "pest_sign_severity": "marked"}, v0) == "problem"
    assert (
        expected_class({"dead_branch_scale": 0, "pest_sign_severity": "marked"}, v01) == "attention"
    )


def test_prompt_class_rules_follow_the_version(registry):
    from orchados_ai_worker.prompt import system_prompt

    spring = season_metrics(registry, "spring")
    v0 = system_prompt("spring", spring, "methodology-v0")
    v01 = system_prompt("spring", spring, "methodology-v0.1")
    assert "pest signs are marked, or dried leaves" in v0
    assert "Mild pest signs do not change the class." in v01
    assert "4. attention: any 0-3 scale above is 2, pest signs are marked" in v01


def winter_dead(**kw):
    return answer(
        overall_class="dead",
        class_confidence=0.6,
        rationale="Ağaç cansız görünüyor.",
        **kw,
    )


def test_winter_dead_becomes_problem_in_v01(winter):
    from orchados_ai_worker.schema import WINTER_DEAD_NOTE, apply_worker_rules

    out = apply_worker_rules(validate(winter_dead(), winter), "winter", "methodology-v0.1")
    assert out.overall_class == "problem" and out.class_confidence == 0.6
    assert out.values["dead_branch_scale"].value == 3
    assert out.values["dead_branch_scale"].confidence == 0.6
    assert out.flags == ["winter_dead_downgraded"]
    assert out.rationale == f"Ağaç cansız görünüyor. {WINTER_DEAD_NOTE}"
    # Stored with the worker flag, read back as is; applying again changes nothing.
    again = validate(out.to_json(), winter)
    assert again.to_json() == out.to_json()
    assert apply_worker_rules(again, "winter", "methodology-v0.1").to_json() == out.to_json()

    # A 3 the model gave keeps its own confidence.
    values = copy.deepcopy(answer()["values"])
    values["dead_branch_scale"] = {"value": 3, "confidence": 0.9}
    kept = apply_worker_rules(
        validate(winter_dead(values=values), winter), "winter", "methodology-v0.1"
    )
    assert kept.values["dead_branch_scale"].confidence == 0.9


def test_winter_dead_rule_only_for_v01_winter(winter, registry):
    from orchados_ai_worker.schema import apply_worker_rules

    v0 = apply_worker_rules(validate(winter_dead(), winter), "winter", "methodology-v0")
    assert v0.overall_class == "dead" and v0.flags == []
    assert v0.values["dead_branch_scale"].value == 2
    spring = season_metrics(registry, "spring")
    values = {m.code: {"value": None, "confidence": 0.5} for m in spring}
    leafy = validate(answer(values=values, overall_class="dead"), spring)
    assert apply_worker_rules(leafy, "spring", "methodology-v0.1").overall_class == "dead"


def test_model_cannot_set_worker_flags(winter):
    msg = {
        "stop_reason": "end_turn",
        "content": [
            {"type": "text", "text": json.dumps(answer(flags=["winter_dead_downgraded"]))},
        ],
    }
    assert parse_message(msg, winter).flags == []
