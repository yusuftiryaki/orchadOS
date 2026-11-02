"""Loader guards that need no database: the build check, file checks before upload,
the persona lock, option conflicts and the demo-data workflow (review of PR #64)."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest

from orchados_pipeline.demo import build as demo_build
from orchados_pipeline.demo import dataset, ids, loader, sqlgen

REPO = Path(__file__).resolve().parents[3]
WORKFLOW = REPO / ".github" / "workflows" / "demo-data.yml"


@pytest.fixture(scope="module")
def built():
    return demo_build.build("test", log=lambda _m: None)  # reuses the cache


@pytest.fixture
def copy(built, tmp_path):
    """A writable copy of the test build and its manifest."""
    root, manifest = built
    out = tmp_path / "build"
    shutil.copytree(root, out)
    return out, json.loads(json.dumps(manifest))


def _resign(manifest: dict) -> dict:
    manifest["dataset_sha256"] = demo_build.manifest_sha(manifest)
    return manifest


# --- finding 1/2: the manifest is checked like a cached build -----------------------


def test_the_real_build_passes(built):
    root, manifest = built
    assert loader.check_manifest(manifest, "test", root) is manifest


@pytest.mark.parametrize(
    "version",
    [
        "3, null, null, null, null); alter role authenticator superuser; --",
        "3",
        3.0,
        True,
        2,
        4,
        None,
    ],
)
def test_version_must_be_a_known_int(copy, version):
    root, manifest = copy
    manifest["version"] = version
    with pytest.raises(loader.LoadError, match="version"):
        loader.check_manifest(_resign(manifest), "test", root)


def test_profile_must_match_even_with_a_build_folder(copy):
    root, manifest = copy
    with pytest.raises(loader.LoadError, match="profile"):
        loader.check_manifest(manifest, "full", root)


def test_generator_hash_must_match(copy):
    root, manifest = copy
    manifest["generator_hash"] = "0" * 16
    with pytest.raises(loader.LoadError, match="generator_hash"):
        loader.check_manifest(_resign(manifest), "test", root)


def test_self_hash_must_match(copy):
    root, manifest = copy
    manifest["runs"] = manifest["runs"][:1]
    with pytest.raises(loader.LoadError, match="dataset_sha256"):
        loader.check_manifest(manifest, "test", root)


def test_every_file_is_present_and_hashes_to_its_name(copy):
    root, manifest = copy
    victim = root / "files" / manifest["files"][-1]["sha256"]
    victim.write_bytes(victim.read_bytes()[:-1])
    with pytest.raises(loader.LoadError, match="do not hash"):
        loader.check_manifest(manifest, "test", root)
    victim.unlink()
    with pytest.raises(loader.LoadError, match="missing"):
        loader.check_manifest(manifest, "test", root)


def test_a_file_of_another_org_or_a_bad_key_is_refused(copy):
    root, manifest = copy
    f = dict(manifest["files"][0])
    with pytest.raises(loader.LoadError, match="another org"):
        loader.check_file(root, {**f, "org": "b0000000-0000-4000-8000-000000000001"})
    with pytest.raises(loader.LoadError, match="object key"):
        loader.check_file(root, {**f, "parcel": "../../x"})
    with pytest.raises(loader.LoadError, match="sha256"):
        loader.check_file(root, {**f, "sha256": "../manifest.json"})


def test_registry_uses_the_code_version_through_lit(built):
    root, manifest = built
    tampered = {**manifest, "version": "1); drop table public.org; --"}
    sql = sqlgen.generate(dataset.load(), root, tampered, sqlgen.FALLBACK_METRICS).sql()
    assert "drop table" not in sql
    assert f"values ('{ids.ORG_ID}', {dataset.DATASET_VERSION}, " in sql
    with pytest.raises(ValueError):
        sqlgen.registry(sqlgen.Script(), dataset.load(), "1", "x", "synthetic")


def test_finish_registry_writes_the_code_version(built):
    _root, manifest = built
    db = FakePsql()
    loader.finish_registry(db, dataset.load(), {**manifest, "version": "1; select 1"})
    assert "select 1" not in db.sql[0]
    assert f"dataset_version = {dataset.DATASET_VERSION}," in db.sql[0]


# --- finding 8: one version until multi-version loading exists ----------------------


def test_only_the_code_version_is_loaded():
    assert loader.VERSIONS == (dataset.DATASET_VERSION,)


# --- finding 2/4: uploads are checked, the persona is always locked again -----------


class FakePsql:
    target = "local"

    def __init__(self, existing: list[str] | None = None):
        self.sql: list[str] = []
        self.existing = existing or []

    def run(self, sql: str, single: bool = True) -> str:
        self.sql.append(sql)
        return ""

    def query(self, sql: str) -> list[str]:
        return list(self.existing)


class Boom(RuntimeError):
    pass


def test_corrupted_file_is_refused_before_the_persona_is_unlocked(copy, monkeypatch):
    root, manifest = copy
    victim = root / "files" / manifest["files"][0]["sha256"]
    victim.write_bytes(b"not the synthetic image")
    db = FakePsql()
    monkeypatch.setattr(loader, "SupabaseClient", _no_client)
    with pytest.raises(loader.LoadError, match="do not hash"):
        loader.upload_media(db, ENV, root, manifest, True, loader.LoadReport(), lambda _m: None)
    assert not any("extensions.crypt" in s for s in db.sql)


def test_unlock_bumps_updated_at_and_finally_relocks(built, monkeypatch):
    root, manifest = built
    db = FakePsql()
    monkeypatch.setattr(loader, "SupabaseClient", _no_client)
    with pytest.raises(Boom):
        loader.upload_media(db, ENV, root, manifest, True, loader.LoadReport(), lambda _m: None)
    unlock, relock = db.sql
    assert "extensions.crypt" in unlock and "updated_at = now()" in unlock
    assert "encrypted_password = ''" in relock and loader.BANNED_UNTIL in relock


def test_nothing_to_upload_still_leaves_the_lock_to_load_demo(built):
    root, manifest = built
    keys = [loader._key(f) for f in manifest["files"]]
    db = FakePsql([f"media:{k}" for k in keys] + [f"{loader.MIRROR}:{k}" for k in keys])
    loader.upload_media(db, ENV, root, manifest, True, loader.LoadReport(), lambda _m: None)
    assert db.sql == []
    loader.relock_ops(db)
    assert "encrypted_password = ''" in db.sql[0] and ids.OPS in db.sql[0]


ENV = {"SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_ANON_KEY": "anon"}


def _no_client(*_a, **_k):
    raise Boom("no network in unit tests")


# --- finding 7: a dry run never resets ----------------------------------------------


def test_reset_and_dry_run_exclude_each_other(monkeypatch):
    monkeypatch.setattr(loader, "Psql", _no_client)  # refused before any connection
    with pytest.raises(loader.LoadError, match="dry-run"):
        loader.load_demo("local", profile="test", dry_run=True, reset=True)


# --- finding 3: the workflow ----------------------------------------------------------


def test_workflow_runs_in_the_project_environment_on_main():
    text = WORKFLOW.read_text(encoding="utf-8")
    # project=demo is the test project only while it hosts the demo (DEMO_HOST=test).
    separate = "(inputs.project == 'demo' && vars.DEMO_HOST != 'test')"
    assert f"    environment: ${{{{ {separate} && 'demo' || 'test' }}}}\n" in text
    assert "    if: github.ref == 'refs/heads/main'\n" in text


def test_workflow_secrets_are_step_scoped():
    text = WORKFLOW.read_text(encoding="utf-8")
    job_env = text.split("    env:\n", 1)[1].split("    steps:\n", 1)[0]
    assert "secrets." not in job_env and "secrets[" not in job_env
    assert "GITHUB_ENV" not in text.split("id: guard", 1)[1].split("- uses:", 1)[0]
    # A missing demo secret is empty, never the test one: names are literals, and
    # each picks the DEMO_ name exactly when the job runs in the demo environment.
    found = re.findall(r"secrets\[(.*?)\]", text)
    assert found
    for expr in found:
        separate = r"\(inputs\.project == 'demo' && vars\.DEMO_HOST != 'test'\)"
        assert re.fullmatch(separate + r" && 'DEMO_(\w+)' \|\| '\1'", expr), expr


def test_workflow_reuses_only_main_runs_of_itself():
    text = WORKFLOW.read_text(encoding="utf-8")
    check = text.index("name: Check the reused run")
    assert check < text.index("name: Download an earlier build")
    assert ".github/workflows/demo-data.yml main workflow_dispatch" in text[check:]


def test_generator_hash_covers_the_core_pipeline_and_params(monkeypatch):
    # A change to the core pipeline (outputs, crops, coverage) or to the default
    # parameters must invalidate a cached build, not only a change under demo/.
    files = demo_build.source_files()
    for name in ("outputs.py", "models.py", "params.py", "upload.py", "demo/build.py"):
        assert name in files
    before = demo_build.generator_hash()
    monkeypatch.setattr(demo_build, "params_hash", lambda: "changed")
    assert demo_build.generator_hash() != before
