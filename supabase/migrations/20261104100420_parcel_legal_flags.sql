-- Legal follow-ups, wave 2: which of this wave's switches apply to a parcel,
-- for the portal pages of anyone who reads the parcel (owner, viewer, demo
-- visitor) and for staff. No other setting is exposed.
--   coowner_notice_flow   T15: the invitation form asks for the owner's declaration
--   boundary_declaration  T16: boundary approval shows and requires the declaration
create function public.parcel_legal_flags(p_parcel_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'coowner_notice_flow', (private.billing_setting(p.org_id)).coowner_notice_flow_enabled,
    'boundary_declaration', (private.billing_setting(p.org_id)).boundary_declaration_required
  )
  from public.parcel p
  where p.id = p_parcel_id
    and (p.id in (select authz.user_parcel_ids()) or p.org_id in (select authz.user_org_ids()));
$$;
comment on function public.parcel_legal_flags(uuid) is
  'T15, T16: the co-owner flow and boundary declaration switches of the parcel''s org, for its readers; null otherwise.';
revoke all on function public.parcel_legal_flags(uuid) from public, anon;
grant execute on function public.parcel_legal_flags(uuid) to authenticated;
