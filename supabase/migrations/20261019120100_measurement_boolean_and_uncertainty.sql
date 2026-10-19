-- Yes/no values and optional uncertainty for categorical values.
--
-- The field app records staff yes/no answers as measurements (source = staff).
-- They get their own value column instead of being squeezed into a 0/1 scale.
-- Uncertainty stays mandatory for numeric and scale values; category and
-- yes/no values may leave it empty (docs/veri-modeli.md, "Belirsizlik").

alter table public.measurement add column value_boolean boolean;

-- Replace the unnamed checks from 20261018120300 with named ones that know
-- about value_boolean.
alter table public.measurement drop constraint measurement_check1;
alter table public.measurement drop constraint measurement_check2;

alter table public.measurement
  add constraint measurement_one_value
  check (num_nonnulls(value_numeric, value_scale, value_category, value_boolean) = 1);
alter table public.measurement
  add constraint measurement_uncertainty_required
  check ((value_numeric is null and value_scale is null) or uncertainty is not null);

comment on column public.measurement.uncertainty is
  'Required for numeric and scale values; empty for category and yes/no values.';
comment on column public.measurement.value_boolean is 'Yes/no value of a boolean metric (e.g. a staff question).';

-- Value type, scale range, category list, unit and subject kind; now also boolean.
create or replace function private.validate_measurement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  md public.metric_definition;
begin
  select * into md from public.metric_definition where id = new.metric_definition_id;
  if not found then
    raise exception 'unknown metric_definition_id %', new.metric_definition_id using errcode = '23503';
  end if;

  if md.value_type = 'numeric' and new.value_numeric is null then
    raise exception 'metric % expects value_numeric', md.code using errcode = '23514';
  elsif md.value_type = 'scale' then
    if new.value_scale is null then
      raise exception 'metric % expects value_scale', md.code using errcode = '23514';
    elsif new.value_scale < md.scale_min or new.value_scale > md.scale_max then
      raise exception 'metric % expects a scale value in [%, %], got %',
        md.code, md.scale_min, md.scale_max, new.value_scale using errcode = '23514';
    end if;
  elsif md.value_type = 'category' then
    if new.value_category is null then
      raise exception 'metric % expects value_category', md.code using errcode = '23514';
    elsif not (new.value_category = any (md.categories)) then
      raise exception 'metric % does not allow category %', md.code, new.value_category using errcode = '23514';
    end if;
  elsif md.value_type = 'boolean' and new.value_boolean is null then
    raise exception 'metric % expects value_boolean', md.code using errcode = '23514';
  end if;

  if new.unit is null then
    new.unit := md.unit;
  elsif new.unit is distinct from md.unit then
    raise exception 'metric % is stored in %, got %', md.code, coalesce(md.unit, '(no unit)'), new.unit
      using errcode = '23514';
  end if;

  if not (
    case
      when new.tree_id is not null then 'tree'::public.measurement_subject
      when new.slot_id is not null then 'slot'::public.measurement_subject
      when new.zone_id is not null then 'zone'::public.measurement_subject
      else 'parcel'::public.measurement_subject
    end = any (md.subject_kinds)
  ) then
    raise exception 'metric % cannot be measured on this subject kind', md.code using errcode = '23514';
  end if;

  return new;
end;
$$;

-- A boolean metric has no unit, scale range or category list.
alter table public.metric_definition
  add constraint metric_definition_boolean_unitless
  check (value_type <> 'boolean' or unit is null);
