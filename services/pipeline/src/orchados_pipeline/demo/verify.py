# ruff: noqa: E501 - SQL text reads better unwrapped
"""Checks of a loaded demo dataset (docs/demo-turu.md §10.2, step 6).

Part one runs under the owner persona's claims with `set local role
authenticated`, i.e. through row level security, and counts what the owner
portal needs. Part two runs as postgres: media objects, persona lockdown, no
billing setting, no notification. One read-only transaction, rolled back.
"""

from __future__ import annotations

import json

from . import ids
from .dataset import FEATURED, Dataset
from .sqlgen import TOKEN_COLUMNS, lit

A, B = ids.PARCEL_A, ids.PARCEL_B
ORG = ids.ORG_ID


def verify_sql(ds: Dataset) -> str:
    featured = ds.tree(*FEATURED).id
    claims = json.dumps({"sub": ids.OWNER, "role": "authenticated"})
    personas = ", ".join(lit(p[0]) for p in ids.PERSONAS)
    tokens = " or ".join(f"{c} is null" for c in TOKEN_COLUMNS)
    owner = f"""
select json_build_object(
  'published_scans_a', (select count(*) from public.session where parcel_id = {lit(A)} and kind = 'periodic_scan' and status = 'published'),
  'published_scans_b', (select count(*) from public.session where parcel_id = {lit(B)} and kind = 'periodic_scan' and status = 'published'),
  -- T23 (H05): the owner reads panoramas and close-ups only through the
  -- portal readers, which carry no capture time.
  'full_panoramas_a26', (select count(*) from public.portal_panorama_frames(array[{lit(ids.A_SCAN_2026)}]::uuid[]) where full_asset_id is not null),
  'paired_panoramas_a26', (
    select count(*) from public.portal_panorama_frames(array[{lit(ids.A_SCAN_2026)}]::uuid[])
    where full_asset_id is not null and preview_asset_id is not null),
  'previews_a25', (select count(*) from public.portal_panorama_frames(array[{lit(ids.A_SCAN_2025)}]::uuid[]) where preview_asset_id is not null),
  'trees_without_crop', (
    select count(*) from public.session s
    join public.tree t on t.parcel_id = s.parcel_id and t.status = 'active'
    where s.org_id = {lit(ORG)} and s.kind = 'periodic_scan' and s.status = 'published'
      and not exists (select 1 from public.asset a where a.session_id = s.id and a.tree_id = t.id and a.kind = 'tree_crop')),
  'featured_closeups', (select count(*) from public.portal_closeups(array(select id from public.session), {lit(featured)})),
  'findings_a26', (select count(*) from public.finding where session_id = {lit(ids.A_SCAN_2026)}),
  'answered_questions', (
    select count(*) from public.question q where q.parcel_id = {lit(A)}
      and exists (select 1 from public.question_reply r where r.question_id = q.id and r.author_role = 'expert')),
  'approved_inventories', (
    select count(*) from public.session s where s.org_id = {lit(ORG)} and s.kind = 'inventory' and s.status = 'published'
      and exists (select 1 from public.portal_panorama_frames(array[s.id]))
      and exists (select 1 from public.coverage_report c where c.session_id = s.id and c.passed)),
  'approved_boundaries', (
    select count(distinct parcel_id) from public.boundary where parcel_id in ({lit(A)}, {lit(B)}) and owner_approved_at is not null),
  'males_a', (select count(*) from public.tree where parcel_id = {lit(A)} and status = 'active' and sex = 'male'),
  'females_a', (select count(*) from public.tree where parcel_id = {lit(A)} and status = 'active' and sex = 'female'),
  'ungrafted_a', (select count(*) from public.tree where parcel_id = {lit(A)} and status = 'active' and graft = 'ungrafted'),
  'codes_a26', (
    select coalesce(json_object_agg(code, n), '{{}}') from (
      select d.code, count(distinct m.tree_id) as n from public.measurement m
      join public.metric_definition d on d.id = m.metric_definition_id
      where m.session_id = {lit(ids.A_SCAN_2026)} and m.tree_id is not null
      group by d.code) x),
  'viewers_a', (select count(*) from public.parcel_access where parcel_id = {lit(A)} and role = 'viewer')
)::text;"""
    admin = f"""
select json_build_object(
  'missing_media', (
    select count(*) from (
      select org_id, parcel_id, content_hash, uri from public.asset where org_id = {lit(ORG)}
      union all
      select org_id, parcel_id, content_hash, uri from public.capture where org_id = {lit(ORG)}
    ) r
    where r.uri like 'storage://media/%'
      and not exists (select 1 from storage.objects o where o.bucket_id = 'media'
                      and o.name = 'org/' || r.org_id || '/parcel/' || r.parcel_id || '/' || r.content_hash)),
  -- Evidence may be a panorama, which the owner does not read (T23): counted here.
  'findings_without_evidence', (
    select count(*) from public.finding f where f.org_id = {lit(ORG)}
      and not exists (select 1 from public.finding_evidence e where e.finding_id = f.id)),
  'mirror', (select count(*) > 0 from storage.buckets where id = 'demo-media'),
  'missing_mirror', (
    select case when not exists (select 1 from storage.buckets where id = 'demo-media') then 0 else (
      select count(*) from (
        select org_id, parcel_id, content_hash, uri from public.asset where org_id = {lit(ORG)}
        union all
        select org_id, parcel_id, content_hash, uri from public.capture where org_id = {lit(ORG)}
      ) r
      where r.uri like 'storage://media/%'
        and not exists (select 1 from storage.objects o where o.bucket_id = 'demo-media'
                        and o.name = 'org/' || r.org_id || '/parcel/' || r.parcel_id || '/' || r.content_hash))
    end),
  'personas', (select count(*) from auth.users where id in ({personas})),
  'personas_open', (
    select count(*) from auth.users where id in ({personas})
      and (coalesce(encrypted_password, '') <> '' or banned_until is null or banned_until <= now() or {tokens})),
  'personas_demo_flag', (select count(*) from auth.users where id in ({personas}) and raw_app_meta_data ? 'demo'),
  'billing_settings', (select count(*) from public.org_billing_setting where org_id = {lit(ORG)}),
  'notifications', (select count(*) from public.notification where org_id = {lit(ORG)}),
  'registry', (select to_regclass('private.demo_org') is not null)
)::text;"""
    return (
        "begin;\n"
        f"do $$ begin perform set_config('request.jwt.claims', {lit(claims)}, true); end $$;\n"
        "set local role authenticated;\n"
        f"{owner}\n"
        "reset role;\n"
        f"{admin}\n"
        "rollback;\n"
    )


def problems(owner: dict, admin: dict, ds: Dataset) -> list[str]:
    """What is wrong, in words; empty when the dataset is complete."""
    out = []

    def need(ok: bool, what: str) -> None:
        if not ok:
            out.append(what)

    need(
        owner["published_scans_a"] == 2,
        f"parcel A: {owner['published_scans_a']} published scans, expected 2",
    )
    need(
        owner["published_scans_b"] == 1,
        f"parcel B: {owner['published_scans_b']} published scans, expected 1",
    )
    need(owner["full_panoramas_a26"] > 0, "A 2026: no full panoramas")
    need(
        owner["paired_panoramas_a26"] == owner["full_panoramas_a26"],
        "A 2026: full panoramas without a preview",
    )
    need(owner["previews_a25"] > 0, "A 2025: no previews")
    need(
        owner["trees_without_crop"] == 0,
        f"{owner['trees_without_crop']} active trees without a crop in a scan",
    )
    need(owner["featured_closeups"] >= 2, "featured tree: fewer than 2 close-ups")
    need(owner["findings_a26"] >= 10, f"A 2026: {owner['findings_a26']} findings")
    need(admin["findings_without_evidence"] == 0, "findings without evidence")
    need(
        owner["answered_questions"] >= 2,
        f"{owner['answered_questions']} answered questions, expected 2",
    )
    need(
        owner["approved_inventories"] == 2,
        "approved inventories with panoramas and a passing coverage report",
    )
    need(owner["approved_boundaries"] == 2, "approved boundaries")
    need(
        owner["males_a"] > 0 and owner["females_a"] > 0 and owner["ungrafted_a"] > 0,
        "parcel A structure",
    )
    need(owner["viewers_a"] >= 1, "parcel A has no viewer")
    codes = owner["codes_a26"]
    for code in (
        "basal_sprout_level",
        "pest_sign_severity",
        "pest_sign_type",
        "fruit_load_scale",
        "dead_branch_scale",
    ):
        need(codes.get(code, 0) > 0, f"A 2026: no {code} values")
    need(
        admin["missing_media"] == 0,
        f"{admin['missing_media']} storage:// uris without an object in media",
    )
    need(admin["missing_mirror"] == 0, f"{admin['missing_mirror']} objects missing from demo-media")
    need(admin["personas"] == len(ids.PERSONAS), "personas missing")
    need(
        admin["personas_open"] == 0,
        f"{admin['personas_open']} personas with a password, no ban or a NULL token",
    )
    need(admin["personas_demo_flag"] == 0, "a persona carries app_metadata.demo")
    need(admin["billing_settings"] == 0, "the demo org has an org_billing_setting row")
    need(admin["notifications"] == 0, f"{admin['notifications']} notifications for the demo org")
    return out
