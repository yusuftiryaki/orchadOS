-- "Latest" views for the report card and the map: one assessment per tree and
-- one measurement per tree and metric.
--
-- 1. The newest session wins. Session time is started_at, else planned_date
--    (UTC midnight), else created_at; a row without a session uses its own
--    assessed_at / measured_at. An old expert opinion never shadows the result
--    of a later visit.
-- 2. Within the same session the source decides:
--      assessment   expert > model > ai
--      measurement  expert > algorithm > staff > ai
--    ('algorithm' is the model rank; staff answers sit between it and ai).
-- 3. Then the newest row (assessed_at / measured_at, created_at), then id.
-- Sessions with the same time are kept apart by session_id, so rule 2 never
-- mixes two sessions.
--
-- security_invoker: the caller's row level security applies. Owners and
-- viewers do not see unpublished sessions' rows, so for them the newest
-- *published* session wins.

create view public.tree_latest_assessment
with (security_invoker = true)
as
select distinct on (a.tree_id)
  a.*,
  coalesce(s.started_at, s.planned_date::timestamp at time zone 'UTC', s.created_at, a.assessed_at) as session_time
from public.assessment a
left join public.session s on s.id = a.session_id
where a.tree_id is not null
order by
  a.tree_id,
  coalesce(s.started_at, s.planned_date::timestamp at time zone 'UTC', s.created_at, a.assessed_at) desc,
  a.session_id,
  case a.source when 'expert' then 0 when 'model' then 1 else 2 end,
  a.assessed_at desc,
  a.created_at desc,
  a.id;
comment on view public.tree_latest_assessment is
  'Assessment to show per tree: newest session first, then expert > model > ai within it, then newest.';

create view public.tree_latest_measurement
with (security_invoker = true)
as
select distinct on (m.tree_id, m.metric_definition_id)
  m.*,
  coalesce(s.started_at, s.planned_date::timestamp at time zone 'UTC', s.created_at, m.measured_at) as session_time
from public.measurement m
left join public.session s on s.id = m.session_id
where m.tree_id is not null
order by
  m.tree_id,
  m.metric_definition_id,
  coalesce(s.started_at, s.planned_date::timestamp at time zone 'UTC', s.created_at, m.measured_at) desc,
  m.session_id,
  case m.source when 'expert' then 0 when 'algorithm' then 1 when 'staff' then 2 else 3 end,
  m.measured_at desc,
  m.created_at desc,
  m.id;
comment on view public.tree_latest_measurement is
  'Measurement to show per tree and metric: newest session first, then expert > algorithm > staff > ai within it, then newest.';

revoke all on public.tree_latest_assessment, public.tree_latest_measurement from public, anon;
grant select on public.tree_latest_assessment, public.tree_latest_measurement to authenticated, service_role;
