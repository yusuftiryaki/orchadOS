-- Back to the seed, for the pgTAP tests: local and CI databases only (loaded
-- after seed.sql and purge.sql, see purge.sql and README.md).
--
-- testing.seed_row keeps the primary keys of every row of public, private and
-- storage.objects as `supabase db reset` left them (migrations' reference data
-- and supabase/seed.sql). testing.reset_to_seed() deletes every other row with
-- triggers off: what other suites (web, pipeline, AI worker tests, pnpm
-- db:demo) left behind. A pgTAP file calls it first, inside its transaction, so
-- the deletion is rolled back with the rest of the file. Seed rows that other
-- suites changed are not restored. Auth users are not touched.

create table if not exists testing.seed_row (
  table_name text not null,
  pk jsonb not null,
  primary key (table_name, pk)
);
revoke all on testing.seed_row from public;

-- Base tables with a primary key and the key's columns, in order.
create or replace function testing._keyed_tables()
returns table (table_name text, pk_expr text)
language sql
stable
set search_path = ''
as $$
  select format('%I.%I', n.nspname, c.relname),
         'jsonb_build_object(' || string_agg(format('%L, %I', a.attname, a.attname), ', ' order by k.ord) || ')'
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where i.indisprimary
    and c.relkind = 'r'
    and (n.nspname in ('public', 'private') or (n.nspname = 'storage' and c.relname = 'objects'))
  group by n.nspname, c.relname
  order by 1
$$;

-- The snapshot, once: right after the seed.
do $$
declare
  t record;
begin
  if exists (select 1 from testing.seed_row) then
    return;
  end if;
  for t in select * from testing._keyed_tables() loop
    execute format('insert into testing.seed_row select %L, %s from %s', t.table_name, t.pk_expr, t.table_name);
  end loop;
end;
$$;

create or replace function testing.reset_to_seed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  set local session_replication_role = replica;
  for t in select * from testing._keyed_tables() loop
    execute format(
      'delete from %s where %s not in (select pk from testing.seed_row where table_name = %L)',
      t.table_name, t.pk_expr, t.table_name);
  end loop;
  set local session_replication_role = origin;
end;
$$;

revoke all on function testing.reset_to_seed() from public;
revoke all on function testing._keyed_tables() from public;
