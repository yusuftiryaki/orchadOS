-- Results of a session reach owners and viewers only once the session is published.
--
-- Parcel roles (owner, viewer) read session-bound rows -- capture, asset,
-- measurement, assessment, finding and their join tables -- only when the
-- session's status is 'published'. Org roles (field_staff, expert, ops) read
-- everything of their org as before. Rows not bound to a session (parcel,
-- boundary, slot, tree, zone) and the session rows themselves are unchanged:
-- owners still see that a visit is planned or in review, just not its results.
--
-- Join tables carry no session_id; they are visible when the rows they link
-- are (subqueries on the linked tables run under those tables' own policies).

create function authz.user_published_session_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.session s
  join public.parcel_access pa on pa.parcel_id = s.parcel_id
  where pa.user_id = (select auth.uid())
    and s.status = 'published';
$$;
comment on function authz.user_published_session_ids() is
  'Published sessions on parcels the caller has a parcel role on.';
revoke all on function authz.user_published_session_ids() from public, anon;
grant execute on function authz.user_published_session_ids() to authenticated, service_role;

-- Session-bound tables ---------------------------------------------------------

drop policy capture_select on public.capture;
create policy capture_select on public.capture for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

drop policy asset_select on public.asset;
create policy asset_select on public.asset for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

drop policy measurement_select on public.measurement;
create policy measurement_select on public.measurement for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

drop policy assessment_select on public.assessment;
create policy assessment_select on public.assessment for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

drop policy finding_select on public.finding;
create policy finding_select on public.finding for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

-- Join tables -------------------------------------------------------------------

drop policy asset_source_select on public.asset_source;
create policy asset_source_select on public.asset_source for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (
      asset_id in (select a.id from public.asset a)
      and (
        source_capture_id in (select c.id from public.capture c)
        or source_asset_id in (select a.id from public.asset a)
      )
    )
  );

drop policy measurement_evidence_select on public.measurement_evidence;
create policy measurement_evidence_select on public.measurement_evidence for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (
      measurement_id in (select m.id from public.measurement m)
      and asset_id in (select a.id from public.asset a)
    )
  );

drop policy assessment_measurement_select on public.assessment_measurement;
create policy assessment_measurement_select on public.assessment_measurement for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (
      assessment_id in (select a.id from public.assessment a)
      and measurement_id in (select m.id from public.measurement m)
    )
  );

drop policy finding_evidence_select on public.finding_evidence;
create policy finding_evidence_select on public.finding_evidence for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (
      finding_id in (select f.id from public.finding f)
      and asset_id in (select a.id from public.asset a)
    )
  );
