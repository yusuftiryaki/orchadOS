"""Shared BLE vectors with the field app (test-vectors/kit-protocol.json).

apps/field runs the same cases against its decoder and encoder
(test/unit/kit_protocol_vectors_test.dart), so the status the Pi sends and
the commands the phone writes are checked on both sides.
"""

import json
from dataclasses import asdict
from pathlib import Path

import pytest

from orchados_recorder.protocol import (
    STATUS_LEN,
    MarkEvent,
    Result,
    StartSession,
    Status,
    StopSession,
    decode_command,
    encode_command,
    encode_status,
)

VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "test-vectors" / "kit-protocol.json").read_text("utf-8")
)
OPS = {StartSession: "start_session", StopSession: "stop_session", MarkEvent: "mark_event"}


def test_vector_file_version():
    assert VECTORS["version"] == 1


@pytest.mark.parametrize("case", VECTORS["status"], ids=lambda c: c["name"])
def test_status_encodes_to_vector(case):
    fields = dict(case["fields"])
    fields["fw"] = tuple(fields["fw"])
    raw = encode_status(Status(**fields))
    assert len(raw) == STATUS_LEN
    assert raw.hex() == case["hex"]


@pytest.mark.parametrize("case", VECTORS["commands"], ids=lambda c: c["name"])
def test_command_decodes_as_vector(case):
    raw = bytes.fromhex(case["hex"])
    cmd, _, result = decode_command(raw)
    assert result == Result(case["result"])
    if result != Result.OK:
        assert cmd is None
        return
    assert {"op": OPS[type(cmd)], **asdict(cmd)} == case["command"]
    if case.get("canonical", True):
        assert encode_command(cmd) == raw
