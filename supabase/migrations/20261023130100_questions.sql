-- Owner portal v0.2: questions on a tree or a finding, answered by the expert.
--
-- A simple comment thread: question (the first message, tied to a tree, a
-- finding or both) and question_reply (every later message, from either
-- side).
--
-- Who:
--   owner, viewer   read the questions of their own parcels; ask and reply there
--   expert, ops     read every question of their org; reply
--   field_staff     nothing
-- No deletion for API users. Only the author may edit a message, only its
-- text, and only within 15 minutes of writing it (edited_at records it).
--
-- Personal data: the text is free text written by the owner. It is never sent
-- to an LLM and the AI worker does not read these tables
-- (docs/teknik-mimari.md, KVKK). Authors are stored as user ids and a role;
-- names stay in the private schema.
--
-- Notifications (new question, new answer) belong to the notification
-- service: every insert calls private.on_question_activity(), which only
-- sends pg_notify('question_activity', ...) with ids, no text. The
-- notification work can replace that function's body (e.g. with an outbox
-- insert) without touching the tables.

create type public.question_author_role as enum ('owner', 'viewer', 'expert', 'ops');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.question (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  tree_id uuid,
  finding_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_role public.question_author_role not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  foreign key (finding_id, parcel_id, org_id) references public.finding (id, parcel_id, org_id),
  unique (id, parcel_id, org_id),
  check (tree_id is not null or finding_id is not null)
);
comment on table public.question is
  'Owner''s question on a tree or a finding (first message of a thread). Free text by the owner: never sent to an LLM.';
create index question_parcel_id_idx on public.question (parcel_id, created_at);
create index question_org_id_idx on public.question (org_id, created_at);
create index question_tree_id_idx on public.question (tree_id);
create index question_finding_id_idx on public.question (finding_id);

create table public.question_reply (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  question_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_role public.question_author_role not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  foreign key (question_id, parcel_id, org_id) references public.question (id, parcel_id, org_id)
);
comment on table public.question_reply is
  'Later message of a question thread: the expert''s answer or a follow-up. Free text: never sent to an LLM.';
create index question_reply_question_id_idx on public.question_reply (question_id, created_at);
create index question_reply_org_id_idx on public.question_reply (org_id);
create index question_reply_parcel_id_idx on public.question_reply (parcel_id);

-- ---------------------------------------------------------------------------
-- Author, scope and edit rules
-- ---------------------------------------------------------------------------

-- API users: the author is the caller, the role comes from their access, the
-- org (and parcel, for replies) from the parent row. Trusted roles (tests,
-- migrations) write the columns as given. Trigger functions run as the
-- caller; the private schema is not usable by API users, so helpers stay inline.
create function private.prepare_question_message()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.question_author_role;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'question' then
    select p.org_id into new.org_id from public.parcel p where p.id = new.parcel_id;
    v_role := case
      when new.parcel_id in (select authz.user_parcel_ids('{owner}')) then 'owner'
      when new.parcel_id in (select authz.user_parcel_ids('{viewer}')) then 'viewer'
    end;
  else
    select q.org_id, q.parcel_id into new.org_id, new.parcel_id
    from public.question q where q.id = new.question_id;
    -- The org role answers; an owner who is also an expert answers as expert.
    if new.org_id in (select authz.user_org_ids('{expert}')) then
      v_role := 'expert';
    elsif new.org_id in (select authz.user_org_ids('{ops}')) then
      v_role := 'ops';
    else
      v_role := case
        when new.parcel_id in (select authz.user_parcel_ids('{owner}')) then 'owner'
        when new.parcel_id in (select authz.user_parcel_ids('{viewer}')) then 'viewer'
      end;
    end if;
  end if;

  if v_role is null then
    raise exception 'caller may not write to this % thread', tg_table_name using errcode = '42501';
  end if;
  new.author_role := v_role;
  new.created_by := v_uid;
  new.created_at := now();
  new.edited_at := null;
  return new;
end;
$$;

create trigger question_prepare
before insert on public.question
for each row execute function private.prepare_question_message();
create trigger question_reply_prepare
before insert on public.question_reply
for each row execute function private.prepare_question_message();

-- API users may change only the text (column grant), only their own message
-- (policy) and only within 15 minutes of writing it (here).
create function private.guard_question_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.created_by is distinct from (select auth.uid()) then
    raise exception 'only the author may edit a message' using errcode = '42501';
  end if;
  if now() > old.created_at + interval '15 minutes' then
    raise exception 'the edit window of this message has passed' using errcode = '55000',
      hint = 'Write a new message instead.';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger question_guard_edit
before update on public.question
for each row execute function private.guard_question_edit();
create trigger question_reply_guard_edit
before update on public.question_reply
for each row execute function private.guard_question_edit();

-- ---------------------------------------------------------------------------
-- Notification hook
-- ---------------------------------------------------------------------------

-- Placeholder for the notification service: ids only, never the text.
create function private.on_question_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  perform pg_notify(
    'question_activity',
    jsonb_build_object(
      'kind', case when tg_table_name = 'question' then 'question' else 'reply' end,
      'id', new.id,
      'question_id', coalesce(v_row ->> 'question_id', v_row ->> 'id'),
      'org_id', new.org_id,
      'parcel_id', new.parcel_id,
      'author_role', new.author_role
    )::text
  );
  return null;
end;
$$;

create trigger question_activity
after insert on public.question
for each row execute function private.on_question_activity();
create trigger question_reply_activity
after insert on public.question_reply
for each row execute function private.on_question_activity();

-- ---------------------------------------------------------------------------
-- Grants and row level security
-- ---------------------------------------------------------------------------

alter table public.question enable row level security;
alter table public.question_reply enable row level security;
revoke all on public.question, public.question_reply from anon, authenticated;
grant select, insert on public.question, public.question_reply to authenticated;
grant update (body) on public.question, public.question_reply to authenticated;
grant all on public.question, public.question_reply to service_role;

-- Owners and viewers: their parcels. Expert and ops: their org. Not field staff.
create policy question_select on public.question for select to authenticated
  using (
    parcel_id in (select authz.user_parcel_ids())
    or org_id in (select authz.user_org_ids('{expert,ops}'))
  );
-- Asked by an owner or viewer of the parcel, on a tree or finding they can see
-- (owners see only findings of published visits).
create policy question_insert on public.question for insert to authenticated
  with check (
    parcel_id in (select authz.user_parcel_ids())
    and created_by = (select auth.uid())
    and (finding_id is null or finding_id in (select f.id from public.finding f))
  );
create policy question_update on public.question for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy question_reply_select on public.question_reply for select to authenticated
  using (
    parcel_id in (select authz.user_parcel_ids())
    or org_id in (select authz.user_org_ids('{expert,ops}'))
  );
create policy question_reply_insert on public.question_reply for insert to authenticated
  with check (
    (parcel_id in (select authz.user_parcel_ids()) or org_id in (select authz.user_org_ids('{expert,ops}')))
    and created_by = (select auth.uid())
  );
create policy question_reply_update on public.question_reply for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
