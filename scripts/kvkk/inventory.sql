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
select pg_temp.kvkk_inv('auth.users', count(*), 'manual (Admin API)', '4, 5, 6',
  'deleted after erase via Admin API when no billing row restricts it; else banned (README)')
from auth.users u, kvkk_param p where u.id = p.subject_id;

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
  'site contact and access note cleared; only the subject''s own contact where another party continues')
from private.parcel_detail d
join kvkk_parcel k on k.parcel_id = d.parcel_id
where (select subject_id from kvkk_param) is not null
   or pg_temp.kvkk_has_match(d.site_contact_name) or pg_temp.kvkk_has_match(d.access_note);

select pg_temp.kvkk_inv('private.parcel_detail (other party continues)', count(*), 'review', '5',
  'access_note of these parcels is kept except the subject''s name and phone; read it by hand')
from private.parcel_detail d
join kvkk_parcel k on k.parcel_id = d.parcel_id and k.other_party
where d.access_note is not null;

-- ===== private.application_garden_detail ===================================
select pg_temp.kvkk_inv('private.application_garden_detail', count(*), 'erase', '4, 5',
  'site contact and access note of the subject''s applications cleared')
from private.application_garden_detail d
join public.application_garden g on g.id = d.application_garden_id
cross join kvkk_param p
where (g.customer_user_id = p.subject_id
       or (p.person_name is not null and g.parcel_id = p.parcel_id
           and (pg_temp.kvkk_has_match(d.site_contact_name) or pg_temp.kvkk_has_match(d.access_note))))
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
where q.created_by = p.subject_id and q.org_id in (select org_id from kvkk_org);

select pg_temp.kvkk_inv('public.question_reply', count(*), 'erase', '5',
  'body replaced by a deletion note, created_by cleared')
from public.question_reply r, kvkk_param p
where r.created_by = p.subject_id and r.org_id in (select org_id from kvkk_org);

-- ===== private.viewer_invitation ===========================================
select pg_temp.kvkk_inv('private.viewer_invitation', count(*), 'erase', '6',
  'invitations by or for the subject deleted')
from private.viewer_invitation v, kvkk_param p
where v.org_id not in (select org_id from private.demo_org)
  and (v.invited_by = p.subject_id or v.user_id = p.subject_id
       or (p.subject_id is not null and v.phone in (select value from kvkk_ident where kind = 'phone'))
       or (p.person_name is not null and v.parcel_id = p.parcel_id
           and pg_temp.kvkk_norm(v.full_name) in (select name from kvkk_name)));

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
  'append-only; the pointer''s name -> pseudonym')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type = 'boundary_pointer'
  and pg_temp.kvkk_norm(pg_temp.kvkk_json(e.payload) ->> 'name') in (select name from kvkk_name);

select pg_temp.kvkk_inv('public.session_event (notes mentioning the subject)', count(*),
  'pseudonymize (--include-notes)', '2', 'append-only free text; ids listed below')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
  and pg_temp.kvkk_has_match(e.payload);

select pg_temp.kvkk_inv('public.session_event (other notes, review)', count(*), 'review', '2',
  'notes on the parcels in scope with no exact match; read them (ids below)')
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
  and not pg_temp.kvkk_has_match(e.payload);

-- ===== public.audit_event ==================================================
select pg_temp.kvkk_inv('public.audit_event (details mention the subject)', count(*), 'pseudonymize', '2',
  'append-only; details should hold no personal data, matches are replaced')
from public.audit_event a
where a.org_id in (select org_id from kvkk_org) and pg_temp.kvkk_has_match(a.details::text);

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

-- Note events for a manual look (ids only).
select e.id as session_event_id, e.event_type, e.parcel_id,
       pg_temp.kvkk_has_match(e.payload) as mentions_subject
from public.session_event e
join kvkk_parcel k on k.parcel_id = e.parcel_id
where e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
order by e.created_at;
