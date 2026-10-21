"""Helpers for the tests against the local Supabase stack (pnpm db:start && pnpm db:reset).

Same approach as services/pipeline/tests/supabase_util.py: the tests sign in
as the seed users and open their own session on the seed parcel. AI rows,
assets and measurements are insert-only, so purge_sessions() removes the test
sessions as the postgres superuser inside the database container (triggers off
for that transaction only), leaving the database as `pnpm db:reset` made it.
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

from orchados_ai_worker.supabase import SupabaseClient

REPO = Path(__file__).resolve().parents[3]
ORG = "b0000000-0000-4000-8000-000000000001"
PARCEL = "c0000000-0000-4000-8000-000000000001"
PASSWORD = "orchados-dev"
SKIP_REASON = "local Supabase not reachable (pnpm db:start && pnpm db:reset)"
KEEP_ENV = "ORCHADOS_TEST_KEEP_DATA"

# Personal data of the seed (supabase/seed.sql): parcel, owner, deed, site contact.
SEED_PERSONAL = (
    "Örnek Bahçe 1",
    "Örnek Köyü",
    "Şahinbey",
    "Örnek Sahip",
    "+905550000001",
    "Örnek Hissedar",
    "Örnek Bekçi",
    "+905550000099",
    "Rızai taksimle",
)


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


def db_container() -> str:
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
  where session_id in (select id from purge_session);
delete from public.ai_assessment_detail where session_id in (select id from purge_session);
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
delete from storage.objects o
using purge_object p
where o.bucket_id = 'media'
  and o.name = 'org/' || p.org_id || '/parcel/' || p.parcel_id || '/' || p.content_hash
  and not exists (select 1 from public.asset a
                  where a.parcel_id = p.parcel_id and a.content_hash = p.content_hash);
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
