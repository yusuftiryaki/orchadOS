-- erase: deletes or clears the subject's personal data that has no
-- retention basis (H26 items 3 to 6). Never touches billing, payment,
-- refund, receipt or consent rows (H26 item 1); append-only rows are
-- pseudonymize.sql's job (item 2) and run before this script.
--
-- One block per table. A later stream adds a table by adding one block that
-- ends with pg_temp.kvkk_count(...), one inventory.sql block and one README
-- row. Scope every statement to the subject (kvkk_param, kvkk_parcel,
-- kvkk_org); never to a demo org.

-- Block results go to kvkk_result; keep stdout to the summary.
\o /dev/null

select pg_temp.kvkk_require_no_active_contract();

-- pseudonymize first: erase removes the names it needs to find.
do $$
declare
  p kvkk_param;
begin
  select * into p from kvkk_param;
  if p.apply and exists (select 1 from kvkk_org) and not exists (
    select 1 from public.audit_event a
    where a.action = 'kvkk.pseudonymized'
      and a.details ->> 'request' = p.request
      and a.details ->> 'subject_ref' = p.pseudonym
  ) then
    raise exception 'kvkk_pseudonymize_first: run "pseudonymize --apply" for request % before "erase --apply"', p.request;
  end if;
end;
$$;

-- ===== private.owner_profile (H26 items 4, 5) ==============================
-- The row stays (it carries the aydınlatma teyidi, kept 10 years); the name
-- becomes the pseudonym, phone and e-mail are cleared.
with changed as (
  update private.owner_profile o
  set full_name = p.pseudonym, phone = null, email = null, updated_at = now()
  from kvkk_param p
  where o.user_id = p.subject_id
    and o.org_id in (select org_id from kvkk_org)
    and (o.full_name <> p.pseudonym or o.phone is not null or o.email is not null)
  returning 1
)
select pg_temp.kvkk_count('private.owner_profile', 'clear name, phone, email', count(*)::integer) from changed;

-- ===== private.customer_signup (H26 items 4, 6) ============================
-- Pending and completed sign-ups. The consents of a completed sign-up are in
-- private.consent_record (kept).
with gone as (
  delete from private.customer_signup s
  using kvkk_param p
  where s.user_id = p.subject_id and s.org_id in (select org_id from kvkk_org)
  returning 1
)
select pg_temp.kvkk_count('private.customer_signup', 'delete', count(*)::integer) from gone;

-- ===== private.parcel_detail (H26 items 4, 5) ==============================
-- No other party on the parcel: site contact and access note cleared (for a
-- --subject; for a --person-name only when the contact is that person).
-- Another party continues: only the subject's own contact entry, and the
-- subject's name and phone inside the access note. Deed and authorisation
-- fields stay (H09 proof).
with changed as (
  update private.parcel_detail d
  set site_contact_name = case
        when (p.subject_id is not null and not k.other_party)
          or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
          or pg_temp.kvkk_has_match(d.site_contact_phone)
        then null else d.site_contact_name end,
      site_contact_phone = case
        when (p.subject_id is not null and not k.other_party)
          or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
          or pg_temp.kvkk_has_match(d.site_contact_phone)
        then null else d.site_contact_phone end,
      access_note = case
        when p.subject_id is not null and not k.other_party then null
        else pg_temp.kvkk_mask(d.access_note, p.pseudonym) end,
      updated_at = now()
  from kvkk_param p, kvkk_parcel k
  where k.parcel_id = d.parcel_id
    and (
      (p.subject_id is not null and not k.other_party
        and (d.site_contact_name is not null or d.site_contact_phone is not null or d.access_note is not null))
      or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
      or pg_temp.kvkk_has_match(d.site_contact_phone)
      or pg_temp.kvkk_has_match(d.access_note)
    )
  returning 1
)
select pg_temp.kvkk_count('private.parcel_detail', 'clear contact / access note', count(*)::integer) from changed;

-- ===== private.application_garden_detail (H26 items 4, 5) =================
-- The subject's own applications: contact and access note cleared. For a
-- --person-name: applications for that parcel naming the person.
with changed as (
  update private.application_garden_detail d
  set site_contact_name = case when g.customer_user_id = p.subject_id
        or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
        then null else d.site_contact_name end,
      site_contact_phone = case when g.customer_user_id = p.subject_id
        or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
        or pg_temp.kvkk_has_match(d.site_contact_phone)
        then null else d.site_contact_phone end,
      access_note = case when g.customer_user_id = p.subject_id then null
        else pg_temp.kvkk_mask(d.access_note, p.pseudonym) end
  from public.application_garden g, kvkk_param p
  where g.id = d.application_garden_id
    and g.org_id in (select org_id from kvkk_org)
    and (
      (g.customer_user_id = p.subject_id
        and (d.site_contact_name is not null or d.site_contact_phone is not null or d.access_note is not null))
      or (p.person_name is not null and g.parcel_id = p.parcel_id
        and (pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
             or pg_temp.kvkk_has_match(d.site_contact_phone)
             or pg_temp.kvkk_has_match(d.access_note)))
    )
  returning 1
)
select pg_temp.kvkk_count('private.application_garden_detail', 'clear contact / access note', count(*)::integer) from changed;

-- ===== public.service_application (H26 item 4) =============================
-- The customer's free-text note; the application row stays.
with changed as (
  update public.service_application a
  set customer_note = null
  from kvkk_param p
  where a.customer_user_id = p.subject_id and a.customer_note is not null
    and a.org_id in (select org_id from kvkk_org)
  returning 1
)
select pg_temp.kvkk_count('public.service_application', 'clear customer_note', count(*)::integer) from changed;

-- ===== public.question, public.question_reply (H26 item 5) =================
-- Cleared, not deleted: replies of experts and other owners hang off the
-- question (foreign key) and belong to the other party's service.
with changed as (
  update public.question q
  set body = '[KVKK başvurusu üzerine silindi]', created_by = null, edited_at = now()
  from kvkk_param p
  where q.created_by = p.subject_id and q.org_id in (select org_id from kvkk_org)
  returning 1
)
select pg_temp.kvkk_count('public.question', 'clear body and author', count(*)::integer) from changed;

with changed as (
  update public.question_reply r
  set body = '[KVKK başvurusu üzerine silindi]', created_by = null, edited_at = now()
  from kvkk_param p
  where r.created_by = p.subject_id and r.org_id in (select org_id from kvkk_org)
  returning 1
)
select pg_temp.kvkk_count('public.question_reply', 'clear body and author', count(*)::integer) from changed;

-- ===== private.viewer_invitation (H26 item 6) ==============================
-- Invitations sent by the subject, for the subject's account or phone, and
-- for a --person-name the invitations on that parcel naming the person.
with gone as (
  delete from private.viewer_invitation v
  using kvkk_param p
  where v.org_id not in (select org_id from private.demo_org)
    and (v.invited_by = p.subject_id or v.user_id = p.subject_id
         or (p.subject_id is not null and v.phone in (select value from kvkk_ident where kind = 'phone'))
         or (p.person_name is not null and v.parcel_id = p.parcel_id
             and pg_temp.kvkk_norm(v.full_name) in (select name from kvkk_name)))
  returning 1
)
select pg_temp.kvkk_count('private.viewer_invitation', 'delete', count(*)::integer) from gone;

-- ===== public.parcel_access (H26 items 4, 6) ===============================
-- The account loses its gardens; the Auth account itself is deleted or
-- banned afterwards through the Admin API (README).
with gone as (
  delete from public.parcel_access a
  using kvkk_param p
  where a.user_id = p.subject_id and a.org_id in (select org_id from kvkk_org)
  returning 1
)
select pg_temp.kvkk_count('public.parcel_access', 'delete', count(*)::integer) from gone;

-- ===== private.message_outbox (H26 item 4) =================================
-- Login code messages to the subject's phone (no retention basis).
-- Notification messages are kept 12 months (T09 removes them).
with gone as (
  delete from private.message_outbox m
  where m.purpose = 'login_code'
    and (select subject_id from kvkk_param) is not null
    and pg_temp.kvkk_has_match(m.recipient)
  returning 1
)
select pg_temp.kvkk_count('private.message_outbox', 'delete login codes', count(*)::integer) from gone;

-- ===== end of blocks =======================================================

do $$
begin
  if (select apply from kvkk_param) then
    perform pg_temp.kvkk_audit('kvkk.erased');
  end if;
end;
$$;

\o

select tbl as "table", action, rows from kvkk_result order by seq;
