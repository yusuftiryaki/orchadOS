-- Expert measurements of a published session are frozen too.
--
-- 20261020130000 froze the expert's judgement (assessment, finding and their
-- links) once a session is published, but left measurements open so that late
-- field-app uploads (source = staff) still land. Measurements are insert-only
-- already; this blocks API users from adding source = 'expert' measurements,
-- or evidence for them, to a published session. Staff, algorithm and AI
-- measurements stay open. Trusted roles (service_role, postgres) are not
-- affected, as in forbid_change_after_publication().

create function private.forbid_expert_measurement_after_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;

  if tg_table_name = 'measurement' then
    if new.source <> 'expert' then
      return null;
    end if;
    v_session_id := new.session_id;
  else
    select m.session_id into v_session_id
    from public.measurement m
    where m.id = new.measurement_id and m.source = 'expert';
  end if;

  if exists (select 1 from public.session s where s.id = v_session_id and s.status = 'published') then
    raise exception 'expert measurements of published session % cannot be added', v_session_id
      using errcode = '42501', hint = 'The report is signed; unpublishing is not supported.';
  end if;
  return null;
end;
$$;

create trigger measurement_expert_frozen_after_publication
after insert on public.measurement
for each row execute function private.forbid_expert_measurement_after_publication();
create trigger measurement_evidence_expert_frozen_after_publication
after insert on public.measurement_evidence
for each row execute function private.forbid_expert_measurement_after_publication();
