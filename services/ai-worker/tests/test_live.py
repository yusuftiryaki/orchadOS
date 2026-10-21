"""Real Claude API (optional): uv run pytest -m live, with ANTHROPIC_API_KEY set.

Never runs in CI. Sends one synthetic tree (no real orchard images) to the
triage model with the same parameters a batch request would carry, without
the batch (an answer in seconds instead of minutes), and checks the answer
against the schema. Costs well under a cent.
"""

from __future__ import annotations

import pytest
from conftest import jpeg

from orchados_ai_worker.config import WorkerConfig
from orchados_ai_worker.mosaic import build_mosaic
from orchados_ai_worker.prompt import TreeInput, request_params
from orchados_ai_worker.schema import parse_message, season_metrics

pytestmark = pytest.mark.live


def test_one_synthetic_tree(registry):
    import anthropic

    metrics = season_metrics(registry, "winter")
    tree = TreeInput(
        tree_code="S1-1",
        season="winter",
        mosaic=build_mosaic({d: jpeg(size=(512, 512)) for d in "NESW"}),
        directions=("N", "E", "S", "W"),
        staff_answers={"dead_branch_present": False},
    )
    params = request_params(tree, metrics, "methodology-v0", WorkerConfig().triage)
    client = anthropic.Anthropic()
    tokens = client.messages.count_tokens(
        model=params["model"],
        system=params["system"],
        messages=params["messages"],
        thinking=params["thinking"],
        output_config=params["output_config"],
    )
    assert tokens.input_tokens > 1000
    message = client.messages.create(**params)
    out = parse_message(message.model_dump(mode="json"), metrics)
    assert out.tree_visible in ("yes", "no", "unsure")
    print(f"input tokens {tokens.input_tokens}; usage {message.usage}; answer {out.to_json()}")
