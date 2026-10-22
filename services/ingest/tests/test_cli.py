"""The command line end to end, with the store configured through the environment."""

from __future__ import annotations

import pytest
from conftest import azurite_env, minio_env, write_session

from orchados_ingest.cli import main

SID = "4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b"


def _env(kind, request, tmp_path) -> dict[str, str]:
    if kind == "local":
        return {"ORCHADOS_STORE_BACKEND": "local", "ORCHADOS_STORE_ROOT": str(tmp_path / "st")}
    if kind == "minio":
        return minio_env(request.getfixturevalue("minio_url"), "cli-test")
    return azurite_env(request.getfixturevalue("azurite_url"), "cli-test")


@pytest.mark.parametrize(
    "kind",
    [
        "local",
        pytest.param("minio", marks=pytest.mark.minio),
        pytest.param("azurite", marks=pytest.mark.azurite),
    ],
)
def test_cli_flow(kind, request, tmp_path, monkeypatch, capsys):
    for k, v in _env(kind, request, tmp_path).items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "noconfig"))
    monkeypatch.setenv("ORCHADOS_INGEST_STATE", str(tmp_path / "state"))
    src = write_session(tmp_path / "s", video_bytes=1000, session_id=SID)

    assert main(["init"]) == 0
    assert main(["push", str(src), "--session-id", SID, "--bwlimit", "800", "-q"]) == 0
    out = capsys.readouterr().out
    assert "uploaded 5 files" in out and f"raw/o-1/p-1/{SID}/" in out
    assert main(["push", str(src), "--session-id", SID, "-q"]) == 0
    assert "uploaded 0 files, 5 already there" in capsys.readouterr().out

    assert main(["list"]) == 0
    assert SID in capsys.readouterr().out
    assert main(["list", SID]) == 0
    assert "video/VID_0001.mp4" in capsys.readouterr().out

    assert main(["pull", SID, str(tmp_path / "out"), "-q"]) == 0
    assert "checksums ok" in capsys.readouterr().out
    assert main(["verify", SID, "--deep"]) == 0
    assert main(["verify", SID, "--local", str(tmp_path / "out")]) == 0
    (tmp_path / "out" / "session.json").write_text("{}")
    assert main(["verify", SID, "--local", str(tmp_path / "out")]) == 3

    assert main(["prune", "--older-than", "30d"]) == 0
    assert "deleted 0 sessions" in capsys.readouterr().out
    assert main(["prune", "--older-than", "bad"]) == 1
    assert main(["pull", "no-such-session", str(tmp_path / "x")]) == 1
    assert "not in the store" in capsys.readouterr().err


def test_config_command_and_errors(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    monkeypatch.setenv("ORCHADOS_STORE_BACKEND", "s3")
    monkeypatch.delenv("ORCHADOS_STORE_BUCKET", raising=False)
    assert main(["config"]) == 1
    assert "needs bucket" in capsys.readouterr().err
    monkeypatch.setenv("ORCHADOS_STORE_BUCKET", "raw")
    monkeypatch.setenv("ORCHADOS_STORE_PROVIDER", "gcs")
    assert main(["config"]) == 0
    assert "storage.googleapis.com" in capsys.readouterr().out
