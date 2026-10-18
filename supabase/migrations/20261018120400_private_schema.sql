-- IP1 / 5: personal data in the private schema (KVKK).
-- Not exposed via PostgREST ([api].schemas) and no grants to anon / authenticated.
-- The backend reads it with service_role. The only path for an end user is
-- public.my_owner_profile(), which returns the caller's own row.
-- Never send these columns to an LLM (CLAUDE.md, "Kişisel veri").

create type private.contact_preference as enum ('whatsapp', 'sms', 'phone_call');
create type private.authorization_basis as enum ('title_holder', 'power_of_attorney', 'heir_declaration');

create table private.owner_profile (
  id uuid primary key default gen_random_uuid(),
  -- Org that registered the owner (data controller for this record).
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  -- E.164, e.g. +905321234567. Also the login phone.
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text,
  contact_preference private.contact_preference not null default 'whatsapp',
  kvkk_consent boolean not null default false,
  kvkk_consent_at timestamptz,
  kvkk_text_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id),
  check (kvkk_consent = (kvkk_consent_at is not null)),
  check (not kvkk_consent or kvkk_text_version is not null)
);
comment on table private.owner_profile is 'Owner identity and KVKK consent. Personal data: never exposed via the API, never sent to an LLM.';
create index owner_profile_user_id_idx on private.owner_profile (user_id);

create table private.parcel_detail (
  parcel_id uuid primary key,
  org_id uuid not null,
  -- Deed reference, for records only (ada / parsel, shared deed, used portion).
  deed_block text,
  deed_parcel text,
  is_shared_deed boolean,
  used_portion_note text,
  authorization_basis private.authorization_basis,
  entry_permission_at timestamptz,
  -- Free text that may contain third-party names and phone numbers (guard, neighbour).
  access_note text,
  site_contact_name text,
  site_contact_phone text check (site_contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade
);
comment on table private.parcel_detail is 'Parcel data that is personal or third-party: deed reference, access note, site contact.';

-- Defence in depth: RLS on with no policies, so only RLS-bypassing roles see rows.
alter table private.owner_profile enable row level security;
alter table private.parcel_detail enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;

-- The only end-user path into private data: the caller's own profile.
create function public.my_owner_profile()
returns table (
  org_id uuid,
  full_name text,
  phone text,
  email text,
  contact_preference text,
  kvkk_consent boolean,
  kvkk_consent_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id, p.full_name, p.phone, p.email, p.contact_preference::text, p.kvkk_consent, p.kvkk_consent_at
  from private.owner_profile p
  where p.user_id = (select auth.uid());
$$;
comment on function public.my_owner_profile() is 'Returns the calling user''s own owner profile (KVKK: data subject access).';
revoke all on function public.my_owner_profile() from public, anon;
grant execute on function public.my_owner_profile() to authenticated;
