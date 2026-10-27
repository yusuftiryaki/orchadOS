-- IP12-A2 / 9: scheduled billing work (docs/musteri-yonetimi.md §5, §6.11).
--
-- 1. private.billing_housekeeping(), daily: expired quotes (an application
--    goes back to review), the payment reminder once, three days before the
--    due time, completion of orders whose service ended, and provider events
--    of no payment older than seven days.
-- 2. private.dispatch_payment_reconcile(), every ten minutes: calls the
--    payments Edge Function's reconcile action when Vault holds its URL
--    (payments_reconcile_url) and the cron secret (orchados_cron_secret);
--    nothing happens while either is missing (local stack, CI).

create function private.billing_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.istanbul_today();
  q record;
  o record;
  v record;
  v_expired integer := 0;
  v_reminded integer := 0;
  v_completed integer := 0;
  v_events integer;
begin
  -- Locks application → quote, as everywhere.
  for q in
    select x.id, x.application_id from public.quote x where x.status = 'issued' and x.valid_until < v_today
  loop
    if q.application_id is not null then
      perform 1 from public.service_application where id = q.application_id for update;
    end if;
    update public.quote set status = 'expired', decided_at = now()
    where id = q.id and status = 'issued' and valid_until < v_today
    returning id, org_id, number into v;
    continue when v.id is null;
    v_expired := v_expired + 1;
    perform private.audit(v.org_id, null, 'system', 'quote.expired', 'quote', v.id, jsonb_build_object('number', v.number));
    if q.application_id is not null then
      update public.service_application set status = 'submitted' where id = q.application_id and status = 'quoted';
    end if;
  end loop;

  for o in
    select x.id from public.service_order x
    where x.status = 'awaiting_payment' and x.reminder_sent_at is null
      and x.payment_due_at > now() and x.payment_due_at <= now() + interval '3 days'
    for update skip locked
  loop
    update public.service_order set reminder_sent_at = now()
    where id = o.id and status = 'awaiting_payment' and reminder_sent_at is null
    returning id, org_id, customer_user_id, number into v;
    continue when v.id is null;
    v_reminded := v_reminded + 1;
    perform private.enqueue_billing_notification('payment_reminder', v.org_id, v.customer_user_id, v.id, v.number,
      '/portal/siparis/' || v.id);
  end loop;

  for o in
    select x.id from public.service_order x where x.status = 'active' and x.service_end < v_today
    for update skip locked
  loop
    update public.service_order set status = 'completed', completed_at = now()
    where id = o.id and status = 'active'
    returning id, org_id, number into v;
    continue when v.id is null;
    v_completed := v_completed + 1;
    perform private.audit(v.org_id, null, 'system', 'order.completed', 'order', v.id,
      jsonb_build_object('number', v.number));
  end loop;

  delete from private.payment_event where payment_id is null and received_at < now() - interval '7 days';
  get diagnostics v_events = row_count;

  return jsonb_build_object('quotes_expired', v_expired, 'reminders_sent', v_reminded,
    'orders_completed', v_completed, 'events_deleted', v_events);
end;
$$;
comment on function private.billing_housekeeping() is
  'Daily (pg_cron): quote expiry, the payment reminder once, order completion, events of no payment after 7 days.';

create function private.dispatch_payment_reconcile()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'payments_reconcile_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'orchados_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-orchados-cron-secret', v_secret),
    body := '{"action": "reconcile"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
comment on function private.dispatch_payment_reconcile() is
  'Every 10 minutes (pg_cron): calls the payments reconcile action when Vault holds its URL and the cron secret.';

revoke all on function private.billing_housekeeping() from public;
revoke all on function private.dispatch_payment_reconcile() from public;

select cron.schedule('billing-housekeeping', '0 0 * * *', 'select private.billing_housekeeping()');
select cron.schedule('reconcile-payments', '*/10 * * * *', 'select private.dispatch_payment_reconcile()');
