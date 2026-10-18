from __future__ import annotations

from pathlib import Path

import pytest

from orchados_pipeline.context import RunContext
from orchados_pipeline.params import PipelineParams
from orchados_pipeline.synthetic import SyntheticTruth, make_session

DATA = Path(__file__).parent / "data"


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
