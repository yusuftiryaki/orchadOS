-- pseudonymize: in append-only tables the subject's name, phone and e-mail
-- become the stable pseudonym (kvkk-<8 hex>), H26 item 2: the records stay
-- for the protection of rights, their identifying fields change "kayda
-- geçirilen kontrollü bir istisnayla". The exception is
-- session_replication_role = replica for this transaction only (the
-- insert-only triggers do not fire); the audit row written at the end
-- records it.
--
-- One block per table. A later stream adds an append-only table by adding
-- one block that ends with pg_temp.kvkk_count(...), one inventory.sql block
-- and one README row. Scope every statement to the subject; never to a demo
-- org (kvkk_parcel and kvkk_org already leave demo orgs out).

-- Block results go to kvkk_result; keep stdout to the summary.
\o /dev/null

select pg_temp.kvkk_require_no_active_contract();

set local session_replication_role = replica;

-- ===== public.session_event: boundary_pointer (H26 item 2; H07, H32) =======
-- payload is JSON text {"name": ..., "role": ...} (docs/arayuzler.md). The
-- name is replaced when it equals one of the subject's multi-word names
-- exactly (normalised; --subject: on the subject's parcels; --person-name:
-- on that parcel). A longer or partial name is a different person and stays
-- (inventory lists every pointer with a matched flag). Role and the other
-- keys stay.
with changed as (
  update public.session_event e
  set payload = jsonb_set(pg_temp.kvkk_json(e.payload), '{name}', to_jsonb(p.pseudonym))::text
  from kvkk_param p, kvkk_parcel k
  where k.parcel_id = e.parcel_id
    and e.event_type = 'boundary_pointer'
    and pg_temp.kvkk_norm(pg_temp.kvkk_json(e.payload) ->> 'name') in (select name from kvkk_name)
  returning 1
)
select pg_temp.kvkk_count('public.session_event', 'boundary_pointer name', count(*)::integer) from changed;

-- ===== public.session_event: free-text notes (H26 item 2; H01, H15) ========
-- Only with --include-notes, after the inventory's list was read: every
-- match of the subject's names and phones in the note events of the parcels
-- in scope, as whole names and numbers in JSON string values (never keys or
-- uuids). A note that names the person differently (first name only, a
-- nickname) is not matched; the inventory lists all note ids for review.
with changed as (
  update public.session_event e
  set payload = pg_temp.kvkk_mask_payload(e.payload, p.pseudonym)
  from kvkk_param p, kvkk_parcel k
  where p.include_notes
    and k.parcel_id = e.parcel_id
    and e.event_type in ('field_notice_sign', 'field_notice_verbal', 'field_notice_objection', 'visit_blocked')
    and pg_temp.kvkk_payload_has_match(e.payload)
  returning 1
)
select pg_temp.kvkk_count('public.session_event', 'note text', count(*)::integer) from changed;

-- ===== private.boundary_pointer (H26 item 2; H07, T16) ====================
-- The copy of the boundary_pointer events (name, role). Same rule as the
-- events: the name is replaced only when it equals one of the subject's
-- multi-word names exactly, on the parcels in scope. Insert-only (its guard
-- trigger is off in this replica-mode transaction).
with changed as (
  update private.boundary_pointer b
  set name = p.pseudonym
  from kvkk_param p, kvkk_parcel k
  where k.parcel_id = b.parcel_id
    and pg_temp.kvkk_norm(b.name) in (select name from kvkk_name)
  returning 1
)
select pg_temp.kvkk_count('private.boundary_pointer', 'name', count(*)::integer) from changed;

-- ===== private.media_suppression / private.boundary_dispute notes ===========
-- (H26 item 2; T20, T16) Ops notes of hidden images and boundary disputes
-- on the parcels in scope: only with --include-notes, whole names and phones
-- of the subject. Append-only records; the inventory lists every note id.
with changed as (
  update private.media_suppression m
  set note = pg_temp.kvkk_mask(m.note, p.pseudonym)
  from kvkk_param p, kvkk_parcel k
  where p.include_notes
    and k.parcel_id = m.parcel_id
    and pg_temp.kvkk_has_match(m.note)
  returning 1
)
select pg_temp.kvkk_count('private.media_suppression', 'note text', count(*)::integer) from changed;

with changed as (
  update private.boundary_dispute d
  set note = pg_temp.kvkk_mask(d.note, p.pseudonym)
  from kvkk_param p, kvkk_parcel k
  where p.include_notes
    and k.parcel_id = d.parcel_id
    and pg_temp.kvkk_has_match(d.note)
  returning 1
)
select pg_temp.kvkk_count('private.boundary_dispute', 'note text', count(*)::integer) from changed;

-- ===== public.audit_event (H26 item 2) =====================================
-- details must never hold personal data; a match is replaced all the same,
-- but only in rows tied to the subject (kvkk_audit_scope: actor, entity or
-- the subject's records; --person-name: the parcel) and only in string
-- values, never keys or uuids. Matches in other rows of the org may be
-- namesakes: inventory lists their ids for a manual decision.
with changed as (
  update public.audit_event a
  set details = pg_temp.kvkk_mask_jsonb(a.details, p.pseudonym)
  from kvkk_param p
  where a.id in (select id from kvkk_audit_scope)
    and pg_temp.kvkk_mask_jsonb(a.details, p.pseudonym) is distinct from a.details
  returning 1
)
select pg_temp.kvkk_count('public.audit_event', 'details text', count(*)::integer) from changed;

-- ===== end of blocks =======================================================

set local session_replication_role = origin;

do $$
begin
  if (select apply from kvkk_param) then
    perform pg_temp.kvkk_audit('kvkk.pseudonymized');
  end if;
end;
$$;

\o

select tbl as "table", action, rows from kvkk_result order by seq;
