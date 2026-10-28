"""Cross-border transfer gate (KVKK md. 9, docs/hukuk/kararlar.md H02)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fakes import make_catalog

from orchados_ai_worker.api import AnthropicBatchApi
from orchados_ai_worker.cli import TRANSFER_SAFEGUARD_ENV, _api, main
from orchados_ai_worker.config import ProviderConfig, WorkerConfig
from orchados_ai_worker.openai_compat import OpenAICompatBatchApi

OLLAMA = Path("configs/ollama-gemma3.json")


@pytest.fixture(autouse=True)
def no_safeguard(monkeypatch):
    monkeypatch.delenv(TRANSFER_SAFEGUARD_ENV, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-never-used")


def run_args(*extra: str) -> list[str]:
    return ["run", "--session-id", make_catalog().session_row.id, *extra]


@pytest.mark.parametrize(
    ("provider", "abroad"),
    [
        (ProviderConfig(), True),
        (ProviderConfig("openai", "http://localhost:11434/v1"), False),
        (ProviderConfig("openai", "http://127.0.0.1:11434/v1"), False),
        (ProviderConfig("openai", "http://[::1]:11434/v1"), False),
        (ProviderConfig("openai", "http://host.docker.internal:11434/v1"), False),
        (ProviderConfig("openai", "https://generativelanguage.googleapis.com/v1beta/openai"), True),
        (ProviderConfig("openai", "http://localhost.example.com/v1"), True),
        (ProviderConfig("openai", "https://llm.example.com.tr/v1", cross_border=False), False),
        (ProviderConfig("openai", "http://localhost:11434/v1", cross_border=True), True),
    ],
)
def test_cross_border_detection(provider, abroad):
    assert provider.is_cross_border is abroad


def test_override_keeps_the_params_hash(tmp_path):
    base = json.loads(OLLAMA.read_text())
    path = tmp_path / "c.json"
    base["provider"]["cross_border"] = True
    path.write_text(json.dumps(base))
    assert WorkerConfig.load(path).params_hash() == WorkerConfig.load(OLLAMA).params_hash()


def test_anthropic_without_safeguard_is_refused(capsys):
    assert main(run_args(), catalog=make_catalog()) == 1
    assert TRANSFER_SAFEGUARD_ENV in capsys.readouterr().err


@pytest.mark.parametrize("extra", [(), ("--no-write",), ("--no-wait",)])
def test_refusal_covers_every_run_mode(extra, capsys):
    assert main(run_args(*extra), catalog=make_catalog()) == 1
    assert main(["resume", *run_args(*extra)[1:]], catalog=make_catalog()) == 1
    assert capsys.readouterr().err.count(TRANSFER_SAFEGUARD_ENV) == 2


def test_safeguard_allows_anthropic(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv(TRANSFER_SAFEGUARD_ENV, "Anthropic SCC 2026-11-15")
    assert isinstance(_api(WorkerConfig(), tmp_path, False), AnthropicBatchApi)
    assert "Anthropic SCC 2026-11-15" in capsys.readouterr().err


def test_blank_safeguard_is_refused(monkeypatch, tmp_path):
    monkeypatch.setenv(TRANSFER_SAFEGUARD_ENV, "  ")
    with pytest.raises(ValueError, match=TRANSFER_SAFEGUARD_ENV):
        _api(WorkerConfig(), tmp_path, False)


def test_test_data_flag_allows_anthropic(tmp_path):
    assert isinstance(_api(WorkerConfig(), tmp_path, True), AnthropicBatchApi)


def test_local_ollama_is_allowed(tmp_path):
    api = _api(WorkerConfig.load(OLLAMA), tmp_path, False)
    assert isinstance(api, OpenAICompatBatchApi)


def test_training_tier_still_needs_the_test_data_flag(monkeypatch, tmp_path):
    monkeypatch.setenv(TRANSFER_SAFEGUARD_ENV, "Google SCC")
    cfg = WorkerConfig.load(Path("configs/gemini-free.json"))
    with pytest.raises(ValueError, match="--test-data-only"):
        _api(cfg, tmp_path, False)
