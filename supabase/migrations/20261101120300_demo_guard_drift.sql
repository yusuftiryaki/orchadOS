-- IP13-A / 4: demo guard drift check (docs/demo-turu.md §6.1, §15).
--
-- Deploys run db push --include-all: a migration merged after the IP13-A ones
-- but carrying an older timestamp is applied after them on hosted projects,
-- while a fresh CI database applies it before them. Such a migration can
--   - create a table the one-time pass of 20261101120100 never saw (no
--     zz_demo_read_only), or
--   - create or replace a function IP13-A overrides and drop its demo filter.
-- pgTAP runs on a fresh database only and sees neither. So every deploy
-- workflow (deploy-db*.yml), after db push, runs
--   select private.attach_demo_guards();   -- re-attach, idempotent
--   select * from private.demo_guard_drift();  -- must return no rows
-- and fails the job on any row. pgTAP 43_demo_write_guard covers both.
--
-- Not an event trigger (ddl_command_end): on hosted Supabase event triggers
-- are created through supautils as the postgres role and do not fire for
-- statements run by superuser roles, which the platform uses for some DDL;
-- whether they fire for db push could not be shown on a hosted project, and
-- a guard that silently does not fire is worse than an explicit check.
--
-- A new table that grants access to or holds the identity of a user still
-- calls private.attach_demo_account_guard() itself (its user column cannot be
-- guessed); the check only reports a listed table whose account guard is gone.

create function private.demo_guard_drift()
returns table (kind text, object text, problem text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Tables without the write guard.
  select 'table', c.oid::regclass::text, 'zz_demo_read_only missing'
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and not exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    and c.oid <> 'private.demo_session'::regclass
    and not exists (
      select 1 from pg_catalog.pg_trigger g where g.tgrelid = c.oid and g.tgname = 'zz_demo_read_only')

  union all

  -- Functions IP13-A overrides: every overload still carries its demo filter.
  select 'function', coalesce(p.oid::regprocedure::text, f.schema_name || '.' || f.function_name),
         case when p.oid is null then 'missing' else 'demo filter missing: ' || f.marker end
  from (values
      ('public', 'approve_boundary', 'private.assert_not_demo()'),
      ('public', 'owner_invite_viewer', 'private.assert_not_demo()'),
      ('public', 'owner_cancel_viewer_invitation', 'private.assert_not_demo()'),
      ('private', 'enqueue_notifications', 'private.is_demo_org('),
      ('private', 'enqueue_billing_notification', 'private.is_demo_org('),
      ('public', 'save_ai_assessment', 'demo_org_no_ai'),
      ('public', 'ops_find_user_id', 'raw_app_meta_data ->> ''demo'''),
      ('public', 'signup_find_account', 'raw_app_meta_data ->> ''demo''')
    ) as f (schema_name, function_name, marker)
  left join pg_catalog.pg_namespace n on n.nspname = f.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid and p.proname = f.function_name
  where p.oid is null or strpos(p.prosrc, f.marker) = 0

  union all

  -- Account scope guards of 20261101120200 (b).
  select 'account_guard', a.table_name || '.' || a.trigger_name, 'missing'
  from (values
      ('public.parcel_access', 'demo_account_scope_user_id'),
      ('public.membership', 'demo_account_scope_user_id'),
      ('private.owner_profile', 'demo_account_scope_user_id'),
      ('private.billing_profile', 'demo_account_scope_user_id'),
      ('private.consent_record', 'demo_account_scope_user_id'),
      ('private.consent_record', 'demo_account_scope_subject_id'),
      ('private.customer_signup', 'demo_account_scope_user_id'),
      ('private.viewer_invitation', 'demo_account_scope_user_id'),
      ('public.notification', 'demo_account_scope_recipient_user_id'),
      ('public.service_application', 'demo_account_scope_customer_user_id'),
      ('public.application_garden', 'demo_account_scope_customer_user_id'),
      ('public.quote', 'demo_account_scope_customer_user_id'),
      ('public.quote_item', 'demo_account_scope_customer_user_id'),
      ('public.service_order', 'demo_account_scope_customer_user_id'),
      ('public.service_order_item', 'demo_account_scope_customer_user_id'),
      ('public.payment', 'demo_account_scope_customer_user_id'),
      ('public.payment_item', 'demo_account_scope_customer_user_id'),
      ('public.refund', 'demo_account_scope_customer_user_id')
    ) as a (table_name, trigger_name)
  where not exists (
    select 1 from pg_catalog.pg_trigger g
    where g.tgrelid = to_regclass(a.table_name) and g.tgname = a.trigger_name)

  order by 1, 2;
$$;
comment on function private.demo_guard_drift() is
  'Demo guards lost to migration order: unguarded tables, overridden functions without their demo filter, missing account guards. Deploy workflows fail on any row.';
revoke all on function private.demo_guard_drift() from public;
