# ruff: noqa: E501 - SQL text reads better unwrapped
"""Checks of a loaded demo dataset (docs/demo-turu.md §10.2, step 6).

Part one runs under the owner persona's claims with `set local role
authenticated`, i.e. through row level security, and counts what the owner
portal needs, the LiDAR crown values the tree card and the tour draw (version 4),
the world clouds of the tour's 3D world (version 5), parcel A's winter scans with
their world clouds and LiDAR skeleton and pruning values (version 6),
the service card (unpriced, buyable) and the done mowing job with its proof
photos and the own-work note included. Part two runs as postgres: media
objects, persona lockdown, a billing setting that only switches the service layer
on, the catalogue row and its seasons, the robot model that can do it, no
service price, the job's rows (done by the robot MARABA-I), the parcels' species,
no notification. One read-only transaction, rolled back.
"""

from __future__ import annotations

import json

from . import ids
from .dataset import (
    DEMO_SPECIES,
    FEATURED,
    LIDAR_VERSION,
    ROBOT_MODEL_CODE,
    ROBOT_MODEL_ID,
    SERVICE_JOBS,
    SERVICE_SEASON,
    SERVICE_TERMS_VERSION,
    SERVICE_TYPE,
    WEED_HEIGHTS,
    Dataset,
)
from .lidar import CODES as LIDAR_CODES
from .lidar import METHOD as LIDAR_METHOD
from .lidar import present_trees
from .sqlgen import TOKEN_COLUMNS, lit
from .winter import WINTER_VISITS
from .world import WORLD_VISITS

# LiDAR codes of the winter scans (sqlgen.WINTER_LIDAR): the skeleton's on both, the
# pruning stage's on the scan after the pruning.
WINTER_SKELETON_CODES = ("scaffold_branch_count", "wood_volume", "fractal_dimension")
WINTER_PRUNING_CODES = (
    "pruning_cut_count",
    "pruning_status",
    "pruned_wood_volume",
    "pruned_wood_fraction",
)

# Card states of public.service_offers without an open request. Which one the
# portal shows depends on the day: the visits are fixed in the past, so out of
# season it is pre_request, in season available (the July 2026 observation is
# older than observation_max_age_days); never claimed to be "recommended". Either
# way the card leads to the request form: no request is open on either parcel.
OFFER_STATES = ("recommended", "available", "pre_request")
# The own-work note (apps/web/src/lib/services/independence.ts): orchadOS mowing
# in the 365 days up to the visit.
OWN_WORK_WINDOW_DAYS = 365

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
  'viewers_a', (select count(*) from public.parcel_access where parcel_id = {lit(A)} and role = 'viewer'),
  -- Version 5 (İP17 3D world): the world clouds of A's scans, as the owner reads them.
  'world_clouds_a', (
    select count(*) from public.asset a where a.parcel_id = {lit(A)} and a.kind = 'world_cloud'
      and a.session_id in ({", ".join(lit(ds.visit(k).id) for k in WORLD_VISITS)})
      and a.mime_type = 'application/vnd.orchados.world-cloud'),
  -- Version 6: parcel A's winter scans, their assessments, expert and LiDAR values
  -- and world clouds, as the owner reads them.
  'winter_visits', (
    select coalesce(json_object_agg(id, json_build_object('status', status, 'day', planned_date,
      'kind', kind)), '{{}}')
    from public.session where id in ({", ".join(lit(ds.visit(k).id) for k in WINTER_VISITS)})),
  'winter_assessments', (
    select coalesce(json_object_agg(session_id, n), '{{}}') from (
      select session_id, count(distinct tree_id) as n from public.assessment
      where session_id in ({", ".join(lit(ds.visit(k).id) for k in WINTER_VISITS)})
      group by session_id) x),
  'winter_values', (
    select coalesce(json_object_agg(session_id || ':' || source || ':' || code, n), '{{}}') from (
      select m.session_id, m.source, d.code, count(distinct m.tree_id) as n from public.measurement m
      join public.metric_definition d on d.id = m.metric_definition_id
      where m.session_id in ({", ".join(lit(ds.visit(k).id) for k in WINTER_VISITS)})
        and m.tree_id is not null
      group by m.session_id, m.source, d.code) x),
  'winter_cut_trees', (
    select count(*) from public.measurement m
    join public.metric_definition d on d.id = m.metric_definition_id and d.code = 'pruning_cut_count'
    where m.session_id = {lit(ds.visit(WINTER_VISITS[-1]).id)} and m.source = 'algorithm'
      and m.value_numeric > 0),
  'winter_worlds', (
    select coalesce(json_agg(json_build_object('session_id', a.session_id, 'sha256', a.content_hash,
      'point_count', (a.pose ->> 'point_count')::int, 'bytes', a.byte_size) order by a.session_id), '[]')
    from public.asset a where a.parcel_id = {lit(A)} and a.kind = 'world_cloud'
      and a.mime_type = 'application/vnd.orchados.world-cloud'
      and a.session_id in ({", ".join(lit(ds.visit(k).id) for k in WINTER_VISITS)})),
  -- Version 4: LiDAR crown values per scan and metric (trees with a value), as
  -- the tree card and the tour read them, and the featured tree's in A 2026.
  'lidar', (
    select coalesce(json_object_agg(session_id || ':' || code, n), '{{}}') from (
      select m.session_id, d.code, count(distinct m.tree_id) as n from public.measurement m
      join public.metric_definition d on d.id = m.metric_definition_id
      join public.session s on s.id = m.session_id and s.org_id = {lit(ORG)} and s.kind = 'periodic_scan'
      where m.source = 'algorithm' and m.method = {lit(LIDAR_METHOD)} and m.tree_id is not null
        and m.value_numeric is not null and d.code in ({", ".join(lit(c) for c in LIDAR_CODES)})
      group by m.session_id, d.code) x),
  'lidar_featured', (
    select coalesce(json_agg(distinct d.code), '[]') from public.measurement m
    join public.metric_definition d on d.id = m.metric_definition_id
    where m.session_id = {lit(ids.A_SCAN_2026)} and m.tree_id = {lit(featured)}
      and m.method = {lit(LIDAR_METHOD)}),
  -- IP15 service layer: the card and the done job, as the owner reads them.
  'service_offers', (
    select coalesce(json_agg(json_build_object('parcel_id', o.parcel_id, 'code', o.service_code,
      'state', o.state, 'weed_height', o.weed_height, 'species', o.species,
      'priced', o.price_per_donum_kurus is not null or o.estimate_total_kurus is not null,
      'open', o.open_request_id is not null, 'robot', o.robot_model_code)), '[]')
    from public.service_offers() o),
  'weed_a', (
    select m.value_category from public.measurement m
    join public.metric_definition d on d.id = m.metric_definition_id and d.code = 'weed_height'
    join public.session s on s.id = m.session_id and s.status = 'published'
    where m.parcel_id = {lit(A)} and m.tree_id is null and m.slot_id is null and m.zone_id is null
    order by m.measured_at desc limit 1),
  'done_requests_b', (
    select count(*) from public.service_request r where r.parcel_id = {lit(B)} and r.status = 'done'
      and r.payment_received_on is not null and r.terms_version = {lit(SERVICE_TERMS_VERSION)}
      and r.quote_total_kurus > 0 and r.payment_amount_kurus = r.quote_total_kurus),
  'tour_request', (
    select count(*) from public.service_request r where r.id = {lit(SERVICE_JOBS[0].request_id)}
      and r.parcel_id = {lit(B)} and r.status = 'done'),
  -- The own-work note of B's care row: an orchadOS mowing job the owner reads, in
  -- the window before B's latest published visit.
  'own_work_b', (
    select count(*) from public.operation op
    join lateral (
      select s.started_at from public.session s where s.parcel_id = {lit(B)} and s.status = 'published'
      order by s.started_at desc limit 1) v on true
    where op.parcel_id = {lit(B)} and op.kind = 'mowing' and op.details ->> 'by' = 'orchados'
      and op.started_at <= v.started_at
      and op.started_at > v.started_at - interval '{OWN_WORK_WINDOW_DAYS} days'),
  'request_history_b', (
    select coalesce(json_agg(e.to_status order by e.created_at), '[]') from public.service_request_event e
    join public.service_request r on r.id = e.request_id where r.parcel_id = {lit(B)} and r.status = 'done'),
  'proof_photos_b', (
    select coalesce(json_object_agg(phase, n), '{{}}') from (
      select p.phase, count(*) as n from public.service_request_photo p
      join public.service_request r on r.id = p.request_id and r.status = 'done'
      join public.asset a on a.id = p.asset_id and a.kind = 'photo'
      where r.parcel_id = {lit(B)} group by p.phase) x),
  'proof_objects_b', (
    select count(*) from public.service_request_photo p
    join public.asset a on a.id = p.asset_id
    join storage.objects o on o.bucket_id = 'media'
      and o.name = 'org/' || a.org_id || '/parcel/' || a.parcel_id || '/' || a.content_hash
    where p.parcel_id = {lit(B)}),
  'proof_links_b', (select count(*) from public.service_request_photo where parcel_id = {lit(B)})
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
  'billing_setting', (
    select row_to_json(x) from (select services_enabled, accepts_signups, allow_fake_payments
      from public.org_billing_setting where org_id = {lit(ORG)}) x),
  'service_type', (
    select row_to_json(x) from (
      select {", ".join(SERVICE_TYPE)}, active from public.service_type
      where org_id = {lit(ORG)} and code = {lit(SERVICE_TYPE["code"])}) x),
  -- The season per fruit species: one row for every species, all the same window.
  'seasons', (
    select count(*) from public.service_type_season s
    join public.service_type t on t.id = s.service_type_id and t.code = {lit(SERVICE_TYPE["code"])}
    where s.org_id = {lit(ORG)}
      and (s.season_start_month, s.season_start_day, s.season_end_month, s.season_end_day)
        = ({", ".join(str(x) for x in SERVICE_SEASON)})),
  'species', (select count(*) from public.fruit_species),
  -- No service price: the demo org has no price list rows for its services.
  'service_prices', (select count(*) from public.price_list_service_item where org_id = {lit(ORG)}),
  'parcel_species', (
    select coalesce(json_agg(species order by id), '[]') from public.parcel where org_id = {lit(ORG)}),
  -- Unpriced requests: no frozen estimate (all eight columns null), the amount ops
  -- entered, the boundary's area.
  'bad_quotes', (
    select count(*) from public.service_request r
    where r.org_id = {lit(ORG)} and (
      num_nulls(r.price_list_id, r.price_list_version, r.price_per_donum_kurus, r.minimum_fee_kurus,
        r.vat_rate_bp, r.estimate_subtotal_kurus, r.estimate_vat_kurus, r.estimate_total_kurus) <> 8
      or r.area_m2 is distinct from (select a.area_m2 from private.parcel_service_area(r.parcel_id) a)
      or (r.status in ('scheduled', 'done') and coalesce(r.quote_total_kurus, 0) <= 0))),
  -- The robot models that can do the demo org's mowing (version 3).
  'service_robot_models', (
    select coalesce(json_agg(m.code order by sm.sort_order, m.code), '[]')
    from public.service_type_robot_model sm
    join public.robot_model m on m.id = sm.robot_model_id and m.active
    join public.service_type t on t.id = sm.service_type_id and t.code = {lit(SERVICE_TYPE["code"])}
    where sm.org_id = {lit(ORG)}),
  -- Done jobs written as ops_complete_service_request leaves them: the robot did
  -- the job with the model the owner chose (version 3; internal truth).
  'done_jobs', (
    select count(*) from public.service_request r
    join public.operation op on op.id = r.operation_id and op.session_id = r.session_id
      and op.kind = 'mowing' and op.performer = 'robot' and op.details ->> 'service_request_id' = r.id::text
      and op.details ->> 'by' = 'orchados' and op.details ->> 'robot_model' = {lit(ROBOT_MODEL_CODE)}
    join public.session s on s.id = r.session_id and s.kind = 'mowing' and s.status = 'captured'
      and s.performer = 'robot'
    where r.org_id = {lit(ORG)} and r.status = 'done' and r.robot_model_id = {lit(ROBOT_MODEL_ID)}
      and exists (select 1 from public.service_request_photo p where p.request_id = r.id and p.phase = 'before')
      and exists (select 1 from public.service_request_photo p where p.request_id = r.id and p.phase = 'after')),
  'published_job_sessions', (
    select count(*) from public.session where org_id = {lit(ORG)}
      and kind in ('mowing', 'spraying', 'tillage', 'manual_entry') and status = 'published'),
  'robot_notes', (select count(*) from public.parcel_robot_note where org_id = {lit(ORG)}),
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

    scans_a = sum(1 for v in ds.scans() if v.parcel.id == A)
    need(
        owner["published_scans_a"] == scans_a,
        f"parcel A: {owner['published_scans_a']} published scans, expected {scans_a}",
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
    need(
        owner["world_clouds_a"] == len(WORLD_VISITS),
        f"parcel A: {owner['world_clouds_a']} world clouds the owner reads, expected "
        f"{len(WORLD_VISITS)} ({', '.join(WORLD_VISITS)})",
    )
    codes = owner["codes_a26"]
    for code in (
        "basal_sprout_level",
        "pest_sign_severity",
        "pest_sign_type",
        "fruit_load_scale",
        "dead_branch_scale",
    ):
        need(codes.get(code, 0) > 0, f"A 2026: no {code} values")
    # Version 4: every tree present in a scan has a height, and nearly all a crown
    # (the crown stage gives a bare dead tree its height only); the featured tree
    # the full drawing.
    lidar = owner["lidar"]
    for v in ds.summer_scans():
        present = len(present_trees(ds, v))
        n = {c: lidar.get(f"{v.id}:{c}", 0) for c in LIDAR_CODES}
        need(
            n["tree_height"] == present,
            f"{v.key}: {n['tree_height']} trees with a LiDAR tree_height, expected {present} "
            f"(dataset version {LIDAR_VERSION})",
        )
        need(
            n["crown_diameter"] == n["crown_volume"] == n["crown_base_height"]
            and n["crown_diameter"] >= 0.9 * present,
            f"{v.key}: LiDAR crown values {n} for {present} trees",
        )
    need(
        {"tree_height", "crown_diameter", "crown_base_height"} <= set(owner["lidar_featured"]),
        f"featured tree: LiDAR values {owner['lidar_featured']} in A 2026, the crown "
        "drawing needs height, diameter and base",
    )
    out.extend(winter_problems(owner, ds))
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
    # Service layer (docs/MVP.md Module 6).
    need(
        admin["billing_settings"] == 1
        and admin["billing_setting"]
        == {"services_enabled": True, "accepts_signups": False, "allow_fake_payments": False},
        f"demo billing setting: {admin['billing_setting']}, expected only services_enabled",
    )
    st = admin["service_type"]
    need(
        st is not None and st["active"] and {k: st[k] for k in SERVICE_TYPE} == SERVICE_TYPE,
        f"demo org weed mowing catalogue row: {st}",
    )
    need(
        admin["seasons"] == admin["species"] > 0,
        f"{admin['seasons']} season rows of the demo service, expected one per species "
        f"({admin['species']}) with {SERVICE_SEASON}",
    )
    need(admin["service_prices"] == 0, "the demo org has a service price (expected unpriced)")
    need(
        admin["parcel_species"] == [DEMO_SPECIES, DEMO_SPECIES],
        f"demo parcel species {admin['parcel_species']}, expected {DEMO_SPECIES}",
    )
    offers = owner["service_offers"]
    for parcel, name in ((A, "A"), (B, "B")):
        mine = [o for o in offers if o["parcel_id"] == parcel and o["code"] == SERVICE_TYPE["code"]]
        need(
            len(mine) == 1
            and mine[0]["state"] in OFFER_STATES
            and not mine[0]["open"]
            and not mine[0]["priced"]
            and mine[0]["species"] == DEMO_SPECIES
            and mine[0]["robot"] == ROBOT_MODEL_CODE,
            f"parcel {name}: service card {mine}, expected one unpriced card in "
            f"{', '.join(OFFER_STATES)} for {ROBOT_MODEL_CODE}",
        )
        if name == "A" and mine:
            need(mine[0]["weed_height"] == WEED_HEIGHTS["A-SCN26"], "parcel A card: weed height")
    need(
        owner["weed_a"] == WEED_HEIGHTS["A-SCN26"],
        f"parcel A: latest published weed_height {owner['weed_a']!r}",
    )
    need(owner["done_requests_b"] >= 1, "parcel B: no paid done service request with a quote")
    need(owner["tour_request"] == 1, "the tour's service request is not B's done job")
    need(owner["own_work_b"] >= 1, "parcel B: no orchadOS mowing before its latest visit")
    need(
        owner["request_history_b"] == ["requested", "scheduled", "done"],
        f"parcel B: request history {owner['request_history_b']}",
    )
    proof = owner["proof_photos_b"]
    need(
        proof.get("before", 0) >= 1 and proof.get("after", 0) >= 1,
        f"parcel B: proof photos the owner reads {proof}",
    )
    need(
        owner["proof_objects_b"] == owner["proof_links_b"] > 0,
        "parcel B: proof photo objects the owner cannot read",
    )
    need(
        admin["bad_quotes"] == 0,
        f"{admin['bad_quotes']} service requests with an estimate, another area or no amount",
    )
    need(
        admin["done_jobs"] >= 1,
        "no done job with operation, captured mowing session and photos, done by the robot "
        f"{ROBOT_MODEL_CODE}",
    )
    need(
        admin["service_robot_models"] == [ROBOT_MODEL_CODE],
        f"robot models of the demo mowing {admin['service_robot_models']}, "
        f"expected [{ROBOT_MODEL_CODE!r}]",
    )
    need(admin["published_job_sessions"] == 0, "a service job session is published")
    need(admin["robot_notes"] == 2, f"{admin['robot_notes']} robot notes, expected 2")
    need(admin["notifications"] == 0, f"{admin['notifications']} notifications for the demo org")
    return out


def winter_problems(owner: dict, ds: Dataset) -> list[str]:
    """Version 6: parcel A's winter scans as the owner reads them."""
    from .dataset import winter_values
    from .winter import present

    out = []
    values = owner["winter_values"]
    worlds = {w["session_id"]: w for w in owner["winter_worlds"]}
    for key in WINTER_VISITS:
        v = ds.visit(key)
        row = owner["winter_visits"].get(v.id)
        if row != {"status": "published", "day": v.day, "kind": "periodic_scan"}:
            out.append(f"{key}: visit {row}, expected published periodic_scan on {v.day}")
            continue
        trees = present(ds, v)
        if owner["winter_assessments"].get(v.id, 0) != len(trees):
            out.append(f"{key}: {owner['winter_assessments'].get(v.id, 0)} assessed trees")
        codes = set(winter_values(v, trees[0], "healthy"))
        for code in sorted(codes):
            n = values.get(f"{v.id}:expert:{code}", 0)
            if n != len(trees):
                out.append(f"{key}: {n} trees with an expert {code}, expected {len(trees)}")
        lidar = WINTER_SKELETON_CODES + (WINTER_PRUNING_CODES if key == WINTER_VISITS[-1] else ())
        for code in lidar:
            n = values.get(f"{v.id}:algorithm:{code}", 0)
            if n < 0.9 * len(trees):
                out.append(f"{key}: LiDAR {code} for {n} of {len(trees)} trees")
        w = worlds.get(v.id)
        if w is None or not w["point_count"]:
            out.append(f"{key}: no world cloud the owner reads")
        elif w["bytes"] <= 11 * w["point_count"]:
            out.append(f"{key}: the world cloud carries no skeleton ({w['bytes']} bytes)")
    if owner["winter_cut_trees"] < 10:
        out.append(f"{WINTER_VISITS[-1]}: {owner['winter_cut_trees']} trees with LiDAR cuts")
    return out


def world_file_problems(owner: dict, build) -> tuple[list[str], int]:
    """The winter world clouds' files of the build (when it holds the stored bytes):
    the skeleton, and after the pruning the cut wood and the cuts. Returns the
    problems and how many files were checked."""
    from pathlib import Path

    from ..lidar.world import KIND_PRUNED, read_world

    out, checked = [], 0
    last = None
    for w in owner["winter_worlds"]:
        path = Path(build) / "files" / w["sha256"]
        if not path.is_file():
            continue
        cloud = read_world(path)
        checked += 1
        h = cloud.header
        if not h.get("segment_count") or h.get("skeleton") is None:
            out.append(f"world cloud {w['sha256'][:12]}: no skeleton segments")
            continue
        if "time" in json.dumps(h).lower():
            out.append(f"world cloud {w['sha256'][:12]}: a time field in the header")
        pruning = h["skeleton"].get("pruning")
        if pruning is not None:
            last = cloud
            if not (cloud.segment_kind == KIND_PRUNED).any() or not h.get("cut_count"):
                out.append(f"world cloud {w['sha256'][:12]}: pruning without cut wood or cuts")
    if checked == len(owner["winter_worlds"]) and checked and last is None:
        out.append("no winter world cloud carries the pruning")
    return out, checked
