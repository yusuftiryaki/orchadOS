"""The demo loader against the local Supabase stack (pnpm db:start && pnpm db:reset).

Loads the test profile with --reset-local, reloads (nothing new), verifies, reads
media back as a temporary owner and through the public mirror, and checks the
personas through GoTrue's admin API. Skipped when the local stack does not answer.
"""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from supabase_util import SKIP_REASON, local_env, service_role_key

from orchados_pipeline.demo import ids, loader
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


@pytest.fixture(scope="module")
def loaded():
    logs: list[str] = []
    first = loader.load_demo("local", profile="test", reset=True, do_verify=True, log=logs.append)
    again: list[str] = []
    second = loader.load_demo("local", profile="test", do_verify=True, log=again.append)
    return first, second, again


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
    assert st.row and st.row["loaded_at"] and st.row["dataset_version"] == 1
    tour = json.loads(
        db.query(f"select tour::text from private.demo_org where org_id = '{ORG}';")[0]
    )
    assert tour["session_id"] == ids.A_SCAN_2026 and tour["parcel_id"] == ids.PARCEL_A
    enabled = f"select enabled from private.demo_org where org_id = '{ORG}';"
    loader.enable(db, log=lambda _m: None)
    assert db.query(enabled) == ["t"]
    loader.disable(db, log=lambda _m: None)
    assert db.query(enabled) == ["f"]
