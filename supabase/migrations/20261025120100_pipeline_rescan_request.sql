-- Rescan request from the processing pipeline (docs/metodoloji.md, section 10:
-- "Eşiğin altındaki parsel için yeniden tarama görevi açılır").
--
-- A coverage report below its threshold, or with a blind spot, opens an extra
-- visit request through the existing follow-up mechanism
-- (20261024120200_followup_requests.sql), so ops sees it with the expert's
-- requests on the dashboard and plans it the same way (ops_plan_followups).
--
-- 1. followup_request.origin: who asked, expert (default) or pipeline; and the
--    coverage report a pipeline request comes from. The note lists the
--    uncovered trees and the blind spot cells.
-- 2. One pipeline request per visit, ever: processing the visit again does not
--    open a second one, not even after ops cancelled the first.
-- 3. A newer report of the visit that needs no rescan (reprocessed with better
--    data) cancels a pipeline request that is still open.

create type public.followup_origin as enum ('expert', 'pipeline');

alter table public.followup_request
  add column origin public.followup_origin not null default 'expert',
  add column coverage_report_id uuid,
  add foreign key (coverage_report_id, parcel_id, org_id)
    references public.coverage_report (id, parcel_id, org_id),
  add check (origin = 'expert' or (kind = 'extra_visit' and coverage_report_id is not null));
comment on column public.followup_request.origin is
  'expert: asked in the expert panel (request_followup); pipeline: opened by a coverage report below its threshold.';
create index followup_request_coverage_report_idx on public.followup_request (coverage_report_id);
create unique index followup_request_pipeline_uq on public.followup_request (source_session_id)
  where origin = 'pipeline';

-- The request's note: ratio, threshold, uncovered trees, blind spot cells.
create function private.coverage_note(r public.coverage_report)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(concat_ws(E'\n',
    format('İşleme hattı: kapsama %%%s (eşik %%%s), %s/%s ağaç iki yönden görüldü.',
      replace(to_char(round((r.ratio * 100)::numeric, 1), 'FM990.0'), '.', ','),
      replace(to_char(round((r.threshold * 100)::numeric, 1), 'FM990.0'), '.', ','),
      r.covered_trees, r.active_trees),
    case when cardinality(r.missing_slot_codes) > 0 then
      format('Eksik ağaçlar (%s): %s', r.missing_trees, array_to_string(r.missing_slot_codes, ', '))
    end,
    case when r.blind_spots > 0 then
      format('Kör nokta hücreleri (%s): %s', r.blind_spots, (
        select string_agg(format('(%s,%s): %s', c -> 'cell' ->> 0, c -> 'cell' ->> 1,
          coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(c -> 'slot_codes') x), '')), '; ')
        from jsonb_array_elements(r.blind_spot_cells) c))
    end), 2000);
$$;

create function private.open_rescan_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rescan_needed then
    insert into public.followup_request (
      org_id, parcel_id, source_session_id, kind, note, origin, coverage_report_id, requested_by
    )
    values (
      new.org_id, new.parcel_id, new.session_id, 'extra_visit', private.coverage_note(new),
      'pipeline', new.id, new.created_by
    )
    on conflict (source_session_id) where origin = 'pipeline' do nothing;
  else
    update public.followup_request
    set status = 'cancelled', resolved_at = now(), resolved_by = new.created_by,
        note = left(concat_ws(E'\n', note, 'Yeni kapsama raporu eşiği geçti; istek kapandı.'), 2000)
    where source_session_id = new.session_id and origin = 'pipeline' and status = 'open';
  end if;
  return null;
end;
$$;

create trigger coverage_report_open_rescan_request
after insert on public.coverage_report
for each row execute function private.open_rescan_request();

revoke all on function private.coverage_note(public.coverage_report) from public, anon;
revoke all on function private.open_rescan_request() from public, anon;

-- The pipeline reports the visit's request after recording the coverage.
create function public.pipeline_rescan_request(p_session_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', f.id, 'status', f.status, 'coverage_report_id', f.coverage_report_id)
  from public.followup_request f
  where f.source_session_id = p_session_id and f.origin = 'pipeline';
$$;
comment on function public.pipeline_rescan_request(uuid) is
  'The extra visit request the pipeline opened for a visit (null without one); org roles.';
revoke all on function public.pipeline_rescan_request(uuid) from public, anon;
grant execute on function public.pipeline_rescan_request(uuid) to authenticated;
