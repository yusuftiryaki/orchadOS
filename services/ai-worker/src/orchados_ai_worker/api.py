"""Message Batches API behind a small interface, so tests run without the network.

AnthropicBatchApi uses the official SDK. The key comes from the environment
(ANTHROPIC_API_KEY, read by the SDK); it is never logged or stored.
Results are plain dicts (the SDK objects' JSON form), the same shape the fake
client in the tests returns.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol


class BatchApi(Protocol):
    def create(self, requests: list[dict[str, Any]]) -> str:
        """Submit [{custom_id, params}]; return the batch id."""
        ...

    def status(self, batch_id: str) -> str:
        """processing_status: in_progress, canceling or ended."""
        ...

    def results(self, batch_id: str) -> Iterator[dict[str, Any]]:
        """{custom_id, result: {type, message | error}} per request, in any order."""
        ...


class AnthropicBatchApi:
    def __init__(self, client: Any | None = None):
        if client is None:
            import anthropic

            client = anthropic.Anthropic()
        self.client = client

    def create(self, requests: list[dict[str, Any]]) -> str:
        batch = self.client.messages.batches.create(requests=requests)
        return batch.id

    def status(self, batch_id: str) -> str:
        return self.client.messages.batches.retrieve(batch_id).processing_status

    def results(self, batch_id: str) -> Iterator[dict[str, Any]]:
        for item in self.client.messages.batches.results(batch_id):
            yield item.model_dump(mode="json")
