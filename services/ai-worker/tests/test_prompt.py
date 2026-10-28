from __future__ import annotations

import base64
import io
import json

import pytest
from conftest import jpeg
from PIL import Image

from orchados_ai_worker.config import WorkerConfig
from orchados_ai_worker.methodology import SEASONS
from orchados_ai_worker.mosaic import build_mosaic
from orchados_ai_worker.prompt import (
    TreeInput,
    prompt_version,
    request_params,
    system_prompt,
    user_content,
)
from orchados_ai_worker.schema import FLAGS, output_schema, season_metrics


def tree(**kw) -> TreeInput:
    m = build_mosaic({"N": jpeg(), "S": jpeg()}, size=256)
    base = dict(tree_code="S5-12", season="winter", mosaic=m, directions=("N", "S"))
    base.update(kw)
    return TreeInput(**base)


def test_season_metrics_follow_the_registry(registry):
    codes = {s: [m.code for m in season_metrics(registry, s)] for s in SEASONS}
    assert codes["winter"] == [
        "dead_branch_scale",
        "trunk_base_scale",
        "pruning_status",
        "basal_sprout_level",
    ]
    assert codes["spring"] == [
        "dead_branch_scale",
        "trunk_base_scale",
        "crown_density_scale",
        "frost_damage_scale",
        "pest_sign_severity",
        "pest_sign_type",
        "basal_sprout_level",
        "dieback_pattern",
        "dried_leaves_attached",
    ]
    assert "fruit_load_scale" in codes["summer"]
    # Pre-harvest visit (summer under methodology-v0.2): broken branches too,
    # but not on visits of earlier versions.
    assert "branch_break" not in codes["summer"]
    v02_summer = [m.code for m in season_metrics(registry, "summer", "methodology-v0.2")]
    assert "branch_break" in v02_summer
    v02_winter = [m.code for m in season_metrics(registry, "winter", "methodology-v0.2")]
    assert "frost_damage_scale" not in v02_winter
    # Frost damage is in the winter registry (late March) but only the expert enters it.
    assert "frost_damage_scale" not in codes["winter"]
    # Parcel metrics, numeric quantities and staff questions are not asked of the AI.
    assert codes["harvest"] == [
        "dead_branch_scale",
        "trunk_base_scale",
        "basal_sprout_level",
        "dieback_pattern",
        "dried_leaves_attached",
        "harvest_complete",
        "branch_break",
    ]
    # A code missing from the registry is not asked either.
    without = [r for r in registry if r["code"] != "trunk_base_scale"]
    assert "trunk_base_scale" not in [m.code for m in season_metrics(without, "winter")]


def test_system_prompt_is_per_season_and_stable(registry):
    texts = {}
    for s in SEASONS:
        metrics = season_metrics(registry, s)
        a = system_prompt(s, metrics, "methodology-v0")
        assert a == system_prompt(s, metrics, "methodology-v0")  # cacheable prefix
        for m in metrics:
            assert f"### {m.code}:" in a
        texts[s] = a
    assert len(set(texts.values())) == 4
    w = texts["winter"]
    assert "Do not diagnose" in w and "give no value (null)" in w
    assert "do not suggest the class 'dead' in winter" in w
    assert "1. absent" in w and "5. healthy" in w
    assert "crown_density_scale" not in w  # not a winter scale
    assert "rationale" in w and "staff_answer_conflict" in w


def test_prompt_version_is_bound_to_the_methodology():
    assert prompt_version(None) == "ai-v0.3/methodology-v0"
    assert prompt_version("methodology-v0") == "ai-v0.3/methodology-v0"
    assert prompt_version("methodology-v0.2") == "ai-v0.3/methodology-v0.2"
    with pytest.raises(ValueError, match="methodology-v9"):
        prompt_version("methodology-v9")


def test_user_message_carries_images_and_answers_only():
    t = tree(
        previous_mosaic=build_mosaic({"E": jpeg()}, size=256),
        previous_directions=("E",),
        staff_answers={"dead_branch_present": True, "pruned": False, "unknown_code": True},
    )
    blocks = user_content(t)
    images = [b for b in blocks if b["type"] == "image"]
    assert len(images) == 2
    assert base64.b64decode(images[0]["source"]["data"]) == t.mosaic
    text = "\n".join(b["text"] for b in blocks if b["type"] == "text")
    assert "Tree S5-12, winter visit." in text
    assert "No crop from: E, W." in text and "No crop from: N, S, W." in text
    assert "- dead_branch_present: yes" in text and "- pruned: no" in text
    assert "unknown_code" not in text

    alone = "\n".join(b.get("text", "") for b in user_content(tree()))
    assert "There is no previous published visit." in alone
    assert "No field staff answers." in alone


def test_request_params_shape(registry):
    cfg = WorkerConfig()
    metrics = season_metrics(registry, "winter")
    p = request_params(tree(), metrics, "methodology-v0", cfg.triage)
    assert p["model"] == "claude-haiku-5-5"
    assert p["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert p["thinking"] == {"type": "adaptive"}
    assert p["output_config"]["effort"] == "low"
    schema = p["output_config"]["format"]["schema"]
    assert schema["properties"]["values"]["required"] == [m.code for m in metrics]
    # Everything after the cached system prompt is the per-tree message.
    assert [m["role"] for m in p["messages"]] == ["user"]
    # Same tree, review stage: only model, effort and max_tokens change.
    q = request_params(tree(), metrics, "methodology-v0", cfg.review)
    assert q["system"] == p["system"] and q["messages"] == p["messages"]
    assert (q["model"], q["output_config"]["effort"]) == ("claude-sonnet-5-5", "medium")


def test_no_registry_free_text_in_requests(registry):
    """Free-text registry columns (names, descriptions, question wording) never go out."""
    for s in SEASONS:
        metrics = season_metrics(registry, s)
        t = tree(season=s, staff_answers={"dead_branch_present": True})
        body = json.dumps(request_params(t, metrics, "methodology-v0", WorkerConfig().triage))
        assert "NAME-" not in body and "DESCRIPTION-" not in body


def test_mosaic_layout():
    red, blue = (220, 20, 20), (20, 20, 220)
    data = build_mosaic({"N": jpeg(red, size=(200, 200)), "W": jpeg(blue, size=(100, 300))})
    img = Image.open(io.BytesIO(data))
    assert img.format == "JPEG" and img.size == (1024, 1024)
    # Centres of the tiles: N top-left has the red crown, W bottom-right the blue one,
    # E and S are grey.
    px = img.convert("RGB").load()

    def near(p, q, tol=40):
        return all(abs(a - b) <= tol for a, b in zip(p, q, strict=True))

    assert near(px[256, 200], red)
    assert near(px[768, 700], blue)
    assert near(px[768, 256], (128, 128, 128))
    assert near(px[256, 768], (128, 128, 128))
    with pytest.raises(ValueError):
        build_mosaic({"NE": jpeg()})


def test_v01_scale_criteria_and_common_rules(registry):
    winter, summer = season_metrics(registry, "winter"), season_metrics(registry, "summer")
    v0 = system_prompt("winter", winter, "methodology-v0")
    v01 = system_prompt("winter", winter, "methodology-v0.1")
    # methodology-v0 visits keep their texts.
    assert "scaffold" not in v0 and "Borderline" not in v0 and "palm" not in v0
    assert "do not suggest the class 'dead' in winter" in v0
    assert "winter_dead_downgraded" not in v0
    # Dead branches: the scaffold branch rule and the common mistakes.
    assert "one scaffold branch is entirely dead" in v01
    assert "two or more scaffold branches are entirely dead" in v01
    assert "One entirely dead scaffold branch means at least 2, two or more mean 3" in v01
    assert "shaded inner branches" in v01 and "wet branches" in v01 and "tree behind" in v01
    # Trunk and root collar: palm-size measure; root suckers are another field.
    assert "smaller than a palm" in v01 and "root collar" in v01
    assert "root suckers are not in this scale" in v01
    # Common rule: borderline up with good evidence, no value with weak evidence.
    assert "5. Borderline values" in v01 and "give the upper one" in v01
    # Winter dead rule, as the worker enforces it.
    assert "do not suggest the class 'dead' in winter" in v01
    assert "dead_branch_scale 3 and the class 'problem'" in v01
    assert "winter_dead_downgraded" in v01
    # The model cannot set the worker's flag.
    schema = output_schema(winter)
    assert schema["properties"]["flags"]["items"]["enum"] == list(FLAGS)

    s01 = system_prompt("summer", summer, "methodology-v0.1")
    assert "compare male trees and young saplings with their own group" in s01
    assert "not sparseness" in s01
    assert "kokarca" in s01 and "Mild signs do not change the overall class" in s01
    assert "less than about a third of the branches" in s01 and "clearly male" in s01
    assert "kokarca" not in system_prompt("summer", summer, "methodology-v0")
    spring01 = system_prompt("spring", season_metrics(registry, "spring"), "methodology-v0.1")
    assert "10-50%" in spring01
    # The winter note is a winter thing.
    assert "winter_dead_downgraded" not in spring01
