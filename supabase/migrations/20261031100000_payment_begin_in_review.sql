-- İP12-D review fix (PR #58, finding 1): payment_begin refuses a new card
-- attempt while one of the order's card attempts is in review
-- (pending_review) that ops may still accept (ops_resolve_payment_review, so a
-- fraud review; not an amount or reference mismatch, which leaves review only
-- through its void). Such an attempt may already have taken the money and
-- become a success. Live initiated attempts are
-- still superseded as in §6.9 (the portal itself offers no new attempt while
-- any attempt is live, see liveCardAttempt). Errors as before, plus
-- payment_in_progress.

create or replace function public.payment_begin(p_order_id uuid, p_user_id uuid, p_provider text, p_return_origin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b private.billing_profile;
  op private.owner_profile;
  u auth.users;
  v_required boolean;
  v_amount bigint;
  v_id uuid;
begin
  if p_provider is null or p_provider not in ('iyzico', 'fake') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider';
  end if;
  if p_return_origin is null or length(p_return_origin) > 200 or p_return_origin !~ '^https?://[^/?#[:space:]]+$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'return_origin';
  end if;
  select * into o from public.service_order where id = p_order_id and customer_user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_amount := o.total_kurus - (o.paid_kurus - o.refunded_kurus);
  if o.status <> 'awaiting_payment' or v_amount <= 0 then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if p_provider = 'fake' and not private.fake_payments_allowed(o.org_id) then
    raise exception 'fake_payments_disabled' using errcode = 'P0001';
  end if;
  -- A card attempt in review may still become a success: a second one could
  -- charge the customer twice (live initiated attempts are superseded below).
  if exists (select 1 from public.payment p
             where p.order_id = o.id and p.provider <> 'manual' and p.status = 'pending_review'
               and coalesce(p.failure_code, '') not in ('amount_mismatch', 'reference_mismatch')) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(o.org_id, p_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  select * into b from private.billing_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into op from private.owner_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into u from auth.users x where x.id = p_user_id;
  v_required := coalesce((select s.identity_number_required from public.org_billing_setting s where s.org_id = o.org_id), false);

  update public.payment
  set status = 'expired', failure_code = 'superseded'
  where order_id = o.id and provider <> 'manual' and status = 'initiated'
    and (token_expires_at is null or token_expires_at > now());

  insert into public.payment (org_id, order_id, customer_user_id, provider, amount_kurus, return_origin)
  values (o.org_id, o.id, p_user_id, p_provider::public.payment_provider, v_amount, p_return_origin)
  returning id into v_id;
  perform private.write_payment_items(o, v_id, v_amount);
  perform private.audit(o.org_id, p_user_id, 'customer', 'payment.initiated', 'payment', v_id,
    jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount_kurus', v_amount));

  return jsonb_build_object(
    'payment_id', v_id,
    'order_id', o.id,
    'order_number', o.number,
    'amount_kurus', v_amount,
    'currency', o.currency,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object('payment_item_id', i.id, 'line_no', i.line_no, 'name', i.name,
        'amount_kurus', i.amount_kurus) order by i.line_no), '[]'::jsonb)
      from public.payment_item i where i.payment_id = v_id),
    'buyer', jsonb_build_object(
      'id', p_user_id,
      'first_name', b.first_name,
      'last_name', b.last_name,
      'identity_number', case when v_required and b.identity_number is not null then b.identity_number
                              else '11111111111' end,
      'email', coalesce(b.email, op.email, u.email),
      'phone', coalesce(op.phone, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
      'address', b.address,
      'district', b.district,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code,
      'registered_at', coalesce(u.created_at, op.created_at)
    ),
    'billing', jsonb_build_object(
      'contact_name', case when b.kind = 'company' then b.company_title else b.first_name || ' ' || b.last_name end,
      'address', b.address,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code
    )
  );
end;
$$;
