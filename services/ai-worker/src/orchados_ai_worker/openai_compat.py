"""OpenAI-compatible chat endpoints behind the BatchApi interface: free ways to run the flow.

Two uses (docs: README, "Ücretsiz sağlayıcılar"):
- a local Ollama server (http://localhost:11434/v1) with a small vision model,
  e.g. gemma3:4b: free, and nothing leaves the machine;
- a free hosted tier with an OpenAI-compatible endpoint, e.g. Google Gemini
  (https://generativelanguage.googleapis.com/v1beta/openai/). Free tiers may use
  the requests to improve their products, so the worker allows them only with
  test data (cli: --test-data-only).

There is no batch: create() sends the requests one by one, at most one per
request_interval_s, retrying rate-limit and server errors, and stores each
answer under <results dir>/<batch id>.jsonl, so `resume` after a crash finds
them. The Anthropic request params (prompt.request_params) are translated and
the answers translated back into the Messages API shape the worker parses, so
the rest of the worker does not know which provider ran.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx

RETRY_STATUS = {408, 409, 429, 500, 502, 503, 504}
# Wrong key, wrong model name or wrong URL: every request would fail the same way.
FATAL_STATUS = {401, 403, 404}


class ProviderError(ValueError):
    """The endpoint refuses every request (key, model or URL); stop the run."""


def to_chat_request(params: dict[str, Any]) -> dict[str, Any]:
    """Messages API params -> chat completions body."""
    system = "\n\n".join(b["text"] for b in params.get("system", []) if b.get("type") == "text")
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}] if system else []
    for m in params["messages"]:
        content = m["content"]
        if isinstance(content, str):
            messages.append({"role": m["role"], "content": content})
            continue
        parts: list[dict[str, Any]] = []
        for b in content:
            if b["type"] == "text":
                parts.append({"type": "text", "text": b["text"]})
            elif b["type"] == "image":
                src = b["source"]
                url = f"data:{src['media_type']};base64,{src['data']}"
                parts.append({"type": "image_url", "image_url": {"url": url}})
            else:
                raise ValueError(f"cannot translate content block {b['type']!r}")
        messages.append({"role": m["role"], "content": parts})
    body: dict[str, Any] = {
        "model": params["model"],
        "max_tokens": params["max_tokens"],
        "messages": messages,
        "temperature": 0,
    }
    fmt = (params.get("output_config") or {}).get("format")
    if fmt and fmt.get("type") == "json_schema":
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "tree_assessment", "schema": fmt["schema"]},
        }
    return body


def to_message(resp: dict[str, Any]) -> dict[str, Any]:
    """Chat completion -> the Messages API message the worker parses."""
    choice = (resp.get("choices") or [{}])[0]
    text = (choice.get("message") or {}).get("content") or ""
    usage = resp.get("usage") or {}
    return {
        "model": resp.get("model"),
        "content": [{"type": "text", "text": text}],
        "stop_reason": "max_tokens" if choice.get("finish_reason") == "length" else "end_turn",
        "usage": {
            "input_tokens": int(usage.get("prompt_tokens") or 0),
            "output_tokens": int(usage.get("completion_tokens") or 0),
        },
    }


class OpenAICompatBatchApi:
    def __init__(
        self,
        base_url: str,
        results_dir: Path,
        *,
        api_key: str | None = None,
        request_interval_s: float = 0.0,
        max_retries: int = 4,
        timeout_s: float = 600.0,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        log: Callable[[str], None] = print,
    ):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.results_dir = Path(results_dir)
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.client = client or httpx.Client(timeout=timeout_s, headers=headers)
        if client is not None and api_key:
            self.client.headers.update(headers)
        self.interval = request_interval_s
        self.max_retries = max_retries
        self.sleep = sleep
        self.log = log
        self._last = 0.0

    @classmethod
    def from_env(cls, base_url: str, api_key_env: str | None, results_dir: Path, **kw):
        key = None
        if api_key_env:
            key = os.environ.get(api_key_env)
            if not key:
                raise ValueError(f"environment variable {api_key_env} is not set")
        return cls(base_url, results_dir, api_key=key, **kw)

    def _path(self, batch_id: str) -> Path:
        return self.results_dir / f"{batch_id}.jsonl"

    def create(self, requests: list[dict[str, Any]]) -> str:
        batch_id = f"local_{uuid.uuid4().hex[:16]}"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        path = self._path(batch_id)
        for i, r in enumerate(requests, 1):
            result = self._one(r["params"])
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"custom_id": r["custom_id"], "result": result}) + "\n")
            self.log(f"{batch_id}: {i}/{len(requests)} {result['type']}")
        return batch_id

    def status(self, batch_id: str) -> str:
        # create() returns only when every request has an answer on disk.
        return "ended" if self._path(batch_id).exists() else "canceling"

    def results(self, batch_id: str) -> Iterator[dict[str, Any]]:
        path = self._path(batch_id)
        if not path.exists():
            return
        with path.open(encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)

    def _one(self, params: dict[str, Any]) -> dict[str, Any]:
        try:
            body = to_chat_request(params)
        except (KeyError, ValueError) as exc:
            return {"type": "errored", "error": {"type": "invalid_request", "message": str(exc)}}
        for attempt in range(self.max_retries + 1):
            wait = self.interval - (time.monotonic() - self._last)
            if wait > 0:
                self.sleep(wait)
            self._last = time.monotonic()
            try:
                resp = self.client.post(self.url, json=body)
            except httpx.HTTPError as exc:
                err = {"type": "connection_error", "message": str(exc)}
            else:
                if resp.status_code == 200:
                    return {"type": "succeeded", "message": to_message(resp.json())}
                err = {"type": f"http_{resp.status_code}", "message": resp.text[:300]}
                if resp.status_code in FATAL_STATUS:
                    raise ProviderError(
                        f"{self.url} answered {resp.status_code} for model {body['model']}: "
                        f"{resp.text[:200]}"
                    )
                if resp.status_code not in RETRY_STATUS:
                    return {"type": "errored", "error": err}
            if attempt < self.max_retries:
                self.sleep(min(60.0, 5.0 * 2**attempt))
        return {"type": "errored", "error": err}
