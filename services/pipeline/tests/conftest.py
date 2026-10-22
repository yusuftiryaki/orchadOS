from __future__ import annotations

from pathlib import Path

import pytest

from orchados_pipeline.context import RunContext
from orchados_pipeline.params import PipelineParams
from orchados_pipeline.synthetic import SyntheticTruth, make_session

DATA = Path(__file__).parent / "data"


def write_raw_manifest(
    session_dir: Path, session_id: str, uri: str | None, skip: tuple[str, ...] = ()
) -> None:
    """The manifest copy orchados-ingest pull leaves (location.uri = session prefix)."""
    import hashlib
    import json

    files = [
        {
            "path": p.relative_to(session_dir).as_posix(),
            "size": p.stat().st_size,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        }
        for p in sorted(session_dir.rglob("*"))
        if p.is_file() and not p.relative_to(session_dir).as_posix().startswith(".")
    ]
    body = {
        "format": "orchados.raw-manifest/1",
        "session_id": session_id,
        "files": [f for f in files if f["path"] not in skip],
    }
    if uri is not None:
        body["location"] = {"store": "s3:test", "uri": uri}
    (session_dir / ".orchados").mkdir(exist_ok=True)
    (session_dir / ".orchados" / "manifest.json").write_text(json.dumps(body))


def fast_params() -> PipelineParams:
    """Defaults, except a shorter QR search window (the synthetic video is ~40 s)."""
    p = PipelineParams()
    p.sync.qr_search_s = 4.0
    return p


@pytest.fixture(scope="session")
def synthetic_session(tmp_path_factory) -> tuple[Path, SyntheticTruth]:
    root = tmp_path_factory.mktemp("synthetic") / "session"
    truth = make_session(root)
    return root, truth


@pytest.fixture(scope="session")
def processed_run(synthetic_session, tmp_path_factory):
    from orchados_pipeline.pipeline import run_all

    session, truth = synthetic_session
    ctx = RunContext.create(session, tmp_path_factory.mktemp("out"), fast_params())
    outputs = run_all(ctx)
    return ctx, outputs, truth


@pytest.fixture(scope="session")
def supabase_env():
    from supabase_util import SKIP_REASON, local_env

    env = local_env()
    if env is None:
        pytest.skip(SKIP_REASON)
    return env


@pytest.fixture(scope="session")
def test_sessions(supabase_env):
    """Ids of sessions a test opened in the local database; purged after the test run."""
    import os
    import warnings

    from supabase_util import KEEP_ENV, purge_sessions

    ids: list[str] = []
    yield ids
    if os.environ.get(KEEP_ENV):
        return
    problem = purge_sessions(ids)
    if problem:
        warnings.warn(
            f"test sessions left in the database ({problem}); run pnpm db:reset before "
            "pnpm db:test",
            stacklevel=1,
        )
