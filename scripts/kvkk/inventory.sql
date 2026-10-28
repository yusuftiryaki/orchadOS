-- inventory: where the subject's personal data is, for the başvuru defteri.
-- Read only; run.sh always rolls it back. Prints counts and row ids only,
-- never names, phones or e-mails.
--
-- One block per table. A later stream adds a table by adding one block
-- (same columns) and one README row; keep the rule and H26 item in step with
-- erase.sql / pseudonymize.sql.

create temporary table kvkk_inventory (
  seq serial,
  tbl text not null,
  rows integer not null,
  rule text not null,
  h26 text not null,
  note text
) on commit drop;

create function pg_temp.kvkk_inv(p_tbl text, p_rows bigint, p_rule text, p_h26 text, p_note text default null)
returns void language sql as $$
  insert into kvkk_inventory (tbl, rows, rule, h26, note) values (p_tbl, p_rows, p_rule, p_h26, p_note);
$$;

-- Block results go to kvkk_result; keep stdout to the summary.
\o /dev/null

-- ===== auth.users (account) ================================================
-- Delete only when nothing kept hangs off the account: billing rows
-- (on delete restrict) or the aydınlatma teyidi in owner_profile (deleting
-- the user cascades the profile and its declared consent date).
select pg_temp.kvkk_inv('auth.users', count(*), 'manual (Admin API)', '4, 5, 6',
  case when bool_or(
      exists (select 1 from private.owner_profile o where o.user_id = u.id and o.kvkk_consent)
      or exists (select 1 from public.service_application x where x.customer_user_id = u.id)
      or exists (select 1 from public.quote q where q.customer_user_id = u.id)
      or exists (select 1 from public.service_order o where o.customer_user_id = u.id)
      or exists (select 1 from public.payment x where x.customer_user_id = u.id)
      or exists (select 1 from public.refund r where r.customer_user_id = u.id)
      or exists (select 1 from public.garden_removal r where r.customer_user_id = u.id))
    then 'after erase: BAN and scrub via Admin API (kept rows depend on the account; README)'
    else 'after erase: delete via Admin API (README)' end)
from auth.users u, kvkk_param p where u.id = p.subject_id;

-- ===== names never matched automatically ===================================
select pg_temp.kvkk_inv('single-word names of the subject', count(*), 'review', '-',
  'a single word matches other people; not pseudonymised anywhere: check boundary pointers and notes by hand')
from kvkk_review_name;

-- ===== private.owner_profile ===============================================
select pg_temp.kvkk_inv('private.owner_profile', count(*), 'erase', '4, 5',
  'full_name -> pseudonym, phone and email cleared; aydınlatma teyidi (kvkk_consent*) kept 10 years')
from private.owner_profile o, kvkk_param p
where o.user_id = p.subject_id and o.org_id in (select org_id from kvkk_org);

-- ===== private.customer_signup =============================================
select pg_temp.kvkk_inv('private.customer_signup', count(*), 'erase', '4, 6',
  'deleted (pending and completed); the consents are kept in private.consent_record')
from private.customer_signup s, kvkk_param p
where s.user_id = p.subject_id and s.org_id in (select org_id from kvkk_org);

-- ===== private.parcel_detail ===============================================
select pg_temp.kvkk_inv('private.parcel_detail', count(*), 'erase', '4, 5',
  'site contact and access note cleared on the subject''s own parcels with no other party; elsewhere only the subject''s own contact and whole-name / phone matches in the note')
from private.parcel_detail d
join kvkk_parcel k on k.parcel_id = d.parcel_id
cross join kvkk_param p
where (p.subject_id is not null and k.subject_owner and not k.other_party
       and (d.site_contact_name is not null or d.site_contact_phone is not null or d.access_note is not null))
   or pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
   or pg_temp.kvkk_has_match(d.site_contact_phone)
   or pg_temp.kvkk_has_match(d.access_note);

select pg_temp.kvkk_inv('private.parcel_detail (not the subject''s to clear)', count(*), 'review', '5',
  'another party continues or the subject was only a viewer/invitee: kept except the subject''s own entries; read the access note by hand')
from private.parcel_detail d
join kvkk_parcel k on k.parcel_id = d.parcel_id and (k.other_party or not k.subject_owner)
where d.access_note is not null;

-- ===== private.application_garden_detail ===================================
select pg_temp.kvkk_inv('private.application_garden_detail', count(*), 'erase', '4, 5',
  'site contact and access note of the subject''s applications cleared')
from private.application_garden_detail d
join public.application_garden g on g.id = d.application_garden_id
cross join kvkk_param p
where (g.customer_user_id = p.subject_id
       or (p.person_name is not null and g.parcel_id = p.parcel_id
           and (pg_temp.kvkk_norm(d.site_contact_name) in (select name from kvkk_name)
                or pg_temp.kvkk_has_match(d.site_contact_phone)
                or pg_temp.kvkk_has_match(d.access_note))))
  and g.org_id in (select org_id from kvkk_org);

-- ===== public.service_application ==========================================
select pg_temp.kvkk_inv('public.service_application', count(*), 'erase', '4',
  'customer_note cleared; the application itself is kept (contract formation)')
from public.service_application a, kvkk_param p
where a.customer_user_id = p.subject_id and a.customer_note is not null;

-- ===== public.question / public.question_reply =============================
select pg_temp.kvkk_inv('public.question', count(*), 'erase', '5',
  'body replaced by a deletion note, created_by cleared; others'' replies stay')
from public.question q, kvkk_param p
where q.created_by = p.subject_id and q.org_id in (select org_id from kvkk_org)
  and q.author_role in ('owner', 'viewer');

select pg_temp.kvkk_inv('public.question_reply', count(*), 'erase', '5',
  'body replaced by a deletion note, created_by cleared')
from public.question_reply r, kvkk_param p
where r.created_by = p.subject_id and r.org_id in (select org_id from kvkk_org)
  and r.author_role in ('owner', 'viewer');

select pg_temp.kvkk_inv('public.question_reply (written as staff)', count(*), 'keep', '5',
  'expert / ops answers belong to other customers'' service records (H25, 10 years)')
from public.question_reply r, kvkk_param p
where r.created_by = p.subject_id and r.author_role in ('expert', 'ops');

-- ===== private.viewer_invitation ===========================================
select pg_temp.kvkk_inv('private.viewer_invitation', count(*), 'erase', '5, 6',
  'invitations for the subject, and those the subject sent that no other account accepted, deleted')
from private.viewer_invitation v, kvkk_param p
where v.org_id not in (select org_id from private.demo_org)
  and (v.user_id = p.subject_id
       or (v.invited_by = p.subject_id and v.user_id is null)
       or (p.subject_id is not null and v.user_id is null
           and v.phone in (select value from kvkk_ident where kind = 'phone'))
       or (p.person_name is not null and v.parcel_id = p.parcel_id and v.user_id is null
           and pg_temp.kvkk_norm(v.full_name) in (select name from kvkk_name)));

select pg_temp.kvkk_inv('private.viewer_invitation (accepted by another account)', count(*), 'erase', '5',
  'the co-owner''s access record stays; invited_by (the link to the subject) cleared')
from private.viewer_invitation v, kvkk_param p
where v.org_id not in (select org_id from private.demo_org)
  and v.invited_by = p.subject_id and v.user_id is not null and v.user_id <> p.subject_id;

-- ===== public.parcel_access ================================================
select pg_temp.kvkk_inv('public.parcel_access', count(*), 'erase', '4, 6',
  'the subject''s owner and viewer access deleted')
from public.parcel_access a, kvkk_param p
where a.user_id = p.subject_id and a.org_id in (select org_id from kvkk_org);

-- ===== public.membership ===================================================
select pg_temp.kvkk_inv('public.membership', count(*), 'keep', '-',
  'staff role (ops, expert, field staff): employee data, not a customer request; handle by hand')
from public.membership m, kvkk_param p where m.user_id = p.subject_id;

-- ===== private.message_outbox ==============================================
select pg_temp.kvkk_inv('private.message_outbox (login codes)', count(*), 'erase', '4',
  'login code messages to the subject''s phone deleted')
from private.message_outbox m
where m.purpose = 'login_code'
  and (select subject_id from kvkk_param) is not null
  and pg_temp.kvkk_has_match(m.recipient);

select pg_temp.kvkk_inv('private.message_outbox (notifications)', count(*), 'keep', '1',
  'bildirim kayıtları 12 ay (hizmetin ispatı); removed by the T09 cleanup')
from private.message_outbox m
where m.purpose = 'notification'
  and (select subject_id from kvkk_param) is not null
  and pg_temp.kvkk_has_match(m.recipient);

select pg_temp.kvkk_inv('public.notification', count(*), 'keep', '1',
  'bildirim kayıtları 12 ay; no name or phone in the row')
from public.notification n, kvkk_param p where n.recipient_user_id = p.subject_id;

-- ===== public.session_event ================================================
select pg_temp.kvkk_inv('public.session_event (boundary_pointer)', count(*), 'pseudonymize', '2',
  'append-only; the pointer''s name -> pseudonym (exact whole name only)')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type = 'boundary_pointer'
  and pg_temp.kvkk_norm(pg_temp.kvkk_json(e.payload) ->> 'name') in (select name from kvkk_name);

select pg_temp.kvkk_inv('public.session_event (other boundary pointers, review)', count(*), 'review', '2',
  'pointers on the parcels in scope with another name (spelling, first name only, someone else); read them (ids below)')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type = 'boundary_pointer'
  and coalesce(pg_temp.kvkk_norm(pg_temp.kvkk_json(e.payload) ->> 'name'), '') not in (select name from kvkk_name)
  and coalesce(pg_temp.kvkk_json(e.payload) ->> 'name', '') not like 'kvkk-%';

select pg_temp.kvkk_inv('public.session_event (notes mentioning the subject)', count(*),
  'pseudonymize (--include-notes)', '2', 'append-only free text; ids listed below')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
  and pg_temp.kvkk_payload_has_match(e.payload);

select pg_temp.kvkk_inv('public.session_event (other notes, review)', count(*), 'review', '2',
  'notes on the parcels in scope with no exact match; read them (ids below)')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
  and not pg_temp.kvkk_payload_has_match(e.payload);

-- ===== public.audit_event ==================================================
select pg_temp.kvkk_inv('public.audit_event (details mention the subject)', count(*), 'pseudonymize', '2',
  'append-only; rows tied to the subject only, string values only')
from public.audit_event a, kvkk_param p
where a.id in (select id from kvkk_audit_scope)
  and pg_temp.kvkk_mask_jsonb(a.details, p.pseudonym) is distinct from a.details;

select pg_temp.kvkk_inv('public.audit_event (match in rows not tied to the subject, review)', count(*), 'review', '2',
  'possibly a namesake; never rewritten by pseudonymize; ids below, decide by hand')
from public.audit_event a, kvkk_param p
where a.org_id in (select org_id from kvkk_org)
  and a.id not in (select id from kvkk_audit_scope)
  and a.action not like 'kvkk.%'
  and pg_temp.kvkk_mask_jsonb(a.details, p.pseudonym) is distinct from a.details;

select pg_temp.kvkk_inv('public.audit_event (actor or entity is the subject)', count(*), 'keep', '2',
  'append-only, 10 years; holds the user id only')
from public.audit_event a, kvkk_param p
where a.actor_user_id = p.subject_id;

-- ===== retention-bound (H26 item 1): never changed by these scripts ========
select pg_temp.kvkk_inv('private.consent_record', count(*), 'keep', '1, 2',
  'aydınlatma teyidi, rıza, mesafeli sözleşme ve ön bilgilendirme onayları: 10 years; no name, phone or e-mail')
from private.consent_record c, kvkk_param p where c.subject_id = p.subject_id;

select pg_temp.kvkk_inv('private.billing_profile', count(*), 'keep', '1',
  'fatura profili: 10 years after the contract (TBK 146, VUK 253)')
from private.billing_profile b, kvkk_param p where b.user_id = p.subject_id;

select pg_temp.kvkk_inv('public.quote', count(*), 'keep', '1',
  'teklif / mesafeli sözleşme kaydı (10 years)')
from public.quote q, kvkk_param p where q.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('public.service_order', count(*), 'keep', '1',
  'sipariş ve sözleşme (10 years); status ' || coalesce(string_agg(distinct o.status::text, ','), '-'))
from public.service_order o, kvkk_param p where o.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('public.payment', count(*), 'keep', '1', 'ödeme kaydı, makbuz (VUK 253, 10 years)')
from public.payment x, kvkk_param p where x.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('private.payment_billing_snapshot', count(*), 'keep', '1', 'fatura bilgisi (VUK 253)')
from private.payment_billing_snapshot s
join public.payment x on x.id = s.payment_id
cross join kvkk_param p where x.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('private.payment_event', count(*), 'keep', '1', 'ödeme kuruluşu kaydı (VUK 253)')
from private.payment_event e
join public.payment x on x.id = e.payment_id
cross join kvkk_param p where x.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('public.refund', count(*), 'keep', '1', 'iade kaydı (VUK 253)')
from public.refund r, kvkk_param p where r.customer_user_id = p.subject_id;

select pg_temp.kvkk_inv('public.garden_removal', count(*), 'keep', '1',
  'bahçe çıkarma ve iade dayanağı (10 years)')
from public.garden_removal g, kvkk_param p where g.customer_user_id = p.subject_id;

\o

select tbl as "table", rows, rule, h26 as "H26", note
from kvkk_inventory where rows > 0 order by seq;

-- Note and boundary pointer events for a manual look (ids only).
select e.id as session_event_id, e.event_type, e.parcel_id,
       case when e.event_type = 'boundary_pointer'
            then pg_temp.kvkk_norm(pg_temp.kvkk_json(e.payload) ->> 'name') in (select name from kvkk_name)
            else pg_temp.kvkk_payload_has_match(e.payload) end as mentions_subject
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('boundary_pointer', 'field_notice_verbal', 'field_notice_objection', 'visit_blocked')
order by e.created_at;

-- Audit rows of the org that match but are not tied to the subject (ids only).
select a.id as audit_event_id, a.action, a.entity_type
from public.audit_event a, kvkk_param p
where a.org_id in (select org_id from kvkk_org)
  and a.id not in (select id from kvkk_audit_scope)
  and a.action not like 'kvkk.%'
  and pg_temp.kvkk_mask_jsonb(a.details, p.pseudonym) is distinct from a.details
order by a.created_at;
