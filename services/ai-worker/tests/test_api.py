"""AnthropicBatchApi through the real SDK, with a mock HTTP transport (no network, no key)."""

from __future__ import annotations

import json

import anthropic
import httpx2
from conftest import jpeg
from fakes import answer, message

from orchados_ai_worker.api import AnthropicBatchApi
from orchados_ai_worker.config import WorkerConfig
from orchados_ai_worker.mosaic import build_mosaic
from orchados_ai_worker.prompt import TreeInput, request_params
from orchados_ai_worker.schema import parse_message, season_metrics


def test_create_status_results(registry):
    seen: list[httpx2.Request] = []
    batch = {
        "id": "msgbatch_x",
        "type": "message_batch",
        "processing_status": "ended",
        "request_counts": {
            "processing": 0,
            "succeeded": 1,
            "errored": 0,
            "canceled": 0,
            "expired": 0,
        },
        "created_at": "2027-01-15T10:00:00Z",
        "expires_at": "2027-01-16T10:00:00Z",
        "ended_at": "2027-01-15T10:05:00Z",
        "archived_at": None,
        "cancel_initiated_at": None,
        "results_url": "https://api.anthropic.com/v1/messages/batches/msgbatch_x/results",
    }
    result = {
        "custom_id": "s1-abc",
        "result": {"type": "succeeded", "message": message("claude-haiku-5-5", answer())},
    }

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        if request.url.path.endswith("/results"):
            return httpx2.Response(200, content=json.dumps(result) + "\n")
        return httpx2.Response(200, json=batch)

    client = anthropic.Anthropic(
        api_key="test-key", http_client=httpx2.Client(transport=httpx2.MockTransport(handler))
    )
    api = AnthropicBatchApi(client)
    metrics = season_metrics(registry, "winter")
    tree = TreeInput("S1-1", "winter", build_mosaic({"N": jpeg()}, 256), ("N",))
    params = request_params(tree, metrics, "methodology-v0", WorkerConfig().triage)

    assert api.create([{"custom_id": "s1-abc", "params": params}]) == "msgbatch_x"
    sent = json.loads(seen[0].content)
    assert seen[0].url.path == "/v1/messages/batches"
    assert sent["requests"][0]["params"] == json.loads(json.dumps(params))
    assert api.status("msgbatch_x") == "ended"
    (item,) = list(api.results("msgbatch_x"))
    assert item["custom_id"] == "s1-abc"
    assert parse_message(item["result"]["message"], metrics).overall_class == "healthy"
