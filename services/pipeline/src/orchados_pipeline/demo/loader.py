"""Load, verify, enable and disable the demo dataset (docs/demo-turu.md §10).

SQL always goes through psql (-v ON_ERROR_STOP=1 -1), the same code path on both
targets:

- local:  docker exec -i supabase_db_orchados psql -U postgres -d postgres
- remote: psql "$DEMO_DB_URL" with $PGPASSWORD (the project's database password)

Media are uploaded with SUPABASE_URL and SUPABASE_ANON_KEY as the demo org's ops
persona, which gets a random password for the run and loses it again in a
`finally` block. The service role key is used only locally, for --reset-local.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..hashing import sha256_bytes, sha256_file
from ..media import SupabaseMediaStore, media_key
from ..supabase import Conflict, SupabaseClient
from . import ids
from .build import PIPELINE_ROOT, generator_hash, manifest_sha
from .dataset import DATASET_VERSION, Dataset, load
from .render import PROFILES
from .sources import SOURCES, build_source
from .sqlgen import BANNED_UNTIL, Metric, generate, lit
from .verify import problems, verify_sql

REPO = PIPELINE_ROOT.parents[1]
CONTAINER = os.environ.get("DEMO_DB_CONTAINER", "supabase_db_orchados")
MIRROR = "demo-media"
CACHE_CONTROL = "max-age=31536000"
# Dataset versions (docs/demo-turu.md §10.3). Versions are cumulative: version 2
# holds every row of version 1 with the same ids and media seeds, plus its own
# rows (ids v2), and every insert is "on conflict do nothing". Loading the latest
# version is therefore applying all versions in order, and a target registered
# at an older version only gains rows. Only DATASET_VERSION is built and loaded.
VERSIONS = (2,)
assert VERSIONS == (DATASET_VERSION,), "the loader applies the latest (cumulative) version"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
KEY = re.compile(rf"^org/{UUID}/parcel/{UUID}/[0-9a-f]{{64}}$")


class LoadError(RuntimeError):
    pass


# ---------------------------------------------------------------------------------------
# Build check
# ---------------------------------------------------------------------------------------


def check_file(build: Path, f: dict) -> tuple[str, Path]:
    """The object key and local path of a manifest file whose bytes hash to its name."""
    sha = f.get("sha256")
    if not isinstance(sha, str) or not SHA256.match(sha):
        raise LoadError(f"manifest file with a bad sha256: {sha!r}")
    if f.get("org") != ids.ORG_ID:
        raise LoadError(f"manifest file {sha} belongs to another org: {f.get('org')!r}")
    key = media_key(f["org"], str(f.get("parcel")), sha)
    if not KEY.match(key):
        raise LoadError(f"manifest file {sha}: bad object key {key!r}")
    path = Path(build) / "files" / sha
    if not path.is_file():
        raise LoadError(f"build file missing: {path}")
    if sha256_file(path) != sha:
        raise LoadError(f"build file {path}: bytes do not hash to its name")
    return key, path


def check_manifest(manifest: object, profile: str, build: Path) -> dict:
    """Refuse a build that is not the one this code makes (docs/demo-turu.md §10.3).

    A downloaded build (workflow input reuse_build_run_id) is checked like a cached
    one: known version, the requested profile, this generator, a valid self-hash and
    every file present with bytes that hash to its name.
    """
    if not isinstance(manifest, dict):
        raise LoadError("manifest.json is not an object")
    version = manifest.get("version")
    if type(version) is not int or version not in VERSIONS:
        raise LoadError(f"manifest version {version!r} is not one of {VERSIONS}")
    if profile not in PROFILES or manifest.get("profile") != profile:
        raise LoadError(f"build is profile {manifest.get('profile')!r}, not {profile}")
    if manifest.get("source", "synthetic") not in SOURCES:
        raise LoadError(f"unknown build source {manifest.get('source')!r}")
    if manifest.get("generator_hash") != generator_hash():
        raise LoadError(
            "build was made by other generator code (generator_hash differs); rebuild it"
        )
    sha = manifest.get("dataset_sha256")
    if not isinstance(sha, str) or sha != manifest_sha(manifest):
        raise LoadError("manifest dataset_sha256 does not match its contents")
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise LoadError("manifest has no files")
    for f in files:
        if not isinstance(f, dict):
            raise LoadError("manifest file entry is not an object")
        check_file(build, f)
        if type(f.get("bytes")) is not int:
            raise LoadError(f"manifest file {f['sha256']}: bytes is not an int")
    return manifest


# ---------------------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------------------


class Psql:
    def __init__(self, target: str):
        if target == "local":
            if shutil.which("docker") is None:
                raise LoadError("docker is not installed; start the local stack with pnpm db:start")
            self.base = [
                "docker",
                "exec",
                "-i",
                CONTAINER,
                "psql",
                "-U",
                "postgres",
                "-d",
                "postgres",
            ]
        elif target == "remote":
            url = os.environ.get("DEMO_DB_URL")
            if not url:
                raise LoadError("DEMO_DB_URL is not set (session pooler address, port 5432)")
            if shutil.which("psql") is None:
                raise LoadError("psql is not installed")
            self.base = ["psql", url]
        else:
            raise LoadError(f"unknown target {target}")
        self.target = target

    def run(self, sql: str, single: bool = True) -> str:
        args = self.base + ["-X", "-v", "ON_ERROR_STOP=1"] + (["-1"] if single else [])
        res = subprocess.run(args, input=sql, capture_output=True, text=True)
        if res.returncode != 0:
            err = res.stderr.strip().splitlines()
            raise LoadError("psql failed: " + " | ".join(err[-6:]))
        return res.stdout

    def query(self, sql: str) -> list[str]:
        args = self.base + ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]
        res = subprocess.run(args, input=sql, capture_output=True, text=True)
        if res.returncode != 0:
            raise LoadError("psql failed: " + res.stderr.strip())
        return [line for line in res.stdout.splitlines() if line.strip()]

    def json(self, sql: str):
        rows = self.query(sql)
        return json.loads(rows[-1]) if rows else None


def insert_counts(output: str) -> dict[str, int]:
    """Rows inserted per table, from the `\\echo @insert <table>` markers and INSERT tags."""
    counts: dict[str, int] = {}
    table = None
    for line in output.splitlines():
        if line.startswith("@insert "):
            table = line.split(" ", 1)[1].strip()
        else:
            m = re.match(r"INSERT 0 (\d+)$", line.strip())
            if m and table:
                counts[table] = counts.get(table, 0) + int(m.group(1))
                table = None
    return counts


def api_env(target: str) -> dict[str, str]:
    """SUPABASE_URL, SUPABASE_ANON_KEY (and locally SERVICE_ROLE_KEY)."""
    env = {k: os.environ[k] for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY") if os.environ.get(k)}
    if target == "remote":
        missing = [k for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY") if k not in env]
        if missing:
            raise LoadError("missing environment variables: " + ", ".join(missing))
        return env
    status = local_status()
    env.setdefault("SUPABASE_URL", status["API_URL"])
    env.setdefault("SUPABASE_ANON_KEY", status["ANON_KEY"])
    env["SERVICE_ROLE_KEY"] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or status.get(
        "SERVICE_ROLE_KEY", ""
    )
    return env


def local_status() -> dict[str, str]:
    """`supabase status -o env` of the local stack."""
    exe = REPO / "node_modules" / ".bin" / "supabase"
    cmd = [str(exe)] if exe.exists() else ["pnpm", "exec", "supabase"]
    res = subprocess.run(
        cmd + ["status", "-o", "env", "--workdir", str(REPO)], capture_output=True, text=True
    )
    if res.returncode != 0:
        raise LoadError(
            "local Supabase is not running (pnpm db:start): " + res.stderr.strip()[-300:]
        )
    out = {}
    for line in res.stdout.splitlines():
        m = re.match(r'^([A-Z_]+)="?(.*?)"?$', line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


# ---------------------------------------------------------------------------------------
# State of the target
# ---------------------------------------------------------------------------------------


@dataclass
class State:
    registry: bool
    row: dict | None
    other_orgs: int
    demo_org: bool
    mirror: bool
    asset_hashes: set[str] = field(default_factory=set)


def state(db: Psql) -> State:
    d = db.json(
        f"""
select json_build_object(
  'registry', to_regclass('private.demo_org') is not null,
  'other_orgs', (select count(*) from public.org where id <> {lit(ids.ORG_ID)}),
  'demo_org', exists (select 1 from public.org where id = {lit(ids.ORG_ID)}),
  'mirror', exists (select 1 from storage.buckets where id = '{MIRROR}'),
  'hashes', (select coalesce(jsonb_agg(content_hash), '[]'::jsonb)
             from public.asset where org_id = {lit(ids.ORG_ID)})
)::text;"""
    )
    row = None
    if d["registry"]:
        row = db.json(
            "select coalesce((select row_to_json(r) from (select dataset_version, "
            "dataset_sha256, loaded_at, enabled "
            f"from private.demo_org where org_id = {lit(ids.ORG_ID)}) r), 'null')::text;"
        )
    return State(d["registry"], row, d["other_orgs"], d["demo_org"], d["mirror"], set(d["hashes"]))


def metrics(db: Psql) -> dict[str, Metric]:
    rows = db.json(
        "select jsonb_agg(json_build_object('id', id, 'code', code, 'value_type', value_type, "
        "'valid_seasons', valid_seasons, 'card_visibility', card_visibility, 'subject_kinds', "
        "subject_kinds))::text "
        "from public.metric_definition;"
    )
    return {
        r["code"]: Metric(
            r["id"],
            r["code"],
            r["value_type"],
            tuple(r["valid_seasons"]),
            r["card_visibility"],
            tuple(r["subject_kinds"]),
        )
        for r in rows
    }


# ---------------------------------------------------------------------------------------
# Verify, enable, disable
# ---------------------------------------------------------------------------------------


def verify(db: Psql, ds: Dataset | None = None, log: Callable[[str], None] = print) -> list[str]:
    ds = ds or load()
    relock_ops(db)
    rows = db.query(verify_sql(ds))
    owner, admin = (json.loads(r) for r in rows if r.startswith("{"))
    found = problems(owner, admin, ds)
    if found:
        for p in found:
            log(f"verify: {p}")
    else:
        log(
            "verify: ok ("
            f"{owner['published_scans_a']}+{owner['published_scans_b']} published scans, "
            f"{owner['findings_a26']} findings in A 2026, {owner['answered_questions']} answered "
            "questions, "
            f"media {'and mirror ' if admin['mirror'] else ''}complete)"
        )
    return found


def enable(db: Psql, log: Callable[[str], None] = print) -> None:
    st = state(db)
    if not st.registry:
        raise LoadError("private.demo_org does not exist (stream A's migrations are not applied)")
    if not st.row or not st.row.get("loaded_at"):
        raise LoadError(
            "the demo dataset is not loaded (registry row without loaded_at); run demo load first"
        )
    if verify(db, log=log):
        raise LoadError("verify failed; the demo stays disabled")
    db.run(
        "update private.demo_org set enabled = false, updated_at = now() where enabled and "
        f"org_id <> {lit(ids.ORG_ID)};\n"
        "update private.demo_org set enabled = true, updated_at = now() where org_id = "
        f"{lit(ids.ORG_ID)};\n"
    )
    log("demo enabled")


def disable(db: Psql, log: Callable[[str], None] = print) -> None:
    st = state(db)
    if not st.registry:
        raise LoadError("private.demo_org does not exist (stream A's migrations are not applied)")
    db.run(
        "update private.demo_org set enabled = false, updated_at = now() where org_id = "
        f"{lit(ids.ORG_ID)};\n"
    )
    log("demo disabled")


# ---------------------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------------------


@dataclass
class LoadReport:
    inserted: dict[str, int] = field(default_factory=dict)
    uploaded: int = 0
    mirrored: int = 0
    existing: int = 0
    files: int = 0
    megabytes: float = 0.0
    status: str = ""

    def lines(self) -> list[str]:
        rows = sum(self.inserted.values())
        out = [f"rows inserted: {rows}" + (" (nothing new)" if rows == 0 else "")]
        out += [f"  {t}: {n}" for t, n in sorted(self.inserted.items()) if n]
        out.append(
            f"files: {self.files} ({self.megabytes:.1f} MB); uploaded {self.uploaded} to media, "
            f"{self.mirrored} to {MIRROR}, {self.existing} already there"
        )
        if self.status:
            out.append(self.status)
        return out


def reset_local(env: dict[str, str], log: Callable[[str], None]) -> None:
    key = env.get("SERVICE_ROLE_KEY")
    if not key:
        raise LoadError("--reset-local needs the local service role key (supabase status)")
    r = httpx.post(
        f"{env['SUPABASE_URL']}/rest/v1/rpc/purge_org",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Profile": "testing"},
        json={"p_org_id": ids.ORG_ID},
        timeout=300,
    )
    if r.status_code >= 300:
        raise LoadError(f"testing.purge_org failed ({r.status_code}): {r.text.strip()[:300]}")
    deleted = sum(row.get("deleted", 0) for row in r.json() or [])
    log(f"reset-local: removed the demo org ({deleted} rows); personas kept")


def relock_ops(db: Psql) -> None:
    """Take the ops persona's password away again; idempotent, run on every load.

    The lock is also restored in upload_media's `finally`, but a runner killed after
    the upload never gets there, so every load, verify and enable re-locks first.
    """
    db.run(
        f"update auth.users set encrypted_password = '', banned_until = {lit(BANNED_UNTIL)}, "
        f"updated_at = now() where id = {lit(ids.OPS)} "
        "and (coalesce(encrypted_password, '') <> '' or banned_until is null "
        "or banned_until <= now());\n"
    )


def upload_media(
    db: Psql,
    env: dict[str, str],
    build: Path,
    manifest: dict,
    mirror: bool,
    report: LoadReport,
    log: Callable[[str], None],
) -> None:
    """Upload missing objects as the ops persona; its password lives only for this call."""
    existing = set(
        db.query(
            "select bucket_id || ':' || name from storage.objects "
            f"where bucket_id in ('media', '{MIRROR}') and name like 'org/{ids.ORG_ID}/%';"
        )
    )
    files = manifest["files"]
    todo = [
        f
        for f in files
        if f"media:{_key(f)}" not in existing or (mirror and f"{MIRROR}:{_key(f)}" not in existing)
    ]
    report.existing = len(files) - len(todo)
    if not todo:
        log("media: all objects already uploaded")
        return
    password = secrets.token_urlsafe(24)
    email = ids.persona_email(next(p[2] for p in ids.PERSONAS if p[0] == ids.OPS))
    # Checked again right before the upload: the objects can never be replaced.
    checked = [(f, *check_file(build, f)) for f in todo]
    try:
        # updated_at = now(): stream A's housekeeping leaves a persona changed in the
        # last hour alone, so it cannot re-ban it between this and the sign-in.
        db.run(
            "update auth.users set encrypted_password = extensions.crypt("
            f"{lit(password)}, extensions.gen_salt('bf')), banned_until = null, "
            f"updated_at = now() where id = {lit(ids.OPS)};\n"
        )
        with SupabaseClient(env["SUPABASE_URL"], env["SUPABASE_ANON_KEY"]) as client:
            client.sign_in_with_password(email, password)
            store = SupabaseMediaStore(client)
            for n, (f, key, path) in enumerate(checked, 1):
                if f"media:{key}" not in existing:
                    if store.put(key, path, f["mime"]):
                        report.uploaded += 1
                if mirror and f"{MIRROR}:{key}" not in existing:
                    if _put_mirror(client, key, path, f["mime"]):
                        report.mirrored += 1
                if n % 100 == 0:
                    log(f"media: {n}/{len(todo)}")
            _read_back(client, build, files, mirror)
    finally:
        relock_ops(db)


def _key(f: dict) -> str:
    return media_key(f["org"], f["parcel"], f["sha256"])


def _put_mirror(client: SupabaseClient, key: str, path: Path, mime: str) -> bool:
    resp = client.http.post(
        f"{client.url}/storage/v1/object/{MIRROR}/{key}",
        headers=client._headers(
            **{"Content-Type": mime, "x-upsert": "false", "cache-control": CACHE_CONTROL}
        ),
        content=path.read_bytes(),
    )
    from ..supabase import _raise_for

    try:
        _raise_for(resp, f"upload {MIRROR}/{key}")
    except Conflict:
        return False
    return True


def _read_back(client: SupabaseClient, build: Path, files: list[dict], mirror: bool) -> None:
    """A panorama, a crop, a close-up and a proof photo: their stored bytes hash to
    their names."""
    sample = []
    for kind in ("panorama", "preview", "tree_crop", "closeup", "service_photo"):
        f = next((f for f in files if f["kind"] == kind), None)
        if f:
            sample.append(f)
    for f in sample:
        data = client.storage_download("media", _key(f))
        if sha256_bytes(data) != f["sha256"]:
            raise LoadError(f"media/{_key(f)}: stored bytes do not match")
        if mirror:
            r = client.http.get(f"{client.url}/storage/v1/object/public/{MIRROR}/{_key(f)}")
            if r.status_code != 200 or sha256_bytes(r.content) != f["sha256"]:
                raise LoadError(
                    f"{MIRROR}/{_key(f)}: public read failed or bytes differ ({r.status_code})"
                )


def finish_registry(db: Psql, ds: Dataset, manifest: dict) -> None:
    db.run(
        f"""
update private.demo_org
set loaded_at = coalesce(loaded_at, now()), dataset_version = {lit(DATASET_VERSION)},
    dataset_sha256 = {lit(manifest["dataset_sha256"])},
    dataset_source = {lit(manifest.get("source", "synthetic"))},
    tour = {lit(ds.tour())}, updated_at = now()
where org_id = {lit(ids.ORG_ID)};
insert into private.demo_parcel (parcel_id, org_id, sort_order, active) values
  ({lit(ids.PARCEL_A)}, {lit(ids.ORG_ID)}, 1, true),
  ({lit(ids.PARCEL_B)}, {lit(ids.ORG_ID)}, 2, true)
on conflict (parcel_id) do update set sort_order = excluded.sort_order, active = excluded.active;
"""
    )


def load_demo(
    target: str,
    profile: str = "full",
    build_dir: Path | None = None,
    dry_run: bool = False,
    reset: bool = False,
    do_verify: bool = False,
    demo_only: bool = False,
    do_enable: bool = False,
    force_build: bool = False,
    log: Callable[[str], None] = print,
) -> LoadReport:
    if reset and target != "local":
        raise LoadError("--reset-local works only with --target local")
    if do_enable and dry_run:
        raise LoadError("--enable and --dry-run exclude each other")
    if reset and dry_run:
        raise LoadError("--reset-local and --dry-run exclude each other (a dry run writes nothing)")
    db = Psql(target)
    env = api_env(target)
    report = LoadReport()

    st = state(db)
    if demo_only and st.other_orgs:
        raise LoadError(
            f"--demo-only: the target has {st.other_orgs} orgs besides the demo org; nothing "
            "written"
        )
    if not st.registry:
        if target == "remote":
            raise LoadError(
                "private.demo_org does not exist on the target: apply the demo access migrations "
                "(stream A) first"
            )
        log(
            "warning: private.demo_org does not exist (stream A not merged): registry and mirror "
            "steps skipped"
        )

    if build_dir and not force_build and (Path(build_dir) / "manifest.json").is_file():
        build = Path(build_dir)
        try:
            manifest = json.loads((build / "manifest.json").read_text(encoding="utf-8"))
        except ValueError as e:
            raise LoadError(f"{build}/manifest.json is not valid JSON: {e}") from e
    else:
        build, manifest = build_source(
            "synthetic", profile, Path(build_dir) if build_dir else None, force_build, log
        )
    check_manifest(manifest, profile, build)
    report.files = len(manifest["files"])
    report.megabytes = sum(f["bytes"] for f in manifest["files"]) / 1e6
    ds = load()
    hint = "pnpm db:reset or --reset-local" if target == "local" else "a new dataset version"
    other_bytes = LoadError(
        f"the target holds demo media of another profile or build; use {hint} "
        f"(this build: profile {profile})"
    )
    hashes = {f["sha256"] for f in manifest["files"]}

    if not dry_run:
        relock_ops(db)  # a run killed after the upload left it open
    if reset:
        reset_local(env, log)
        st = state(db)

    # --- pre-check ----------------------------------------------------------------------
    row = st.row
    # Locally a different profile or build is a mismatch even when the registry says
    # "loaded"; hosted projects compare versions only (§10.3).
    if target == "local" and st.asset_hashes and not st.asset_hashes <= hashes:
        raise other_bytes
    if row and row.get("dataset_version") is not None:
        if type(row["dataset_version"]) is not int:
            raise LoadError(f"registry dataset_version {row['dataset_version']!r} is not an int")
        if row["dataset_version"] > DATASET_VERSION:
            raise LoadError(
                f"the target has dataset version {row['dataset_version']}, newer than this code "
                f"({DATASET_VERSION})"
            )
    if row and row.get("dataset_version") == DATASET_VERSION:
        if row.get("loaded_at"):
            if not verify(db, ds, log):
                report.status = f"already loaded (version {DATASET_VERSION})"
                log(report.status)
                if do_enable:
                    enable(db, log)
                return report
            log("registered as loaded but verify fails: loading again")
        elif row.get("dataset_sha256") != manifest["dataset_sha256"]:
            raise LoadError(
                "a partial load of this version used another build: rerun with that build "
                "(workflow input reuse_build_run_id) or bump the dataset version"
            )
        else:
            log("resuming a partial load with the same build")
    if st.asset_hashes and not st.asset_hashes <= hashes:
        raise other_bytes
    mirror = st.mirror and st.registry

    # --- SQL (one version: see VERSIONS) ------------------------------------------------
    sql = generate(ds, build, manifest, metrics(db)).sql(
        f"-- orchados demo dataset v{DATASET_VERSION} ({profile})"
    )
    if dry_run:
        out = db.run(sql + "rollback;\n")
        report.inserted = insert_counts(out)
        report.status = "dry run: rolled back, nothing written"
        log("\n".join(report.lines()))
        return report
    report.inserted = insert_counts(db.run(sql))
    log(f"sql: {sum(report.inserted.values())} rows inserted")

    # --- media, registry ----------------------------------------------------------------
    upload_media(db, env, build, manifest, mirror, report, log)
    if st.registry:
        finish_registry(db, ds, manifest)
    if do_verify or do_enable:
        found = verify(db, ds, log)
        if found:
            raise LoadError("verify failed")
    if do_enable:
        if st.registry:
            enable(db, log)
        else:
            log("warning: no registry table, nothing to enable")
    log("\n".join(report.lines()))
    return report
