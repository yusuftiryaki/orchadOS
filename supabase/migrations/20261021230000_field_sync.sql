-- Field app sync (IP6): what the offline field app needs to upload its queue.
--
-- 1. Media uploads by field staff. The field app uploads close-up photos to
--    the media bucket itself. field_staff may now add objects under a parcel
--    of its own org, with the same name rule as ops; there is still no update
--    or delete policy, so media stays immutable for every API user.
-- 2. session_event: phone-side copy of what the crew sent to the GNSS logger
--    during a visit (session_start, qr_sync, corner, session_stop). The logger
--    keeps its own events.csv on the SD card; these rows arrive earlier (over
--    the network, not with the SD card) and also record events the logger
--    missed. Insert-only; the id is generated on the phone, so a resent event
--    is a conflict on the primary key and is ignored (on conflict do nothing).
-- 3. Field question metrics: yes/no answers of the close-up protocol
--    (apps/field, closeup_protocol.dart) are measurements with source staff
--    and need a registry row each. Hidden on the report card: staff answers
--    are evidence for the expert, not results (docs/metodoloji.md, section 6).

-- ---------------------------------------------------------------------------
-- 1. Media: field staff may add objects
-- ---------------------------------------------------------------------------

drop policy media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and objects.name ~ '^org/[0-9a-f-]{36}/parcel/[0-9a-f-]{36}/[0-9a-f]{64}$'
    and authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids('{field_staff,ops}'))
    and exists (
      select 1 from public.parcel p
      where p.id = authz.uuid_or_null((storage.foldername(objects.name))[4])
        and p.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
    )
  );

-- ---------------------------------------------------------------------------
-- 2. session_event
-- ---------------------------------------------------------------------------

create table public.session_event (
  -- Generated on the phone; a resent event has the same id.
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  -- session_start, session_stop, corner, qr_sync (open set: new app versions may add types).
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*$'),
  -- qr_sync: the QR text (OQ1:<gps_ms>:<label>); corner: the corner number.
  payload text not null default '',
  -- GPS time of the event (docs/arayuzler.md, "Zaman"); from the phone clock when time_source = phone.
  gps_time_ns bigint not null check (gps_time_ns >= 0),
  time_source text not null check (time_source in ('gps', 'phone')),
  -- Phone clock when the event was recorded (UTC).
  phone_time timestamptz not null,
  -- The logger's answer to the command (ok, timeout, not_recording, ...); null when no command was sent.
  logger_result text,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- Server receive time.
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id)
);
comment on table public.session_event is
  'Events the field app sent to the GNSS logger during a visit (qr_sync, corner, ...), as recorded on the phone. Insert-only.';
create index session_event_session_id_idx on public.session_event (session_id, gps_time_ns);
create index session_event_parcel_id_idx on public.session_event (parcel_id);
create index session_event_org_id_idx on public.session_event (org_id);

create trigger session_event_insert_only
before update or delete on public.session_event
for each row execute function private.forbid_mutation();
create trigger session_event_no_truncate
before truncate on public.session_event
for each statement execute function private.forbid_mutation();

alter table public.session_event enable row level security;
revoke all on public.session_event from anon, authenticated;
grant select, insert on public.session_event to authenticated;
grant all on public.session_event to service_role;

-- Operational data: org members only (owners and viewers never see it).
create policy session_event_select on public.session_event for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy session_event_insert on public.session_event for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

-- ---------------------------------------------------------------------------
-- 3. Field question metrics (yes/no, tree, hidden on the card)
-- ---------------------------------------------------------------------------

-- Same id rule as 20261021180000_metric_registry.sql. harvest_complete and
-- branch_break are registered there already and are used as they are.
insert into public.metric_definition (
  id, code, name, description, unit, value_type, valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, null,
       'boolean'::public.metric_value_type, m.valid_seasons::public.season[],
       'hidden'::public.card_visibility, '{tree}'::public.measurement_subject[]
from (values
  ('dead_branch_present', 'Kuru dal var mı', 'Field question: a dead branch is seen.', '{winter,spring}'),
  ('trunk_damage_present', 'Gövdede hasar var mı', 'Field question: wound, cavity or bark loss on the trunk.', '{winter}'),
  ('root_sucker_present', 'Dipte sürgün var mı', 'Field question: root suckers at the base.', '{winter}'),
  ('pruned', 'Budanmış mı', 'Field question: the tree was pruned this winter.', '{winter}'),
  ('frost_damage_present', 'Don hasarı var mı', 'Field question: blackened flowers or young shoots.', '{spring}'),
  ('pest_sign_present', 'Zararlı belirtisi var mı', 'Field question: visible pest signs.', '{spring,summer}'),
  ('fruit_present', 'Meyve var mı', 'Field question: the tree carries fruit clusters.', '{summer}'),
  ('drought_stress_sign', 'Kuraklık belirtisi var mı', 'Field question: signs of drought stress.', '{summer}'),
  ('theft_sign_present', 'Hırsızlık izi var mı (ağaç)', 'Field question: signs of early picking or theft at the tree.', '{harvest}')
) as m (code, name, description, valid_seasons)
on conflict do nothing;
