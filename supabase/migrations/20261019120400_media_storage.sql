-- Private media bucket for captures and assets (docs/arayuzler.md, "Medya depolama").
--
-- Object name: org/<org_id>/parcel/<parcel_id>/<sha256>
--   sha256 is the lowercase hex content hash, the same value as
--   capture.content_hash / asset.content_hash. The row's uri is
--   'storage://media/' || that name.
--
-- Read:  org members read every object of their org. Parcel roles read an
--        object when they can read an asset or capture row with that org,
--        parcel and hash -- so the publication rule applies to files too.
-- Write: service_role (processing pipeline, bypasses RLS) and ops. Media is
--        immutable: ops may only add objects; there is no update or delete
--        policy for API users.

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Path segment -> uuid, null when it is not one (policies must not raise on odd names).
create function authz.uuid_or_null(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end;
$$;
revoke all on function authz.uuid_or_null(text) from public, anon;
grant execute on function authz.uuid_or_null(text) to authenticated, service_role;

-- Columns are qualified (objects.name): inside the subqueries a bare name would
-- resolve to parcel.name.
create policy media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (
      authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids())
      -- (org_id, content_hash) is unique on both tables, so these are index lookups.
      or exists (
        select 1 from public.asset a
        where a.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
          and a.content_hash = storage.filename(objects.name)
          and a.parcel_id = authz.uuid_or_null((storage.foldername(objects.name))[4])
      )
      or exists (
        select 1 from public.capture c
        where c.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
          and c.content_hash = storage.filename(objects.name)
          and c.parcel_id = authz.uuid_or_null((storage.foldername(objects.name))[4])
      )
    )
  );

create policy media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and objects.name ~ '^org/[0-9a-f-]{36}/parcel/[0-9a-f-]{36}/[0-9a-f]{64}$'
    and authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids('{ops}'))
    and exists (
      select 1 from public.parcel p
      where p.id = authz.uuid_or_null((storage.foldername(objects.name))[4])
        and p.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
    )
  );

comment on column public.capture.uri is
  'Where the file lives. In the media bucket: storage://media/org/<org_id>/parcel/<parcel_id>/<content_hash>; '
  'raw files kept on the processing station use a station:// uri.';
comment on column public.asset.uri is
  'Where the file lives. In the media bucket: storage://media/org/<org_id>/parcel/<parcel_id>/<content_hash>.';
