-- "Latest" views for the report card and the map: one assessment per tree and
-- one measurement per tree and metric.
--
-- Priority: expert > model > ai (assessment). For measurements, 'algorithm' is
-- the model rank and staff answers sit between algorithm and ai:
--   expert > algorithm > staff > ai.
-- Within the same source the newest wins (assessed_at / measured_at, then
-- created_at, then id for a stable tie-break).
--
-- security_invoker: the caller's row level security applies, so owners only
-- see results of published sessions here too.

create view public.tree_latest_assessment
with (security_invoker = true)
as
select distinct on (a.tree_id) a.*
from public.assessment a
where a.tree_id is not null
order by
  a.tree_id,
  case a.source when 'expert' then 0 when 'model' then 1 else 2 end,
  a.assessed_at desc,
  a.created_at desc,
  a.id;
comment on view public.tree_latest_assessment is
  'Assessment to show per tree: expert > model > ai, newest within the same source.';

create view public.tree_latest_measurement
with (security_invoker = true)
as
select distinct on (m.tree_id, m.metric_definition_id) m.*
from public.measurement m
where m.tree_id is not null
order by
  m.tree_id,
  m.metric_definition_id,
  case m.source when 'expert' then 0 when 'algorithm' then 1 when 'staff' then 2 else 3 end,
  m.measured_at desc,
  m.created_at desc,
  m.id;
comment on view public.tree_latest_measurement is
  'Measurement to show per tree and metric: expert > algorithm > staff > ai, newest within the same source.';

revoke all on public.tree_latest_assessment, public.tree_latest_measurement from public, anon;
grant select on public.tree_latest_assessment, public.tree_latest_measurement to authenticated, service_role;
