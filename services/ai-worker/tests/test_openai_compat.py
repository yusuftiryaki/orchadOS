"""OpenAI-compatible provider: translation, retries, stored results, the whole run."""

from __future__ import annotations

import json

import httpx
import pytest
from fakes import PERSONAL, answer, make_catalog

from orchados_ai_worker.cli import main
from orchados_ai_worker.config import ProviderConfig, StageConfig, WorkerConfig
from orchados_ai_worker.cost import cost_usd
from orchados_ai_worker.openai_compat import OpenAICompatBatchApi, to_chat_request, to_message
from orchados_ai_worker.worker import RunOptions, Worker

MODEL = "gemma3:4b"


def params(model=MODEL):
    return {
        "model": model,
        "max_tokens": 500,
        "system": [{"type": "text", "text": "rules", "cache_control": {"type": "ephemeral"}}],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Tree S1-1"},
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"},
                    },
                ],
            }
        ],
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": {"a": 1}}},
    }


def test_request_translation():
    body = to_chat_request(params())
    assert body["messages"][0] == {"role": "system", "content": "rules"}
    parts = body["messages"][1]["content"]
    assert parts[0] == {"type": "text", "text": "Tree S1-1"}
    assert parts[1]["image_url"]["url"] == "data:image/jpeg;base64,QUJD"
    assert body["response_format"]["json_schema"]["schema"] == {"a": 1}
    assert "thinking" not in body and "output_config" not in body


def test_answer_translation():
    msg = to_message(
        {
            "model": MODEL,
            "choices": [{"message": {"content": '{"x": 1}'}, "finish_reason": "length"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 3},
        }
    )
    assert msg["content"] == [{"type": "text", "text": '{"x": 1}'}]
    assert msg["stop_reason"] == "max_tokens"
    assert msg["usage"] == {"input_tokens": 10, "output_tokens": 3}


def completion(body: dict) -> dict:
    return {
        "model": body["model"],
        "choices": [{"message": {"content": json.dumps(answer())}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20},
    }


class Server:
    """httpx.MockTransport handler: records bodies, answers a script of status codes."""

    def __init__(self, statuses=()):
        self.statuses = list(statuses)
        self.bodies: list[dict] = []
        self.auth: list[str | None] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.bodies.append(body)
        self.auth.append(request.headers.get("authorization"))
        status = self.statuses.pop(0) if self.statuses else 200
        if status != 200:
            return httpx.Response(status, text="slow down")
        return httpx.Response(200, json=completion(body))


def api(tmp_path, server, **kw) -> OpenAICompatBatchApi:
    client = httpx.Client(transport=httpx.MockTransport(server))
    return OpenAICompatBatchApi(
        "http://llm.test/v1",
        tmp_path / "results",
        client=client,
        sleep=lambda _: None,
        log=lambda _: None,
        **kw,
    )


def test_batch_is_stored_and_read_back(tmp_path):
    server = Server()
    a = api(tmp_path, server, api_key="k")
    bid = a.create(
        [{"custom_id": "s1-a", "params": params()}, {"custom_id": "s1-b", "params": params()}]
    )
    assert a.status(bid) == "ended"
    items = list(a.results(bid))
    assert [i["custom_id"] for i in items] == ["s1-a", "s1-b"]
    assert items[0]["result"]["type"] == "succeeded"
    assert server.auth == ["Bearer k", "Bearer k"]
    # A new process (resume) finds the answers on disk.
    again = OpenAICompatBatchApi("http://llm.test/v1", tmp_path / "results")
    assert len(list(again.results(bid))) == 2


def test_rate_limits_are_retried_other_errors_are_not(tmp_path):
    a = api(tmp_path, Server([429, 503]))
    bid = a.create([{"custom_id": "x", "params": params()}])
    assert next(a.results(bid))["result"]["type"] == "succeeded"
    a = api(tmp_path, Server([400]))
    bid = a.create([{"custom_id": "x", "params": params()}])
    assert next(a.results(bid))["result"]["error"]["type"] == "http_400"


def test_unknown_model_or_key_stops_the_run(tmp_path):
    from orchados_ai_worker.openai_compat import ProviderError

    a = api(tmp_path, Server([404]))
    with pytest.raises(ProviderError, match="404"):
        a.create([{"custom_id": "x", "params": params()}])


def test_unpriced_models_cost_nothing():
    assert cost_usd(MODEL, {"input_tokens": 10**6, "output_tokens": 10**6}) == 0.0


def ollama_cfg(**provider) -> WorkerConfig:
    return WorkerConfig(
        triage=StageConfig(MODEL),
        review=StageConfig(MODEL),
        confidence_threshold=0.0,
        poll_interval_s=0,
        provider=ProviderConfig(kind="openai", base_url="http://llm.test/v1", **provider),
    )


def test_whole_run_through_the_compatible_api(tmp_path):
    cat, server = make_catalog(), Server()
    w = Worker(
        cat,
        api(tmp_path, server),
        ollama_cfg(),
        tmp_path / "state",
        RunOptions(),
        log=lambda _: None,
        sleep=lambda _: None,
    )
    report = w.run(cat.session_row.id)
    assert report.status == "done" and report.written == 3
    assert len(server.bodies) == 3  # confident healthy answers: no review stage
    sent = json.dumps(server.bodies)
    for value in PERSONAL.values():
        assert value not in sent
    assert {r["p_model_name"] for r in cat.saved} == {MODEL}


def test_config_validation(tmp_path):
    with pytest.raises(ValueError, match="base_url"):
        ProviderConfig(kind="openai")
    path = tmp_path / "c.json"
    path.write_text(
        json.dumps(
            {
                "provider": {"kind": "openai", "base_url": "http://x/v1"},
                "triage": {"model": MODEL},
                "review": {"model": MODEL},
            }
        )
    )
    cfg = WorkerConfig.load(path)
    assert cfg.provider.kind == "openai"
    assert cfg.params_hash() != WorkerConfig().params_hash()
    with pytest.raises(ValueError, match="--with-opus"):
        WorkerConfig.load(path, with_hard=True)


def test_training_tiers_need_the_test_data_flag(tmp_path, capsys, monkeypatch):
    path = tmp_path / "c.json"
    path.write_text(
        json.dumps(
            {
                "provider": {
                    "kind": "openai",
                    "base_url": "http://x/v1",
                    "api_key_env": "FREE_KEY",
                    "may_train_on_requests": True,
                },
                "triage": {"model": MODEL},
                "review": {"model": MODEL},
            }
        )
    )
    args = ["run", "--session-id", make_catalog().session_row.id, "--config", str(path)]
    assert main(args, catalog=make_catalog()) == 1
    assert "--test-data-only" in capsys.readouterr().err
    assert main([*args, "--test-data-only"], catalog=make_catalog()) == 1
    assert "FREE_KEY" in capsys.readouterr().err
