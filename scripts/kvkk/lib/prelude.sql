-- Shared prelude of scripts/kvkk/*.sql. run.sh has opened the transaction
-- and passed the psql variables command, subject, person_name, parcel,
-- request, include_notes, apply, force_active, reason and pseudonym_key
-- (the last one on stdin, never on a command line).
--
-- Builds temporary tables (dropped at commit or rollback) that describe the
-- data subject; the command scripts only read these:
--   kvkk_param     one row: the request and the subject's pseudonym
--   kvkk_parcel    parcels in scope, with subject_owner = the subject is or
--                  was the parcel's owner, and other_party = someone else
--                  still holds access or a running contract on the parcel
--   kvkk_org       orgs in scope (audit rows go to each of them)
--   kvkk_pattern   case-insensitive regexes for the subject's names, phones
--                  and e-mails, anchored on word (names, e-mails) or digit
--                  (phones) boundaries; used in free text only
--   kvkk_name      the subject's normalised names (exact matches)
--   kvkk_review_name  single-word names: never matched, review only
--   kvkk_audit_scope  audit_event rows tied to the subject (the only rows
--                  pseudonymize may rewrite)
--   kvkk_result    what each block did: table, action, row count
--
-- Matching rules (wrong-subject protection): a name is matched only as a
-- whole multi-word name (at least two words), never inside a longer word,
-- a uuid or a JSON key; a single-word name is never matched automatically.
--
-- Demo orgs (private.demo_org, docs/demo-turu.md) are never in scope.

create temporary table kvkk_param on commit drop as
select
  :'command'::text as command,
  nullif(:'subject', '')::uuid as subject_id,
  nullif(regexp_replace(btrim(:'person_name'), '\s+', ' ', 'g'), '') as person_name,
  nullif(:'parcel', '')::uuid as parcel_id,
  :'request'::text as request,
  :'include_notes' = 'on' as include_notes,
  :'apply' = 'on' as apply,
  :'force_active' = 'on' as force_active,
  nullif(:'reason', '') as reason,
  null::text as pseudonym;

-- Secret key of the pseudonym HMAC (finding: an unsalted hash of a name and
-- a parcel id is reversed with a name list). Kept outside the database.
create temporary table kvkk_secret on commit drop as
select :'pseudonym_key'::text as key;

-- Normalised form used for exact name comparison: spacing collapsed, Turkish
-- case folding (I -> ı, İ -> i) before lower().
create function pg_temp.kvkk_norm(p text) returns text
language sql immutable as $$
  select nullif(lower(translate(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), 'Iİ', 'ıi')), '')
$$;

-- Number of words of a name (a single word is never matched automatically).
create function pg_temp.kvkk_words(p text) returns integer
language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(btrim(coalesce(p, '')), '\s+'), 1), 0)
    - case when btrim(coalesce(p, '')) = '' then 1 else 0 end
$$;

-- 'kvkk-' + the first 8 hex digits of HMAC-SHA256(input, key).
create function pg_temp.kvkk_pseudonym(p_input text) returns text
language sql stable as $$
  select 'kvkk-' || left(encode(extensions.hmac(
    convert_to(p_input, 'UTF8'), convert_to((select key from kvkk_secret), 'UTF8'), 'sha256'), 'hex'), 8)
$$;

-- Payload text as jsonb, or null when it is not a JSON object.
create function pg_temp.kvkk_json(p text) returns jsonb
language plpgsql immutable as $$
begin
  if p is null or btrim(p) not like '{%' then
    return null;
  end if;
  return p::jsonb;
exception when others then
  return null;
end;
$$;

create temporary table kvkk_result (
  seq serial,
  tbl text not null,
  action text not null,
  rows integer not null
) on commit drop;

create function pg_temp.kvkk_count(p_tbl text, p_action text, p_rows integer) returns void
language sql as $$
  insert into kvkk_result (tbl, action, rows) values (p_tbl, p_action, coalesce(p_rows, 0));
$$;

do $$
declare
  p kvkk_param;
  v_demo uuid[];
begin
  select * into p from kvkk_param;
  select coalesce(array_agg(org_id), '{}') into v_demo from private.demo_org;

  if length(coalesce((select key from kvkk_secret), '')) < 32 then
    raise exception 'kvkk_no_key: KVKK_PSEUDONYM_KEY (at least 32 characters) is required';
  end if;

  if p.subject_id is not null then
    if not exists (select 1 from auth.users where id = p.subject_id) then
      -- An already deleted account can still have rows (consent_record.subject_id).
      raise notice 'kvkk: no auth user with this id; continuing with the rows that still carry it';
    end if;
    if exists (select 1 from auth.users where id = p.subject_id
               and coalesce(raw_app_meta_data ->> 'demo', '') = 'true') then
      raise exception 'kvkk_demo_subject: this is a demo account; demo data is synthetic and out of scope';
    end if;
    update kvkk_param set pseudonym = pg_temp.kvkk_pseudonym(p.subject_id::text);
  else
    if not exists (select 1 from public.parcel where id = p.parcel_id) then
      raise exception 'kvkk_parcel_not_found: no parcel with this id';
    end if;
    if exists (select 1 from public.parcel where id = p.parcel_id and org_id = any(v_demo)) then
      raise exception 'kvkk_demo_parcel: this parcel belongs to a demo org; demo data is synthetic and out of scope';
    end if;
    if pg_temp.kvkk_words(p.person_name) < 2
       or exists (select 1 from regexp_split_to_table(p.person_name, '\s+') w where length(w) < 2) then
      raise exception 'kvkk_single_word_name: --person-name needs the full name (at least two words of two letters); a single word matches other people';
    end if;
    -- The name must not be the name of an account holder of the parcel (an
    -- owner, a co-owner, a customer with an order or application for it):
    -- the person-name path would then erase that account's records.
    if exists (
      with holder as (
        select a.user_id from public.parcel_access a where a.parcel_id = p.parcel_id
        union select i.customer_user_id from public.service_order_item i where i.parcel_id = p.parcel_id
        union select g.customer_user_id from public.application_garden g where g.parcel_id = p.parcel_id
        union select v.user_id from private.viewer_invitation v where v.parcel_id = p.parcel_id
      )
      select 1 from (
        select o.full_name as n from private.owner_profile o where o.user_id in (select user_id from holder)
        union all select s.full_name from private.customer_signup s where s.user_id in (select user_id from holder)
        union all select b.first_name || ' ' || b.last_name from private.billing_profile b
          where b.user_id in (select user_id from holder)
        union all select v.full_name from private.viewer_invitation v
          where v.parcel_id = p.parcel_id and v.user_id is not null
      ) x
      where pg_temp.kvkk_norm(x.n) = pg_temp.kvkk_norm(p.person_name)
    ) then
      raise exception 'kvkk_ambiguous_person: an account holder of this parcel has this name; use --subject <user uuid> for an account, or settle by hand who the person is';
    end if;
    update kvkk_param
    set pseudonym = pg_temp.kvkk_pseudonym(pg_temp.kvkk_norm(p.person_name) || p.parcel_id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parcels in scope
-- ---------------------------------------------------------------------------
create temporary table kvkk_parcel (
  parcel_id uuid primary key,
  org_id uuid not null,
  subject_owner boolean not null default false,
  other_party boolean not null default false
) on commit drop;

insert into kvkk_parcel (parcel_id, org_id)
select distinct x.parcel_id, pa.org_id
from (
  -- Access (owner or viewer) of the subject.
  select a.parcel_id from public.parcel_access a, kvkk_param p where a.user_id = p.subject_id
  union
  -- Gardens of the subject's orders.
  select i.parcel_id from public.service_order_item i, kvkk_param p
  where i.customer_user_id = p.subject_id and i.parcel_id is not null
  union
  -- Gardens of the subject's applications that became parcels.
  select g.parcel_id from public.application_garden g, kvkk_param p
  where g.customer_user_id = p.subject_id and g.parcel_id is not null
  union
  -- Invitations for the subject.
  select v.parcel_id from private.viewer_invitation v, kvkk_param p where v.user_id = p.subject_id
  union
  -- --person-name: the given parcel.
  select p.parcel_id from kvkk_param p where p.parcel_id is not null
) x
join public.parcel pa on pa.id = x.parcel_id
where pa.org_id not in (select org_id from private.demo_org);

-- The subject is or was the parcel's owner: owner access, an order item or
-- an application garden of the subject. Only then may erase clear the
-- parcel's contact data wholesale; a viewer or an invitee never does (the
-- owner's retained parcel data is not theirs).
update kvkk_parcel k
set subject_owner = exists (
    select 1 from public.parcel_access a, kvkk_param p
    where a.parcel_id = k.parcel_id and a.user_id = p.subject_id and a.role = 'owner'
  ) or exists (
    select 1 from public.service_order_item i, kvkk_param p
    where i.parcel_id = k.parcel_id and i.customer_user_id = p.subject_id
  ) or exists (
    select 1 from public.application_garden g, kvkk_param p
    where g.parcel_id = k.parcel_id and g.customer_user_id = p.subject_id
  );

-- Someone other than the subject keeps access, or another customer's order
-- for the garden is running (H26 item 5). For --person-name everybody with
-- access is "another party": the person has no account.
update kvkk_parcel k
set other_party = exists (
    select 1 from public.parcel_access a, kvkk_param p
    where a.parcel_id = k.parcel_id and a.user_id is distinct from p.subject_id
  ) or exists (
    select 1
    from public.service_order_item i
    join public.service_order o on o.id = i.order_id
    cross join kvkk_param p
    where i.parcel_id = k.parcel_id
      and o.customer_user_id is distinct from p.subject_id
      and o.status in ('awaiting_payment', 'active')
      and i.removed_on is null
  );

-- ---------------------------------------------------------------------------
-- Orgs in scope
-- ---------------------------------------------------------------------------
create temporary table kvkk_org (org_id uuid primary key) on commit drop;

insert into kvkk_org (org_id)
select org_id from kvkk_parcel
union select o.org_id from private.owner_profile o, kvkk_param p where o.user_id = p.subject_id
union select s.org_id from private.customer_signup s, kvkk_param p where s.user_id = p.subject_id
union select a.org_id from public.service_application a, kvkk_param p where a.customer_user_id = p.subject_id
union select o.org_id from public.service_order o, kvkk_param p where o.customer_user_id = p.subject_id
union select c.org_id from private.consent_record c, kvkk_param p where c.subject_id = p.subject_id
union select v.org_id from private.viewer_invitation v, kvkk_param p where v.invited_by = p.subject_id;

delete from kvkk_org where org_id in (select org_id from private.demo_org);

-- ---------------------------------------------------------------------------
-- The subject's names, phones and e-mails
-- ---------------------------------------------------------------------------
create temporary table kvkk_name (name text primary key) on commit drop;
create temporary table kvkk_pattern (re text primary key) on commit drop;

create temporary table kvkk_ident (kind text not null, value text) on commit drop;

insert into kvkk_ident (kind, value)
-- --subject
select 'name', o.full_name from private.owner_profile o, kvkk_param p where o.user_id = p.subject_id
union select 'phone', o.phone from private.owner_profile o, kvkk_param p where o.user_id = p.subject_id
union select 'email', o.email from private.owner_profile o, kvkk_param p where o.user_id = p.subject_id
union select 'name', s.full_name from private.customer_signup s, kvkk_param p where s.user_id = p.subject_id
union select 'phone', s.phone from private.customer_signup s, kvkk_param p where s.user_id = p.subject_id
union select 'email', s.email from private.customer_signup s, kvkk_param p where s.user_id = p.subject_id
union select 'name', b.first_name || ' ' || b.last_name from private.billing_profile b, kvkk_param p where b.user_id = p.subject_id
union select 'email', b.email from private.billing_profile b, kvkk_param p where b.user_id = p.subject_id
union select 'name', v.full_name from private.viewer_invitation v, kvkk_param p where v.user_id = p.subject_id
union select 'phone', v.phone from private.viewer_invitation v, kvkk_param p where v.user_id = p.subject_id
union select 'phone', '+' || ltrim(u.phone, '+') from auth.users u, kvkk_param p where u.id = p.subject_id
union select 'email', u.email from auth.users u, kvkk_param p where u.id = p.subject_id
-- --person-name
union select 'name', p.person_name from kvkk_param p where p.person_name is not null
union select 'phone', d.site_contact_phone
  from private.parcel_detail d, kvkk_param p
  where p.person_name is not null and d.parcel_id = p.parcel_id
    and pg_temp.kvkk_norm(d.site_contact_name) = pg_temp.kvkk_norm(p.person_name);

delete from kvkk_ident
where value is null or btrim(value) = '' or value like 'kvkk-%'
   or (kind = 'phone' and value !~ '^\+?[0-9]{7,15}$')
   -- Demo visitors' undeliverable addresses (docs/demo-turu.md §12).
   or (kind = 'email' and value ~* '\.invalid$');

-- Single-word (or one-letter-word) names would match other people ("Ece"
-- in "gece", "Ali" in "Halil"): review only, never matched.
create temporary table kvkk_review_name on commit drop as
select distinct pg_temp.kvkk_norm(value) as name from kvkk_ident
where kind = 'name'
  and (pg_temp.kvkk_words(value) < 2
       or exists (select 1 from regexp_split_to_table(btrim(value), '\s+') w where length(w) < 2));
delete from kvkk_ident where kind = 'name' and pg_temp.kvkk_norm(value) in (select name from kvkk_review_name);

insert into kvkk_name (name)
select distinct pg_temp.kvkk_norm(value) from kvkk_ident where kind = 'name';

-- Names: the whole name, words in order with any whitespace between them,
-- not preceded or followed by a letter or digit (so "Ali Can" never matches
-- "Ali Cantürk"); I, ı, İ and i are interchangeable. Phones: the last ten
-- digits of a Turkish number with an optional +90 / 0 prefix and optional
-- separators, other numbers literally; never inside a longer digit run or a
-- uuid segment. E-mails literally, as a whole address.
insert into kvkk_pattern (re)
select distinct re from (
  select
    '(?<![[:alnum:]_çğıöşüâîûÇĞİÖŞÜÂÎÛ])(?:' || array_to_string(array(
      select regexp_replace(
        regexp_replace(w, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g'),
        '[iıIİ]', '[iıIİ]', 'g')
      from regexp_split_to_table(btrim(value), '\s+') w
    ), '\s+') || ')(?![[:alnum:]_çğıöşüâîûÇĞİÖŞÜÂÎÛ])' as re
  from kvkk_ident where kind = 'name'
  union all
  select
    '(?<![[:alnum:]_]|[[:xdigit:]]-)'
    || case
      when ltrim(value, '+') ~ '^90[0-9]{10}$' then
        '(?:(?:\+?90|0)[\s.()-]*)?' || array_to_string(
          regexp_split_to_array(right(value, 10), ''), '[\s.()-]?')
      else regexp_replace(value, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
    end
    || '(?![[:alnum:]_]|-[[:xdigit:]])'
  from kvkk_ident where kind = 'phone'
  union all
  select '(?<![[:alnum:]_.%+-])'
    || regexp_replace(value, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
    || '(?![[:alnum:]_-]|\.[[:alnum:]])'
  from kvkk_ident where kind = 'email'
) s
where re is not null;

-- Replaces every match of the subject's patterns in a text.
create function pg_temp.kvkk_mask(p text, p_repl text) returns text
language plpgsql stable as $$
declare
  v text := p;
  r record;
begin
  if v is null then
    return null;
  end if;
  for r in select re from kvkk_pattern order by length(re) desc loop
    v := regexp_replace(v, r.re, p_repl, 'gi');
  end loop;
  return v;
end;
$$;

create function pg_temp.kvkk_has_match(p text) returns boolean
language sql stable as $$
  select p is not null and exists (select 1 from kvkk_pattern where p ~* re)
$$;

-- JSON: only string values change; keys, numbers and uuid strings never do.
create function pg_temp.kvkk_mask_jsonb(j jsonb, p_repl text) returns jsonb
language plpgsql stable as $$
begin
  case jsonb_typeof(j)
    when 'object' then
      return (select coalesce(jsonb_object_agg(e.key, pg_temp.kvkk_mask_jsonb(e.value, p_repl)), '{}'::jsonb)
              from jsonb_each(j) e);
    when 'array' then
      return (select coalesce(jsonb_agg(pg_temp.kvkk_mask_jsonb(e.value, p_repl) order by e.ord), '[]'::jsonb)
              from jsonb_array_elements(j) with ordinality e(value, ord));
    when 'string' then
      if (j #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return j;
      end if;
      return to_jsonb(pg_temp.kvkk_mask(j #>> '{}', p_repl));
    else
      return j;
  end case;
end;
$$;

-- A session_event payload (JSON text, or plain text from older clients).
create function pg_temp.kvkk_mask_payload(p text, p_repl text) returns text
language sql stable as $$
  select case when pg_temp.kvkk_json(p) is not null
              then pg_temp.kvkk_mask_jsonb(pg_temp.kvkk_json(p), p_repl)::text
              else pg_temp.kvkk_mask(p, p_repl) end
$$;

create function pg_temp.kvkk_payload_has_match(p text) returns boolean
language sql stable as $$
  select case when pg_temp.kvkk_json(p) is not null
              then pg_temp.kvkk_mask_jsonb(pg_temp.kvkk_json(p), '') is distinct from pg_temp.kvkk_json(p)
              else pg_temp.kvkk_has_match(p) end
$$;

-- ---------------------------------------------------------------------------
-- Audit rows tied to the subject
-- ---------------------------------------------------------------------------
-- public.audit_event is org-wide; pseudonymize rewrites only these rows
-- (actor or entity is the subject or one of the subject's records; for
-- --person-name, rows about the given parcel). Matches elsewhere in the org
-- are namesakes until a person checks them: inventory lists their ids.
create temporary table kvkk_audit_scope (id uuid primary key) on commit drop;

insert into kvkk_audit_scope (id)
select a.id
from public.audit_event a
cross join kvkk_param p
where a.org_id in (select org_id from kvkk_org)
  and a.action not like 'kvkk.%'
  and (
    (p.subject_id is not null and (
      a.actor_user_id = p.subject_id
      or a.entity_id = p.subject_id
      or a.entity_id in (
        select o.id from private.owner_profile o where o.user_id = p.subject_id
        union select x.id from public.service_application x where x.customer_user_id = p.subject_id
        union select g.id from public.application_garden g where g.customer_user_id = p.subject_id
        union select q.id from public.quote q where q.customer_user_id = p.subject_id
        union select o.id from public.service_order o where o.customer_user_id = p.subject_id
        union select x.id from public.payment x where x.customer_user_id = p.subject_id
        union select r.id from public.refund r where r.customer_user_id = p.subject_id
        union select r.id from public.garden_removal r where r.customer_user_id = p.subject_id)
      or (a.details ->> 'parcel_id') in (select parcel_id::text from kvkk_parcel where subject_owner)))
    or (p.person_name is not null and (
      (a.details ->> 'parcel_id') = p.parcel_id::text
      or a.entity_id in (
        select g.id from public.application_garden g where g.parcel_id = p.parcel_id
        union select r.id from public.garden_removal r where r.parcel_id = p.parcel_id)))
  );

-- ---------------------------------------------------------------------------
-- Running contract (H26 item 3)
-- ---------------------------------------------------------------------------
-- An order of the subject that awaits payment or runs, or owner access to a
-- garden that is not passive and is not covered by a running order of the
-- subject (an owner registered by ops on a paper contract, also after a
-- cancelled, expired or ended online order for the same garden).
create function pg_temp.kvkk_active_contracts() returns integer
language sql stable as $$
  select (
    select count(*)::integer from public.service_order o, kvkk_param p
    where o.customer_user_id = p.subject_id
      and o.status in ('awaiting_payment', 'active')
      and o.org_id not in (select org_id from private.demo_org)
  ) + (
    select count(*)::integer
    from public.parcel_access a
    join public.parcel pa on pa.id = a.parcel_id
    cross join kvkk_param p
    where a.user_id = p.subject_id and a.role = 'owner' and pa.status <> 'passive'
      and pa.org_id not in (select org_id from private.demo_org)
      and not exists (
        select 1 from public.service_order_item i
        join public.service_order o on o.id = i.order_id
        where i.parcel_id = a.parcel_id and o.customer_user_id = p.subject_id
          and o.status in ('awaiting_payment', 'active') and i.removed_on is null
      )
  )
$$;

-- erase and pseudonymize stop here while a contract runs, unless forced.
create function pg_temp.kvkk_require_no_active_contract() returns void
language plpgsql as $$
declare
  p kvkk_param;
  n integer;
begin
  select * into p from kvkk_param;
  if p.subject_id is null then
    return;
  end if;
  n := pg_temp.kvkk_active_contracts();
  if n > 0 and not p.force_active then
    raise exception 'kvkk_active_contract: the subject has % running contract(s) or owner garden(s); H26 item 3: service data is not deleted while the contract runs (deletion follows termination). Override only with --force-active --reason.', n;
  end if;
  if n > 0 then
    raise notice 'kvkk: % running contract(s); continuing because of --force-active', n;
  end if;
end;
$$;

-- One audit row per org in scope (public.audit_event is per org). No
-- personal data: the request number, the pseudonym and the counts.
create function pg_temp.kvkk_audit(p_action text) returns void
language plpgsql as $$
declare
  p kvkk_param;
  v_counts jsonb;
  v_entity uuid;
  v_org uuid;
  n integer := 0;
begin
  select * into p from kvkk_param;
  select coalesce(jsonb_object_agg(tbl || ':' || action, rows), '{}') into v_counts from kvkk_result;
  for v_org in select org_id from kvkk_org order by org_id loop
    select o.id into v_entity from private.owner_profile o
    where o.org_id = v_org and o.user_id = p.subject_id;
    perform private.audit(
      v_org, null, 'system', p_action, 'owner_profile', v_entity,
      jsonb_strip_nulls(jsonb_build_object(
        'request', p.request,
        'subject_kind', case when p.subject_id is not null then 'user' else 'person' end,
        'subject_ref', p.pseudonym,
        'parcel_id', p.parcel_id,
        'include_notes', p.include_notes,
        'force_active', nullif(p.force_active, false),
        'force_reason', p.reason,
        'counts', v_counts
      ))
    );
    n := n + 1;
  end loop;
  perform pg_temp.kvkk_count('public.audit_event', 'insert (' || p_action || ')', n);
  if n = 0 then
    raise notice 'kvkk: no org in scope, so no audit row; write this in the başvuru defteri';
  end if;
end;
$$;

-- Summary printed by every command.
create function pg_temp.kvkk_header() returns table (key text, value text)
language sql stable as $$
  select 'command', command from kvkk_param
  union all select 'request', request from kvkk_param
  union all select 'subject', case when subject_id is not null then 'user ' || subject_id::text
                                   else 'person on parcel ' || parcel_id::text end from kvkk_param
  union all select 'pseudonym', pseudonym from kvkk_param
  union all select 'mode', case when apply then 'APPLY (commit)' else 'dry run (rollback)' end from kvkk_param
  union all select 'orgs in scope', count(*)::text from kvkk_org
  union all select 'parcels in scope', count(*)::text from kvkk_parcel
  union all select 'parcels owned by the subject', count(*) filter (where subject_owner)::text from kvkk_parcel
  union all select 'parcels with another party', count(*) filter (where other_party)::text from kvkk_parcel
  union all select 'names/phones/e-mails found', count(*)::text from kvkk_ident
  union all select 'single-word names (review only)', count(*)::text from kvkk_review_name
  union all select 'audit rows tied to the subject', count(*)::text from kvkk_audit_scope
  union all select 'running contracts', pg_temp.kvkk_active_contracts()::text
$$;

select * from pg_temp.kvkk_header();
