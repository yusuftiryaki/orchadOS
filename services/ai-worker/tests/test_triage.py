from __future__ import annotations

import pytest

from orchados_ai_worker.schema import AiOutput, MetricValue
from orchados_ai_worker.triage import StageOutcome, final_outcome, hard_reasons, review_reasons


def out(cls="healthy", conf=0.9, visible="yes", flags=(), **values) -> AiOutput:
    values = values or {"dead_branch_scale": 0, "trunk_base_scale": 1}
    return AiOutput(
        rationale="",
        tree_visible=visible,
        values={c: MetricValue(c, v, 0.9) for c, v in values.items()},
        overall_class=cls,
        class_confidence=conf,
        flags=list(flags),
    )


def test_confident_healthy_stays():
    assert review_reasons(out(), 0.7) == []
    assert review_reasons(out("attention", 0.7, dead_branch_scale=2), 0.7) == []


@pytest.mark.parametrize(
    "answer, reason",
    [
        (None, "no_answer"),
        (out(conf=0.69), "low_confidence"),
        (out(cls=None, conf=0.9), "no_class"),
        (out("problem", dead_branch_scale=3), "class_problem"),
        (out("dead"), "class_dead"),
        (out("absent", visible="no"), "class_absent"),
        (out(flags=["poor_image"]), "flag_poor_image"),
        (out(flags=["staff_answer_conflict"]), "flag_staff_answer_conflict"),
        (out(flags=["large_change_from_previous"]), "flag_large_change_from_previous"),
        (out(visible="unsure"), "tree_visible_unsure"),
        (out("healthy", dead_branch_scale=2), "class_inconsistent"),
        (out("attention", pest_sign_severity="marked"), "class_inconsistent"),
    ],
)
def test_review_reasons(answer, reason):
    assert reason in review_reasons(answer, 0.7)


def test_threshold_is_configurable():
    assert review_reasons(out(conf=0.75), 0.8) == ["low_confidence"]
    assert review_reasons(out(conf=0.75), 0.7) == []


def test_hard_reasons():
    assert hard_reasons(None, 0.5) == ["no_answer"]
    assert hard_reasons(out(conf=0.4), 0.5) == ["low_confidence"]
    assert hard_reasons(out("problem", conf=0.6, dead_branch_scale=3), 0.5) == []


def test_final_outcome_is_the_last_usable_stage():
    a = StageOutcome(1, "claude-haiku-5-5", out())
    b = StageOutcome(2, "claude-sonnet-5-5", out("attention", dead_branch_scale=2))
    failed = StageOutcome(2, "claude-sonnet-5-5", None, error="refused")
    assert final_outcome([a, b]) is b
    assert final_outcome([a, failed]) is a
    assert final_outcome([StageOutcome(1, "claude-haiku-5-5", None, error="x")]) is None
