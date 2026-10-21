"""Minimal Supabase client: password sign-in, PostgREST, signed storage downloads.

The worker signs in as an ops user and sends that user's token with every
request, so row level security and the storage policies apply. The service
role key is never used. Same approach as services/pipeline (supabase.py); kept
separate so the two services deploy independently.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
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


@dataclass(frozen=True)
class Credentials:
    url: str
    anon_key: str
    email: str
    password: str

    ENV = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ORCHADOS_EMAIL", "ORCHADOS_PASSWORD")

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Credentials:
        env = dict(os.environ) if env is None else env
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
    status = int(body.get("statusCode") or resp.status_code)
    text = f"{what}: {msg} (HTTP {status}{', ' + code if code else ''})"
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

    def rpc(self, function: str, args: dict[str, Any]) -> Any:
        resp = self.http.post(
            f"{self.url}/rest/v1/rpc/{function}", headers=self._headers(), json=args
        )
        _raise_for(resp, f"rpc {function}")
        return resp.json() if resp.content else None

    def storage_upload(self, bucket: str, key: str, data: bytes, media_type: str) -> bool:
        """Upload without overwriting; False if the object already exists (tests only)."""
        resp = self.http.post(
            f"{self.url}/storage/v1/object/{bucket}/{key}",
            headers=self._headers(**{"Content-Type": media_type, "x-upsert": "false"}),
            content=data,
        )
        if resp.status_code in (400, 409) and "exists" in resp.text.lower():
            return False
        _raise_for(resp, f"upload {bucket}/{key}")
        return True

    def signed_url(self, bucket: str, key: str, expires_in: int = 300) -> str:
        """A time-limited download address for an object the user may read."""
        resp = self.http.post(
            f"{self.url}/storage/v1/object/sign/{bucket}/{key}",
            headers=self._headers(),
            json={"expiresIn": expires_in},
        )
        _raise_for(resp, f"sign {bucket}/{key}")
        return f"{self.url}/storage/v1{resp.json()['signedURL']}"

    def download(self, url: str) -> bytes:
        resp = self.http.get(url)
        _raise_for(resp, "download")
        return resp.content
