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
from orchados_ai_worker.schema import season_metrics


def tree(**kw) -> TreeInput:
    m = build_mosaic({"N": jpeg(), "S": jpeg()}, size=256)
    base = dict(tree_code="S5-12", season="winter", mosaic=m, directions=("N", "S"))
    base.update(kw)
    return TreeInput(**base)


def test_season_metrics_follow_the_registry(registry):
    codes = {s: [m.code for m in season_metrics(registry, s)] for s in SEASONS}
    assert codes["winter"] == ["dead_branch_scale", "trunk_base_scale", "pruning_status"]
    assert codes["spring"] == [
        "dead_branch_scale",
        "trunk_base_scale",
        "crown_density_scale",
        "frost_damage_scale",
        "pest_sign_severity",
        "pest_sign_type",
    ]
    assert "fruit_load_scale" in codes["summer"]
    # Parcel metrics, numeric quantities and staff questions are not asked of the AI.
    assert codes["harvest"] == [
        "dead_branch_scale",
        "trunk_base_scale",
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
    assert prompt_version(None) == "ai-v0.1/methodology-v0"
    assert prompt_version("methodology-v0") == "ai-v0.1/methodology-v0"
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
