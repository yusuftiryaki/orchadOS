-- Legal follow-up T23 (wave 2): who sees questions, and no staff track for owners.
--
-- 1. Questions (H22, H32; sözleşme Md. 9/4): an owner or viewer reads only the
--    threads they started (question.created_by) and the replies in them. Each
--    owner and each co-owner of a parcel therefore has their own threads; a
--    co-owner never reads another owner's questions and the remaining owner
--    never reads those of an owner who left. Expert and ops of the org read
--    every thread. Demo tour threads (written under fictional personas) stay
--    readable to the demo org's visitors. Replies follow their question, also
--    for writing: an owner or viewer answers only in their own threads.
--    Question activity sends no notification today (on_question_activity only
--    emits ids on pg_notify); any future notification must follow this rule.
--
-- 2. Staff GNSS (H05: "Sahiplere personel izi gösterilmez. Sahipler yalnızca
--    sınırı ve ağaç konumlarını görür."):
--    - Parcel readers (owner, viewer, demo visitor: not org members) read only
--      the media an owner needs: asset kinds panorama, tree_crop and photo,
--      and close-up photos (capture kind photo with a tree). Raw GNSS logs,
--      MCAP, 360° video, audio notes, trajectories and point clouds are staff
--      only. The media bucket policy looks these rows up under the caller's
--      row level security, so their files cannot be signed either.
--    - session_event (corners, boundary pointer, field notes, route progress)
--      is readable by staff only (field_staff, expert, ops). It already was;
--      the policy now names the roles so a new role cannot widen it silently.
--    - parcel_route, trunk_label, verification_item and followup_request are
--      already org-only. boundary holds the approved polygon only.
--    Panorama viewpoints stay readable as discrete points: the portal shows
--    no line between them and no capture time (docs/veri-modeli.md, T23).

-- ---------------------------------------------------------------------------
-- 1. Questions
-- ---------------------------------------------------------------------------

drop policy question_select on public.question;
create policy question_select on public.question for select to authenticated
  using (
    org_id in (select authz.user_org_ids('{expert,ops}'))
    or (
      parcel_id in (select authz.user_parcel_ids())
      and (created_by = (select auth.uid()) or authz.is_demo_org(org_id))
    )
  );

drop policy question_reply_select on public.question_reply;
create policy question_reply_select on public.question_reply for select to authenticated
  using (
    org_id in (select authz.user_org_ids('{expert,ops}'))
    or (
      parcel_id in (select authz.user_parcel_ids())
      and question_id in (
        select q.id from public.question q
        where q.created_by = (select auth.uid()) or authz.is_demo_org(q.org_id)
      )
    )
  );

drop policy question_reply_insert on public.question_reply;
create policy question_reply_insert on public.question_reply for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      org_id in (select authz.user_org_ids('{expert,ops}'))
      or (
        parcel_id in (select authz.user_parcel_ids())
        and question_id in (select q.id from public.question q where q.created_by = (select auth.uid()))
      )
    )
  );

comment on policy question_select on public.question is
  'T23 (H22, H32): owners and viewers read their own threads (demo org: all); expert and ops their org.';
comment on policy question_reply_select on public.question_reply is
  'T23: replies follow their question (own threads for owners and viewers).';

-- ---------------------------------------------------------------------------
-- 2. Staff GNSS
-- ---------------------------------------------------------------------------

-- Restrictive: org members keep every row; everyone else (parcel roles) only
-- the kinds the portal shows.
create policy asset_parcel_reader_kinds on public.asset as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or kind in ('panorama', 'tree_crop', 'photo')
  );
comment on policy asset_parcel_reader_kinds on public.asset is
  'T23 (H05): parcel readers see panoramas, crops and photos only; trajectories and point clouds are staff only.';

create policy capture_parcel_reader_kinds on public.capture as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (kind = 'photo' and tree_id is not null)
  );
comment on policy capture_parcel_reader_kinds on public.capture is
  'T23 (H05): parcel readers see close-up photos of trees only; GNSS logs, MCAP, video and field photos are staff only.';

drop policy session_event_select on public.session_event;
create policy session_event_select on public.session_event for select to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
comment on policy session_event_select on public.session_event is
  'T23 (H05, H07): staff only. Owners and viewers never read corners, the boundary pointer or field notes.';
