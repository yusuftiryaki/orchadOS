"""Helpers for the tests against the local Supabase stack (pnpm db:start && pnpm db:reset).

The tests sign in as the seed users (ops, expert, owner, field) and open their
own sessions on the seed parcel. Rows of capture, asset, measurement and their
join tables are insert-only, and a published session cannot be changed, so no
API user can remove what a test wrote. To leave the database as `pnpm db:reset`
made it (the pgTAP tests and the web tests count seed rows), purge_sessions()
deletes the test sessions and everything hanging off them as the postgres
superuser, inside the database container, with triggers off for that
transaction only. It is a test fixture, not something the pipeline does.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path

import httpx

from orchados_pipeline.supabase import SupabaseClient

REPO = Path(__file__).resolve().parents[3]
ORG = "b0000000-0000-4000-8000-000000000001"
PARCEL = "c0000000-0000-4000-8000-000000000001"
PASSWORD = "orchados-dev"
SKIP_REASON = "local Supabase not reachable (pnpm db:start && pnpm db:reset)"
# Set to keep the test sessions in the database (e.g. to look at them in the web app).
KEEP_ENV = "ORCHADOS_TEST_KEEP_DATA"


def local_env() -> tuple[str, str] | None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_ANON_KEY")
    if not (url and key):
        exe = shutil.which("supabase") or REPO / "node_modules" / ".bin" / "supabase"
        try:
            out = subprocess.run(
                [str(exe), "status", "-o", "json", "--workdir", str(REPO)],
                capture_output=True,
                text=True,
                timeout=60,
                check=True,
            ).stdout
            status = json.loads(out[out.index("{") :])
        except (OSError, ValueError, subprocess.SubprocessError):
            return None
        url, key = status["API_URL"], status["ANON_KEY"]
    try:
        httpx.get(f"{url}/auth/v1/health", headers={"apikey": key}, timeout=5).raise_for_status()
    except httpx.HTTPError:
        return None
    return url, key


def client(env, who: str) -> SupabaseClient:
    c = SupabaseClient(*env)
    c.sign_in_with_password(f"{who}@example.com", PASSWORD)
    return c


def creds(env, who: str = "ops") -> dict[str, str]:
    return {
        "SUPABASE_URL": env[0],
        "SUPABASE_ANON_KEY": env[1],
        "ORCHADOS_EMAIL": f"{who}@example.com",
        "ORCHADOS_PASSWORD": PASSWORD,
    }


def db_container() -> str:
    """The local stack's database container: supabase_db_<project_id>."""
    text = (REPO / "supabase" / "config.toml").read_text(encoding="utf-8")
    m = re.search(r'^project_id\s*=\s*"([^"]+)"', text, re.M)
    return f"supabase_db_{m.group(1) if m else REPO.name}"


PURGE_SQL = """
begin;
set local session_replication_role = replica; -- insert-only and publication triggers off
create temp table purge_session on commit drop as
  select unnest(:'ids'::uuid[]) as id;
create temp table purge_object on commit drop as
  select org_id, parcel_id, content_hash from public.asset
  where session_id in (select id from purge_session)
  union
  select org_id, parcel_id, content_hash from public.capture
  where session_id in (select id from purge_session);
delete from public.finding_evidence where finding_id in
  (select id from public.finding where session_id in (select id from purge_session));
delete from public.finding where session_id in (select id from purge_session);
delete from public.assessment_measurement where assessment_id in
  (select id from public.assessment where session_id in (select id from purge_session));
delete from public.measurement_evidence where measurement_id in
  (select id from public.measurement where session_id in (select id from purge_session));
delete from public.measurement_evidence where asset_id in
  (select id from public.asset where session_id in (select id from purge_session));
delete from public.assessment where session_id in (select id from purge_session);
delete from public.measurement where session_id in (select id from purge_session);
delete from public.asset_source where asset_id in
  (select id from public.asset where session_id in (select id from purge_session));
delete from public.asset where session_id in (select id from purge_session);
delete from public.capture where session_id in (select id from purge_session);
delete from public.session where id in (select id from purge_session);
-- Objects that no remaining row points to (the file stays in the storage volume).
delete from storage.objects o
using purge_object p
where o.bucket_id = 'media'
  and o.name = 'org/' || p.org_id || '/parcel/' || p.parcel_id || '/' || p.content_hash
  and not exists (select 1 from public.asset a
                  where a.parcel_id = p.parcel_id and a.content_hash = p.content_hash)
  and not exists (select 1 from public.capture c
                  where c.parcel_id = p.parcel_id and c.content_hash = p.content_hash);
commit;
"""


def purge_sessions(session_ids: list[str]) -> str | None:
    """Delete the sessions and their rows; return why not, if it could not."""
    if not session_ids:
        return None
    ids = "{" + ",".join(str(uuid.UUID(s)) for s in session_ids) + "}"
    docker = shutil.which("docker")
    if docker is None:
        return "docker not found"
    try:
        subprocess.run(
            [
                docker,
                "exec",
                "-i",
                db_container(),
                "psql",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-q",
                "-v",
                "ON_ERROR_STOP=1",
                "-v",
                f"ids={ids}",
            ],
            input=PURGE_SQL,
            capture_output=True,
            text=True,
            timeout=120,
            check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        detail = getattr(exc, "stderr", "") or str(exc)
        return f"purge failed: {detail.strip()}"
    return None
