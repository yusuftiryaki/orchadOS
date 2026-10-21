"""Upload against the local Supabase stack (pnpm db:start && pnpm db:reset at the repo root).

Skipped when Supabase is not reachable. Each run opens its own session on the
seed parcel; the synthetic slot codes (S1-1 .. S3-4) all have active trees
there. The synthetic recording starts at the current time and has its own
background, so its files never collide with an earlier run on the same
database. Seed rows are not changed; the test session is purged afterwards
(tests/supabase_util.py).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

import pytest
from conftest import fast_params
from supabase_util import ORG, PARCEL, client, creds

from orchados_pipeline.cli import main
from orchados_pipeline.context import RunContext
from orchados_pipeline.media import SupabaseMediaStore, media_key
from orchados_pipeline.pipeline import run_all
from orchados_pipeline.supabase import PermissionDenied, SupabaseError
from orchados_pipeline.synthetic import SyntheticConfig, make_session
from orchados_pipeline.upload import UPLOAD_KINDS, UploadOptions, upload_to_supabase

pytestmark = pytest.mark.supabase


@pytest.fixture(scope="module")
def uploaded(supabase_env, test_sessions, tmp_path_factory):
    ops = client(supabase_env, "ops")
    session_id = str(uuid.uuid4())
    test_sessions.append(session_id)
    ops.insert(
        "session",
        [
            {
                "id": session_id,
                "org_id": ORG,
                "parcel_id": PARCEL,
                "kind": "periodic_scan",
                "status": "captured",
            }
        ],
    )
    session = tmp_path_factory.mktemp("supabase") / "session"
    start = datetime.now(UTC).replace(microsecond=0)
    cfg = SyntheticConfig(session_id=session_id, parcel_id=PARCEL, start_utc=start)
    cfg.seed = uuid.UUID(session_id).int % 100_000  # own background, own image hashes
    make_session(session, cfg)
    ctx = RunContext.create(session, None, fast_params())
    out = run_all(ctx)
    report = upload_to_supabase(
        ctx.run_dir,
        session_id,
        UploadOptions(kinds=frozenset(UPLOAD_KINDS), allow_unblurred=True, station="ci"),
        env=creds(supabase_env),
    )
    yield ops, session_id, ctx, out, report
    ops.close()


def test_rows_and_objects_are_created(uploaded):
    ops, session_id, ctx, out, report = uploaded
    uploadable = [a for a in out.assets if a.kind in UPLOAD_KINDS.values()]
    assert report.captures_created == len(out.captures)
    assert report.assets_created == len(uploadable)
    assert report.objects_uploaded == len(uploadable)
    assert not report.warnings[1:]  # only the face blurring note

    captures = ops.select("capture", {"session_id": f"eq.{session_id}", "select": "id,uri"})
    assets = ops.select(
        "asset",
        {"session_id": f"eq.{session_id}", "select": "id,kind,tree_id,content_hash,uri,pose"},
    )
    assert len(captures) == len(out.captures)
    assert all(c["uri"].startswith("station://ci/") for c in captures)
    assert len(assets) == len(uploadable)
    crops = [a for a in assets if a["kind"] == "tree_crop"]
    assert crops and all(a["tree_id"] for a in crops)
    variants = [a["pose"]["variant"] for a in assets if a["kind"] == "panorama"]
    assert sorted(set(variants)) == ["full", "preview"]

    sources = ops.select(
        "asset_source", {"asset_id": "in.(" + ",".join(a["id"] for a in assets) + ")"}
    )
    assert len(sources) == report.lineage_created > len(assets)

    keys = SupabaseMediaStore(ops).keys(f"org/{ORG}/parcel/{PARCEL}")
    for a in assets:
        key = media_key(ORG, PARCEL, a["content_hash"])
        assert a["uri"] == f"storage://media/{key}" and key in keys
    sample = next(a for a in assets if a["kind"] == "tree_crop")
    data = ops.storage_download("media", media_key(ORG, PARCEL, sample["content_hash"]))
    assert hashlib.sha256(data).hexdigest() == sample["content_hash"]

    (row,) = ops.select("session", {"id": f"eq.{session_id}", "select": "status"})
    assert row["status"] == "processed"


def test_second_upload_adds_nothing(uploaded, supabase_env, monkeypatch, capsys):
    ops, session_id, ctx, _, _ = uploaded
    count = len(ops.select("asset", {"session_id": f"eq.{session_id}", "select": "id"}))
    for k, v in creds(supabase_env).items():
        monkeypatch.setenv(k, v)
    args = ["upload", str(ctx.run_dir), "--session-id", session_id, "--allow-unblurred"]
    assert main([*args, "--only", ",".join(UPLOAD_KINDS), "--station", "ci"]) == 0
    printed = capsys.readouterr().out
    assert "captures: 0 created" in printed
    assert "assets: 0 created" in printed
    assert "objects: 0 uploaded" in printed
    assert "lineage rows: 0 created" in printed
    assert len(ops.select("asset", {"session_id": f"eq.{session_id}", "select": "id"})) == count


def test_owner_sees_nothing_before_publication(uploaded, supabase_env):
    _, session_id, _, out, _ = uploaded
    with client(supabase_env, "owner") as owner:
        # The visit itself is visible, its results are not.
        assert owner.select("session", {"id": f"eq.{session_id}", "select": "status"})
        for table in ("capture", "asset"):
            assert owner.select(table, {"session_id": f"eq.{session_id}", "select": "id"}) == []
        crop = next(a for a in out.assets if a.kind == "tree_crop")
        with pytest.raises(SupabaseError):
            owner.storage_download("media", media_key(ORG, PARCEL, crop.asset_id))
        assert (
            SupabaseMediaStore(owner).keys(f"org/{ORG}/parcel/{PARCEL}")
            & {media_key(ORG, PARCEL, a.asset_id) for a in out.assets}
            == set()
        )


def test_owner_cannot_upload_files(supabase_env, tmp_path):
    # Field staff may add files to their org's paths (field app close-ups,
    # 20261021230000_field_sync.sql); parcel roles may not.
    f = tmp_path / "x.bin"
    f.write_bytes(uuid.uuid4().bytes)
    key = media_key(ORG, PARCEL, hashlib.sha256(f.read_bytes()).hexdigest())
    with client(supabase_env, "owner") as owner:
        with pytest.raises(PermissionDenied):
            SupabaseMediaStore(owner).put(key, f, "application/octet-stream")
