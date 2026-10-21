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
    assert out.given() == {"dead_branch_scale": 2, "pruning_status": "done"}
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
