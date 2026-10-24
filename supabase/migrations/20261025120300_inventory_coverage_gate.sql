-- Inventory approval checks the coverage quality gate (MVP Module 2: "grid
-- tarama kapsaması kalite kapısından geçmiş ... olmalı"; docs/metodoloji.md
-- section 10).
--
-- 1. approve_inventory(): when the inventory scan has a coverage report and its
--    newest report is below the threshold, approval is refused
--    (inventory_incomplete, detail "coverage_below_threshold: <ratio>/<threshold>"),
--    unless the expert accepted that report with a reason. A session without a
--    coverage report (older data, or the pipeline did not measure it yet)
--    behaves as before.
-- 2. waive_coverage(): the expert accepts a report below the threshold with a
--    reason (e.g. a corridor that cannot be driven); who, when and why are kept
--    on the report. A newer report needs its own acceptance.
--
-- Decision: refuse rather than warn. The acceptance criterion requires the gate;
-- an explicit, recorded acceptance covers the cases the crew cannot fix.

alter table public.coverage_report
  add column waived_by uuid references auth.users (id) on delete set null,
  add column waived_at timestamptz,
  add column waiver_note text check (waiver_note is null or length(waiver_note) <= 2000),
  add check ((waived_at is null) = (waiver_note is null) and (waived_at is null) = (waived_by is null));
comment on column public.coverage_report.waiver_note is
  'The expert accepted this report below its threshold for the inventory approval (waive_coverage), and why.';

-- Accept the newest coverage report of an unpublished inventory session.
-- Errors: forbidden (42501: not an expert of the org), session_invalid (not an
-- inventory session, or published), not_found (P0002: no coverage report),
-- invalid_input (22023: empty note; the report passed).
create function public.waive_coverage(p_session_id uuid, p_note text)
returns public.coverage_report
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  r public.coverage_report;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into s from public.session where id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.kind <> 'inventory' or s.status in ('published', 'cancelled') then
    raise exception 'session_invalid' using errcode = '22023';
  end if;
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_note';
  end if;
  select * into r from public.coverage_report
  where session_id = s.id
  order by created_at desc, id desc
  limit 1
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.passed then
    raise exception 'invalid_input' using errcode = '22023', detail = 'the coverage passed';
  end if;
  update public.coverage_report
  set waived_by = (select auth.uid()), waived_at = now(), waiver_note = v_note
  where id = r.id
  returning * into r;
  return r;
end;
$$;
comment on function public.waive_coverage(uuid, text) is
  'Expert: accepts the newest coverage report of an inventory scan below its threshold, with a reason.';
revoke all on function public.waive_coverage(uuid, text) from public, anon;
grant execute on function public.waive_coverage(uuid, text) to authenticated;

create or replace function public.approve_inventory(p_session_id uuid)
returns public.session
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_uid uuid := (select auth.uid());
  v_problems text[] := '{}';
  v_open text[];
  v_coverage public.coverage_report;
begin
  select * into s from public.session where id = p_session_id for update;
  if not found or s.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'forbidden' using errcode = '42501', detail = format('session %s', p_session_id);
  end if;
  if s.kind <> 'inventory' then
    raise exception 'session_invalid' using errcode = '22023', detail = format('session %s is %s', s.id, s.kind);
  end if;
  if s.status = 'published' then
    raise exception 'already_published' using errcode = '55000';
  end if;
  if s.status not in ('captured', 'processed', 'in_review') then
    raise exception 'session_invalid' using errcode = '22023', detail = format('session %s is %s', s.id, s.status);
  end if;

  -- Two approvals of one parcel run one after the other.
  perform pg_advisory_xact_lock(hashtextextended('approve_inventory:' || s.parcel_id::text, 0));
  if authz.inventory_approved(s.parcel_id) then
    raise exception 'already_published' using errcode = '55000', detail = 'the parcel inventory is approved';
  end if;

  if not exists (select 1 from public.slot where parcel_id = s.parcel_id) then
    v_problems := v_problems || 'no_slots';
  end if;
  select array_agg(distinct sl.code order by sl.code)
  into v_open
  from public.verification_item v
  join public.slot sl on sl.id = v.slot_id
  where v.parcel_id = s.parcel_id and v.status = 'open';
  if v_open is not null then
    v_problems := v_problems || ('open_items: ' || array_to_string(v_open, ', '));
  end if;
  -- Coverage quality gate (MVP Module 2 acceptance): the newest coverage report
  -- of the inventory scan must pass, or the expert has accepted it with a reason
  -- (waive_coverage). Without a report (older data) nothing changes.
  select * into v_coverage from public.coverage_report
  where session_id = s.id
  order by created_at desc, id desc
  limit 1;
  if found and not v_coverage.passed and v_coverage.waived_at is null then
    v_problems := v_problems || format('coverage_below_threshold: %s/%s',
      to_char(v_coverage.ratio, 'FM0.0000'), to_char(v_coverage.threshold, 'FM0.0000'));
  end if;
  if cardinality(v_problems) > 0 then
    raise exception 'inventory_incomplete' using errcode = 'P0001',
      detail = array_to_string(v_problems, '; '),
      hint = 'Save the inventory, close every verification item and pass (or accept) the coverage before approving.';
  end if;

  update public.finding
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and approved_by is null;

  update public.assessment
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and source = 'expert' and approved_by is null;

  update public.session
  set status = 'published', published_at = now(), published_by = v_uid
  where id = s.id
  returning * into s;

  update public.parcel
  set status = 'inventory_done'
  where id = s.parcel_id and status in ('registered', 'inventory_planned');

  return s;
end;
$$;
