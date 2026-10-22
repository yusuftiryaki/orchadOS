"""Helpers for the tests against the local Supabase stack (pnpm db:start && pnpm db:reset).

The tests sign in as the seed users (ops, expert, owner, field) and open their
own sessions on the seed parcel. Rows of capture, asset, measurement and their
join tables are insert-only, and a published session cannot be changed, so no
API user can remove what a test wrote. To leave the database as `pnpm db:reset`
made it (the pgTAP tests and the web tests count seed rows), purge_sessions()
deletes the test sessions and everything hanging off them with
testing.purge_sessions (supabase/testing/purge.sql, local and CI databases
only) as the service role. It is a test fixture, not something the pipeline does.
"""

from __future__ import annotations

import json
import os
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


def _status() -> dict[str, str] | None:
    """`supabase status` of the local stack, or None when it does not answer."""
    exe = shutil.which("supabase") or REPO / "node_modules" / ".bin" / "supabase"
    try:
        out = subprocess.run(
            [str(exe), "status", "-o", "json", "--workdir", str(REPO)],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        ).stdout
        return json.loads(out[out.index("{") :])
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def local_env() -> tuple[str, str] | None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_ANON_KEY")
    if not (url and key):
        status = _status()
        if status is None:
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


def service_role_key() -> str | None:
    """The local stack's service role key ($SUPABASE_SERVICE_ROLE_KEY or supabase status)."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        return key
    status = _status()
    return status["SERVICE_ROLE_KEY"] if status else None


def purge_sessions(env, session_ids: list[str]) -> str | None:
    """Delete the sessions and their rows; return why not, if it could not.

    testing.purge_sessions (supabase/testing/purge.sql) with the service role: it
    exists only in the local and CI databases and deletes with triggers off.
    """
    if not session_ids:
        return None
    key = service_role_key()
    if key is None:
        return "no service role key (SUPABASE_SERVICE_ROLE_KEY or supabase status)"
    ids = [str(uuid.UUID(s)) for s in session_ids]
    try:
        r = httpx.post(
            f"{env[0]}/rest/v1/rpc/purge_sessions",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Profile": "testing",
            },
            json={"p_session_ids": ids},
            timeout=120,
        )
    except httpx.HTTPError as exc:
        return f"purge failed: {exc}"
    if r.status_code >= 300:
        return f"purge failed ({r.status_code}): {r.text.strip()}"
    return None
