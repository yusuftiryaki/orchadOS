"""Minimal Supabase client: password sign-in, PostgREST and Storage over HTTP.

The pipeline signs in as an ops user and sends that user's token with every
request, so row level security and the storage policies apply. The service
role key is never used.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

PAGE_SIZE = 1000  # PostgREST max_rows (supabase/config.toml)


class SupabaseError(RuntimeError):
    def __init__(self, message: str, status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


class PermissionDenied(SupabaseError):
    pass


class Conflict(SupabaseError):
    """Unique violation or an existing storage object."""


@dataclass(frozen=True)
class Credentials:
    url: str
    anon_key: str
    email: str
    password: str

    ENV = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ORCHADOS_EMAIL", "ORCHADOS_PASSWORD")

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Credentials:
        env = os.environ if env is None else env
        missing = [k for k in cls.ENV if not env.get(k)]
        if missing:
            raise SupabaseError("missing environment variables: " + ", ".join(missing))
        return cls(*(env[k] for k in cls.ENV))


def _raise_for(resp: httpx.Response, what: str) -> None:
    if resp.is_success:
        return
    try:
        body = resp.json()
    except ValueError:
        body = {"message": resp.text}
    if not isinstance(body, dict):
        body = {"message": str(body)}
    msg = body.get("message") or body.get("msg") or body.get("error_description") or resp.text
    code = str(body.get("code") or body.get("error") or "")
    # Storage reports its own status in the body (e.g. 400 with statusCode "409").
    status = int(body.get("statusCode") or resp.status_code)
    text = f"{what}: {msg} (HTTP {status}{', ' + code if code else ''})"
    if status == 409 or code == "23505" or body.get("error") == "Duplicate":
        raise Conflict(text, status, code)
    if status in (401, 403) or code == "42501":
        raise PermissionDenied(text, status, code)
    raise SupabaseError(text, status, code)


class SupabaseClient:
    def __init__(self, url: str, anon_key: str, timeout: float = 120.0):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.token: str | None = None
        self.user_id: str | None = None
        self.http = httpx.Client(timeout=timeout)

    @classmethod
    def sign_in(cls, creds: Credentials) -> SupabaseClient:
        client = cls(creds.url, creds.anon_key)
        client.sign_in_with_password(creds.email, creds.password)
        return client

    def close(self) -> None:
        self.http.close()

    def __enter__(self) -> SupabaseClient:
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # --- auth -----------------------------------------------------------------

    def sign_in_with_password(self, email: str, password: str) -> None:
        resp = self.http.post(
            f"{self.url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": self.anon_key},
            json={"email": email, "password": password},
        )
        _raise_for(resp, f"sign in as {email}")
        data = resp.json()
        self.token = data["access_token"]
        self.user_id = data["user"]["id"]

    def _headers(self, **extra: str) -> dict[str, str]:
        h = {"apikey": self.anon_key, "Authorization": f"Bearer {self.token or self.anon_key}"}
        h.update(extra)
        return h

    # --- PostgREST --------------------------------------------------------------

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        """All rows matching params, page by page (ordered by id unless params say otherwise)."""
        rows: list[dict[str, Any]] = []
        base = {"order": "id", **params}
        while True:
            resp = self.http.get(
                f"{self.url}/rest/v1/{table}",
                params={**base, "limit": str(PAGE_SIZE), "offset": str(len(rows))},
                headers=self._headers(),
            )
            _raise_for(resp, f"select {table}")
            page = resp.json()
            rows.extend(page)
            if len(page) < PAGE_SIZE:
                return rows

    def insert(
        self, table: str, rows: list[dict[str, Any]], returning: str = "id"
    ) -> list[dict[str, Any]]:
        resp = self.http.post(
            f"{self.url}/rest/v1/{table}",
            params={"select": returning},
            headers=self._headers(Prefer="return=representation"),
            json=rows,
        )
        _raise_for(resp, f"insert into {table}")
        return resp.json()

    def update(
        self, table: str, params: dict[str, str], values: dict[str, Any], returning: str = "id"
    ) -> list[dict[str, Any]]:
        resp = self.http.patch(
            f"{self.url}/rest/v1/{table}",
            params={**params, "select": returning},
            headers=self._headers(Prefer="return=representation"),
            json=values,
        )
        _raise_for(resp, f"update {table}")
        return resp.json()

    # --- Storage ----------------------------------------------------------------

    def storage_list(self, bucket: str, prefix: str) -> list[str]:
        """Object names (last path segment) directly under prefix."""
        names: list[str] = []
        offset = 0
        while True:
            resp = self.http.post(
                f"{self.url}/storage/v1/object/list/{bucket}",
                headers=self._headers(),
                json={"prefix": prefix, "limit": PAGE_SIZE, "offset": offset},
            )
            _raise_for(resp, f"list {bucket}/{prefix}")
            page = resp.json()
            offset += len(page)
            # Folders come back with a null id.
            names.extend(item["name"] for item in page if item.get("id"))
            if len(page) < PAGE_SIZE:
                return names

    def storage_upload(self, bucket: str, key: str, path: Path, media_type: str) -> bool:
        """Upload without overwriting; False if the object already exists."""
        with path.open("rb") as f:
            resp = self.http.post(
                f"{self.url}/storage/v1/object/{bucket}/{key}",
                headers=self._headers(**{"Content-Type": media_type, "x-upsert": "false"}),
                content=f,
            )
        try:
            _raise_for(resp, f"upload {bucket}/{key}")
        except Conflict:
            return False
        return True

    def storage_download(self, bucket: str, key: str) -> bytes:
        resp = self.http.get(
            f"{self.url}/storage/v1/object/authenticated/{bucket}/{key}", headers=self._headers()
        )
        _raise_for(resp, f"download {bucket}/{key}")
        return resp.content
