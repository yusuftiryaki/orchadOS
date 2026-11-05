"""The demo loader against the local Supabase stack (pnpm db:start && pnpm db:reset).

Checks that --dry-run and a refused --demo-only write nothing, loads the test
profile with --reset-local, reloads (registry shortcut, then forced through the SQL
path), verifies, reads media back as a temporary owner and through the public
mirror, and checks the personas through GoTrue's admin API. Skipped when the local
stack does not answer.
"""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

import httpx
import pytest
from supabase_util import SKIP_REASON, local_env, service_role_key

from orchados_pipeline.demo import build as demo_build
from orchados_pipeline.demo import dataset, ids, loader, sqlgen
from orchados_pipeline.hashing import sha256_bytes
from orchados_pipeline.media import media_key
from orchados_pipeline.supabase import SupabaseClient

pytestmark = pytest.mark.supabase

ENV = local_env()
if ENV is None:
    pytest.skip(SKIP_REASON, allow_module_level=True)

ORG = ids.ORG_ID


def _admin(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _quiet(_m: str) -> None:
    pass


def _demo_rows(db: loader.Psql) -> int:
    return int(
        db.query(
            f"select (select count(*) from public.org where id = '{ORG}') "
            f"+ (select count(*) from public.asset where org_id = '{ORG}') "
            f"+ (select count(*) from public.measurement where org_id = '{ORG}');"
        )[0]
    )


@pytest.fixture(scope="module")
def guards():
    """Before loading: a dry run and a refused --demo-only leave no demo rows."""
    db = loader.Psql("local")
    loader.reset_local(loader.api_env("local"), _quiet)
    dry = loader.load_demo("local", profile="test", dry_run=True, log=_quiet)
    after_dry = _demo_rows(db)
    with pytest.raises(loader.LoadError, match="--demo-only"):
        loader.load_demo("local", profile="test", demo_only=True, log=_quiet)
    return dry, after_dry, _demo_rows(db)


@pytest.fixture(scope="module")
def loaded(guards):
    logs: list[str] = []
    first = loader.load_demo("local", profile="test", reset=True, do_verify=True, log=logs.append)
    again: list[str] = []
    second = loader.load_demo("local", profile="test", do_verify=True, log=again.append)
    return first, second, again


def test_dry_run_and_demo_only_write_nothing(guards):
    dry, after_dry, after_demo_only = guards
    assert dry.inserted["public.asset"] > 0 and dry.uploaded == 0
    assert after_dry == 0 and after_demo_only == 0


def test_first_load_writes_rows_and_media(loaded):
    first, _second, _again = loaded
    assert first.inserted["public.asset"] > 0 and first.inserted["public.measurement"] > 0
    assert first.uploaded == first.files


def test_reload_is_a_no_op(loaded):
    _first, second, again = loaded
    assert sum(second.inserted.values()) == 0
    assert second.uploaded == 0 and second.mirrored == 0
    text = "\n".join(again)
    assert "already loaded" in text or "rows inserted: 0 (nothing new)" in text


def test_reload_through_the_sql_path_inserts_nothing(loaded):
    """With the registry shortcut off (loaded_at null) the whole SQL runs again."""
    db = loader.Psql("local")
    if not loader.state(db).registry:
        pytest.skip("private.demo_org does not exist yet (stream A)")
    db.run(f"update private.demo_org set loaded_at = null where org_id = '{ORG}';")
    logs: list[str] = []
    third = loader.load_demo("local", profile="test", do_verify=True, log=logs.append)
    assert "resuming a partial load with the same build" in logs
    assert third.inserted and all(n == 0 for n in third.inserted.values()), third.inserted
    assert third.uploaded == 0 and third.mirrored == 0
    assert loader.state(db).row["loaded_at"]


def test_partial_load_of_another_build_is_refused(loaded):
    db = loader.Psql("local")
    if not loader.state(db).registry:
        pytest.skip("private.demo_org does not exist yet (stream A)")
    row = loader.state(db).row
    db.run(
        "update private.demo_org set loaded_at = null, dataset_sha256 = repeat('0', 64) "
        f"where org_id = '{ORG}';"
    )
    try:
        with pytest.raises(loader.LoadError, match="reuse_build_run_id"):
            loader.load_demo("local", profile="test", log=_quiet)
    finally:
        db.run(
            f"update private.demo_org set loaded_at = {loader.lit(row['loaded_at'])}, "
            f"dataset_sha256 = {loader.lit(row['dataset_sha256'])} where org_id = '{ORG}';"
        )


def test_other_bytes_locally_are_reported_before_already_loaded(loaded, monkeypatch):
    """A local target with another profile's media gets the db:reset hint, even when
    the registry says loaded (here: the build is a different set of files)."""
    db = loader.Psql("local")
    if not loader.state(db).registry:
        pytest.skip("private.demo_org does not exist yet (stream A)")
    real = loader.check_manifest

    def fewer_files(manifest, profile, build):
        real(manifest, profile, build)
        manifest["files"] = manifest["files"][1:]

    monkeypatch.setattr(loader, "check_manifest", fewer_files)
    with pytest.raises(loader.LoadError, match="db:reset or --reset-local"):
        loader.load_demo("local", profile="test", log=_quiet)


def test_an_open_persona_is_locked_again_by_the_next_run(loaded):
    """A run killed after the upload leaves the ops persona open; the next one, with
    nothing left to upload, locks it again."""
    db = loader.Psql("local")
    db.run(
        "update auth.users set encrypted_password = extensions.crypt('x', "
        f"extensions.gen_salt('bf')), banned_until = null where id = '{ids.OPS}';"
    )
    report = loader.load_demo("local", profile="test", do_verify=True, log=_quiet)
    assert report.status.startswith("already loaded")
    rows = db.query(
        "select coalesce(encrypted_password, '') = '' and banned_until > now() "
        f"from auth.users where id = '{ids.OPS}';"
    )
    assert rows == ["t"]


def test_verify_passes(loaded):
    assert loader.verify(loader.Psql("local"), log=lambda _m: None) == []


def test_media_reads_back_as_an_owner(loaded):
    key = service_role_key()
    if not key:
        pytest.skip("no service role key")
    url, anon = ENV
    db = loader.Psql("local")
    rows = db.json(
        "select jsonb_agg(x)::text from ("
        f"(select parcel_id, content_hash from public.asset where session_id = '{ids.A_SCAN_2026}' "
        "and kind = 'panorama' order by id limit 1) union all "
        f"(select parcel_id, content_hash from public.capture where org_id = '{ORG}' "
        "and kind = 'photo' order by id limit 1)) x;"
    )
    assert len(rows) == 2
    email = f"demo-test-{uuid.uuid4().hex[:8]}@example.com"
    password = uuid.uuid4().hex
    r = httpx.post(
        f"{url}/auth/v1/admin/users",
        headers=_admin(key),
        json={"email": email, "password": password, "email_confirm": True},
        timeout=30,
    )
    r.raise_for_status()
    user_id = r.json()["id"]
    try:
        httpx.post(
            f"{url}/rest/v1/parcel_access",
            headers={**_admin(key), "Prefer": "return=minimal"},
            json={"org_id": ORG, "parcel_id": ids.PARCEL_A, "user_id": user_id, "role": "owner"},
            timeout=30,
        ).raise_for_status()
        with SupabaseClient(url, anon) as client:
            client.sign_in_with_password(email, password)
            for row in rows:
                k = media_key(ORG, row["parcel_id"], row["content_hash"])
                body = httpx.get(client.storage_signed_url("media", k), timeout=30).content
                assert sha256_bytes(body) == row["content_hash"]
        if loader.state(db).mirror:
            for row in rows:
                k = media_key(ORG, row["parcel_id"], row["content_hash"])
                body = httpx.get(
                    f"{url}/storage/v1/object/public/demo-media/{k}", timeout=30
                ).content
                assert sha256_bytes(body) == row["content_hash"]
    finally:
        httpx.delete(f"{url}/auth/v1/admin/users/{user_id}", headers=_admin(key), timeout=30)


def test_personas_are_locked(loaded):
    personas = ", ".join(f"'{p[0]}'" for p in ids.PERSONAS)
    rows = loader.Psql("local").query(
        "select coalesce(encrypted_password, '') = '' and banned_until > now() "
        "and num_nulls(confirmation_token, recovery_token, email_change, email_change_token_new, "
        "email_change_token_current, phone_change, phone_change_token, reauthentication_token) = 0 "
        "and phone is null and not (raw_app_meta_data ? 'demo') "
        f"from auth.users where id in ({personas});"
    )
    assert rows == ["t"] * len(ids.PERSONAS)


def test_gotrue_admin_reads_the_personas(loaded):
    key = service_role_key()
    if not key:
        pytest.skip("no service role key")
    url = ENV[0]
    r = httpx.get(
        f"{url}/auth/v1/admin/users",
        params={"page": 1, "per_page": 1000},
        headers=_admin(key),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    listed = {u["id"] for u in r.json()["users"]}
    for pid, *_ in ids.PERSONAS:
        assert pid in listed
        one = httpx.get(f"{url}/auth/v1/admin/users/{pid}", headers=_admin(key), timeout=30)
        assert one.status_code == 200, one.text


def test_no_notifications(loaded):
    rows = loader.Psql("local").query(
        f"select count(*) from public.notification where org_id = '{ORG}';"
    )
    assert rows == ["0"]


def test_registry_and_enable_disable(loaded):
    db = loader.Psql("local")
    st = loader.state(db)
    if not st.registry:
        pytest.skip("private.demo_org does not exist yet (stream A)")
    assert st.row and st.row["loaded_at"] and st.row["dataset_version"] == dataset.DATASET_VERSION
    tour = json.loads(
        db.query(f"select tour::text from private.demo_org where org_id = '{ORG}';")[0]
    )
    assert tour["session_id"] == ids.A_SCAN_2026 and tour["parcel_id"] == ids.PARCEL_A
    assert tour["service_request_id"] == ids.B_MOWING_2026_REQUEST
    enabled = f"select enabled from private.demo_org where org_id = '{ORG}';"
    loader.enable(db, log=lambda _m: None)
    assert db.query(enabled) == ["t"]
    loader.disable(db, log=lambda _m: None)
    assert db.query(enabled) == ["f"]


def _other_build(tmp: Path, key: str) -> tuple[Path, str, str]:
    """A copy of the loaded test build in which one file has other bytes, as a build
    on a runner with another CPU has (rendering is not bit-identical across CPUs)."""
    src = demo_build.build_dir(demo_build.DEFAULT_ROOT, "test")
    out = tmp / "other-build"
    shutil.copytree(src, out)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    f = next(f for f in manifest["files"] if f["key"] == key)
    old = f["sha256"]
    data = (out / "files" / old).read_bytes() + b"\0"
    new = sha256_bytes(data)
    (out / "files" / old).unlink()
    (out / "files" / new).write_bytes(data)
    f["sha256"], f["bytes"] = new, len(data)
    for p in manifest["service_photos"]:
        if p["sha256"] == old:
            p["sha256"], p["bytes"] = new, len(data)
    manifest["dataset_sha256"] = demo_build.manifest_sha(manifest)
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return out, old, new


def test_hosted_upgrade_keeps_the_bytes_of_the_loaded_build(loaded, tmp_path, monkeypatch):
    """docs/demo-turu.md §10.3: a hosted project loaded at an older dataset version by a
    build with other bytes is upgraded; its rows keep their stored media, this build's
    copies are not uploaded, and verify passes. Locally the same build is refused."""
    db = loader.Psql("local")
    st = loader.state(db)
    if not st.registry:
        pytest.skip("private.demo_org does not exist yet (stream A)")
    if shutil.which("psql") is None:
        pytest.skip("psql is not installed (the remote target uses it)")
    key = "B26M-AFTER"
    other, old, new = _other_build(tmp_path, key)
    with pytest.raises(loader.LoadError, match="db:reset or --reset-local"):
        loader.load_demo("local", profile="test", build_dir=other, log=_quiet)

    status = loader.local_status()
    monkeypatch.setenv("DEMO_DB_URL", status["DB_URL"])
    monkeypatch.setenv("SUPABASE_URL", status["API_URL"])
    monkeypatch.setenv("SUPABASE_ANON_KEY", status["ANON_KEY"])
    older = dataset.DATASET_VERSION - 1
    db.run(f"update private.demo_org set dataset_version = {older} where org_id = '{ORG}';")
    logs: list[str] = []
    report = loader.load_demo(
        "remote", profile="test", build_dir=other, do_verify=True, log=logs.append
    )
    note = f"loaded at dataset version {older} by another build: 1 "
    assert any(m.startswith(note) for m in logs)
    assert report.superseded == 1 and report.uploaded == 0 and report.mirrored == 0
    assert loader.state(db).row["dataset_version"] == dataset.DATASET_VERSION
    stored = db.query(
        f"select content_hash from public.asset where id = '{ids.did('asset', key, 2)}';"
    )
    assert stored == [old]
    assert db.query(f"select count(*) from storage.objects where name like '%/{new}';") == ["0"]
    # Now registered at this version: the shortcut, not another byte comparison.
    again = loader.load_demo("remote", profile="test", build_dir=other, log=_quiet)
    assert again.status.startswith("already loaded")
    # A rerun through the SQL path after verify failed is not stuck on those bytes.
    link = (
        "delete from public.service_type_robot_model "
        f"where service_type_id = '{sqlgen.SERVICE_TYPE_ID}';"
    )
    db.run(link)
    logs.clear()
    third = loader.load_demo(
        "remote", profile="test", build_dir=other, do_verify=True, log=logs.append
    )
    assert "registered as loaded but verify fails: loading again" in logs
    assert third.inserted.get("public.service_type_robot_model") == 1
    assert third.superseded == 1 and third.uploaded == 0
