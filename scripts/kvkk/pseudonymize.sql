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
-- name is replaced when it equals one of the subject's names (--subject: on
-- the subject's parcels; --person-name: on that parcel). Role and the other
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
-- in scope. A note that names the person differently (first name only, a
-- nickname) is not matched; the inventory lists all note ids for review.
with changed as (
  update public.session_event e
  set payload = pg_temp.kvkk_mask(e.payload, p.pseudonym)
  from kvkk_param p, kvkk_parcel k
  where p.include_notes
    and k.parcel_id = e.parcel_id
    and e.event_type in ('field_notice_verbal', 'field_notice_objection', 'visit_blocked')
    and pg_temp.kvkk_has_match(e.payload)
    -- A JSON payload must stay JSON.
    and (pg_temp.kvkk_json(e.payload) is null
         or pg_temp.kvkk_json(pg_temp.kvkk_mask(e.payload, p.pseudonym)) is not null)
  returning 1
)
select pg_temp.kvkk_count('public.session_event', 'note text', count(*)::integer) from changed;

-- ===== public.audit_event (H26 item 2) =====================================
-- details must never hold personal data; any match in the subject's orgs is
-- replaced all the same.
with changed as (
  update public.audit_event a
  set details = pg_temp.kvkk_mask(a.details::text, p.pseudonym)::jsonb
  from kvkk_param p
  where a.org_id in (select org_id from kvkk_org)
    and pg_temp.kvkk_has_match(a.details::text)
    and pg_temp.kvkk_json(pg_temp.kvkk_mask(a.details::text, p.pseudonym)) is not null
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
