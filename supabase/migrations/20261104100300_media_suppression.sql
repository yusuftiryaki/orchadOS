-- T20 (H01, H26 md. 7; pilot): ops hides a panorama, a crop or a close-up.
--
-- H01: "Bir kişinin itirazında (md. 11) o kişinin göründüğü kare ya da
-- panorama elle gizlenir. Bu talebe bağlı bir işlemdir. Ürün kararı (yüz
-- bulanıklaştırma yapılmaz) değişmez."
--
-- 1. private.media_suppression: append-only records (hide / unhide) per
--    target (an asset or a capture), with reason, note, actor and time.
--    Lifting a suppression is a new 'unhide' row; the newest row of a target
--    decides. Media rows and storage objects are never updated or deleted
--    ("Medya değiştirilemez").
-- 2. What a hidden panorama takes with it: the other variant of the same
--    frame (full / preview share pose.gps_time_ns in the visit) and the crops
--    cut from either (pose.panorama_asset_id). A crop or close-up hides alone.
-- 3. Reads: restrictive select policies on asset and capture keep hidden rows
--    from everyone but ops and field staff of the org: owners, co-owners,
--    demo visitors and experts no longer see them (tour, tree card, report and
--    inventory PDFs, expert panel). The media bucket gets a restrictive policy
--    too, so a hidden file cannot be signed (lib/media signs as the user). The
--    service role (pipeline, loaders) is not affected.
-- 4. ops_hide_media, ops_unhide_media, ops_media_suppressions; audit rows
--    without the note.

create table private.media_suppression (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  parcel_id uuid not null,
  session_id uuid not null,
  target_table text not null check (target_table in ('asset', 'capture')),
  target_id uuid not null,
  action text not null check (action in ('hide', 'unhide')),
  reason text not null check (reason in ('kvkk_objection', 'third_party', 'other')),
  -- Free text by ops: may name the person (personal data; KVKK scripts).
  note text check (note is null or char_length(note) between 1 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id)
);
comment on table private.media_suppression is
  'T20 (H01): append-only hide/unhide records of a panorama, crop or close-up; the newest row of a target decides.';
create index media_suppression_target_idx on private.media_suppression (target_id, created_at desc);
create index media_suppression_org_idx on private.media_suppression (org_id, created_at desc);
create index media_suppression_session_idx on private.media_suppression (session_id);
alter table private.media_suppression enable row level security;
revoke all on private.media_suppression from public, anon, authenticated;
select private.attach_demo_guard('private.media_suppression');

create function private.media_suppression_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'media_suppression is append-only' using errcode = '42501';
end;
$$;
create trigger media_suppression_append_only
before update or delete on private.media_suppression
for each row execute function private.media_suppression_append_only();

-- ---------------------------------------------------------------------------
-- Hidden sets
-- ---------------------------------------------------------------------------

-- Targets whose newest record is 'hide'.
create function private.hidden_targets()
returns table (target_table text, target_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.target_table, t.target_id
  from (
    select distinct on (m.target_id) m.target_table, m.target_id, m.action
    from private.media_suppression m
    order by m.target_id, m.created_at desc, m.id desc
  ) t
  where t.action = 'hide'
$$;

-- Hidden assets with what a hidden panorama takes along (2. above).
create function authz.hidden_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with hidden as (
    select h.target_id from private.hidden_targets() h where h.target_table = 'asset'
  ),
  frames as (
    select p.session_id, p.pose ->> 'gps_time_ns' as gps
    from public.asset p
    where p.id in (select target_id from hidden) and p.kind = 'panorama' and p.pose ? 'gps_time_ns'
  ),
  panoramas as (
    select target_id as id from hidden
    union
    select p.id from public.asset p
    join frames f on f.session_id = p.session_id and p.pose ->> 'gps_time_ns' = f.gps
    where p.kind = 'panorama'
  )
  select id from panoramas
  union
  select c.id from public.asset c
  where c.kind = 'tree_crop' and c.pose ->> 'panorama_asset_id' in (select id::text from panoramas)
$$;
comment on function authz.hidden_asset_ids() is
  'T20: hidden assets, with the other variant of a hidden panorama frame and the crops cut from it.';

create function authz.hidden_capture_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select h.target_id from private.hidden_targets() h where h.target_table = 'capture'
$$;

-- A media object (org/<org>/parcel/<parcel>/<hash>) belongs to a hidden row.
create function authz.media_object_hidden(p_org_id uuid, p_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.asset a
    where a.org_id = p_org_id and a.content_hash = p_hash and a.id in (select authz.hidden_asset_ids())
  ) or exists (
    select 1 from public.capture c
    where c.org_id = p_org_id and c.content_hash = p_hash and c.id in (select authz.hidden_capture_ids())
  );
$$;

revoke all on function private.hidden_targets() from public;
revoke all on function authz.hidden_asset_ids() from public, anon;
revoke all on function authz.hidden_capture_ids() from public, anon;
revoke all on function authz.media_object_hidden(uuid, text) from public, anon;
grant execute on function authz.hidden_asset_ids() to authenticated, service_role;
grant execute on function authz.hidden_capture_ids() to authenticated, service_role;
grant execute on function authz.media_object_hidden(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create policy asset_not_hidden on public.asset as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids('{ops,field_staff}'))
    or id not in (select authz.hidden_asset_ids())
  );
comment on policy asset_not_hidden on public.asset is
  'T20 (H01): hidden media are visible to ops and field staff only.';
create policy capture_not_hidden on public.capture as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids('{ops,field_staff}'))
    or id not in (select authz.hidden_capture_ids())
  );
comment on policy capture_not_hidden on public.capture is
  'T20 (H01): hidden close-ups are visible to ops and field staff only.';

create policy media_not_hidden on storage.objects as restrictive for select to authenticated
  using (
    bucket_id <> 'media'
    or authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids('{ops,field_staff}'))
    or not authz.media_object_hidden(authz.uuid_or_null((storage.foldername(objects.name))[2]),
                                     storage.filename(objects.name))
  );

-- ---------------------------------------------------------------------------
-- Ops functions
-- ---------------------------------------------------------------------------

-- The target row of an id: asset (panorama, crop, photo) or capture (photo).
create function private.media_target(p_id uuid)
returns table (target_table text, org_id uuid, parcel_id uuid, session_id uuid, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'asset', a.org_id, a.parcel_id, a.session_id, a.kind::text
  from public.asset a where a.id = p_id and a.kind in ('panorama', 'tree_crop', 'photo')
  union all
  select 'capture', c.org_id, c.parcel_id, c.session_id, c.kind::text
  from public.capture c where c.id = p_id and c.kind = 'photo'
$$;

create function private.media_hidden_now(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.action = 'hide' from private.media_suppression m
                   where m.target_id = p_id order by m.created_at desc, m.id desc limit 1), false);
$$;

create function public.ops_hide_media(p_id uuid, p_reason text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform private.assert_not_demo();
  select * into t from private.media_target(p_id) limit 1;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(t.org_id);
  if p_reason is null or p_reason not in ('kvkk_objection', 'third_party', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if private.media_hidden_now(p_id) then
    raise exception 'already_hidden' using errcode = 'P0001';
  end if;
  insert into private.media_suppression (org_id, parcel_id, session_id, target_table, target_id, action, reason, note, created_by)
  values (t.org_id, t.parcel_id, t.session_id, t.target_table, p_id, 'hide', p_reason, v_note, (select auth.uid()))
  returning id into v_id;
  perform private.audit(t.org_id, (select auth.uid()), 'ops', 'media_suppression.hidden', 'media_suppression', v_id,
    jsonb_build_object('target_table', t.target_table, 'target_id', p_id, 'kind', t.kind, 'reason', p_reason,
                       'parcel_id', t.parcel_id, 'session_id', t.session_id));
  return v_id;
end;
$$;
comment on function public.ops_hide_media(uuid, text, text) is
  'T20 (H01): ops hides a panorama, crop or close-up (append-only record, audited without the note).';

create function public.ops_unhide_media(p_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text;
  v_id uuid;
begin
  perform private.assert_not_demo();
  select * into t from private.media_target(p_id) limit 1;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(t.org_id);
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if not private.media_hidden_now(p_id) then
    raise exception 'not_hidden' using errcode = 'P0001';
  end if;
  select m.reason into v_reason from private.media_suppression m
  where m.target_id = p_id order by m.created_at desc, m.id desc limit 1;
  insert into private.media_suppression (org_id, parcel_id, session_id, target_table, target_id, action, reason, note, created_by)
  values (t.org_id, t.parcel_id, t.session_id, t.target_table, p_id, 'unhide', v_reason, v_note, (select auth.uid()))
  returning id into v_id;
  perform private.audit(t.org_id, (select auth.uid()), 'ops', 'media_suppression.unhidden', 'media_suppression', v_id,
    jsonb_build_object('target_table', t.target_table, 'target_id', p_id, 'kind', t.kind,
                       'parcel_id', t.parcel_id, 'session_id', t.session_id));
  return v_id;
end;
$$;
comment on function public.ops_unhide_media(uuid, text) is
  'T20: ops lifts a suppression with a new record (the history stays).';

-- Records of a parcel or a visit, newest first, with the target's current
-- state and its uri (ops signs it to show the image with a "gizlendi" badge).
create function public.ops_media_suppressions(p_parcel_id uuid default null, p_session_id uuid default null)
returns table (
  id uuid, org_id uuid, parcel_id uuid, session_id uuid, target_table text, target_id uuid, kind text,
  uri text, action text, reason text, note text, created_at timestamptz, actor_email text, hidden_now boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_parcel_id is null and p_session_id is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select m.id, m.org_id, m.parcel_id, m.session_id, m.target_table, m.target_id,
         coalesce(a.kind::text, c.kind::text), coalesce(a.uri, c.uri), m.action, m.reason, m.note, m.created_at,
         u.email::text, private.media_hidden_now(m.target_id)
  from private.media_suppression m
  left join public.asset a on m.target_table = 'asset' and a.id = m.target_id
  left join public.capture c on m.target_table = 'capture' and c.id = m.target_id
  left join auth.users u on u.id = m.created_by
  where (p_parcel_id is null or m.parcel_id = p_parcel_id)
    and (p_session_id is null or m.session_id = p_session_id)
    and m.org_id in (select authz.user_org_ids('{ops}'))
  order by m.created_at desc, m.id desc;
end;
$$;
comment on function public.ops_media_suppressions(uuid, uuid) is
  'T20: ops lists the hide/unhide records of a parcel or visit (own orgs only).';

revoke all on function private.media_target(uuid) from public;
revoke all on function private.media_hidden_now(uuid) from public;
revoke all on function private.media_suppression_append_only() from public;
revoke all on function public.ops_hide_media(uuid, text, text) from public, anon;
revoke all on function public.ops_unhide_media(uuid, text) from public, anon;
revoke all on function public.ops_media_suppressions(uuid, uuid) from public, anon;
grant execute on function public.ops_hide_media(uuid, text, text) to authenticated;
grant execute on function public.ops_unhide_media(uuid, text) to authenticated;
grant execute on function public.ops_media_suppressions(uuid, uuid) to authenticated;
