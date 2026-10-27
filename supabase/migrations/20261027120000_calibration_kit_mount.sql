-- Kit identity chip (docs/arayuzler.md, "Kit kimlik çipi"): the robot socket
-- reads the scan kit's sensor poses and a uint32 calibration id from the kit's
-- DS2431 (contract: hoverboard/docs/kit-soketi.md, manifest schema 1).
--
-- extrinsics.kit_mount holds the poses in the robot's `kit_mount` frame: origin
-- at the kit's mounting plate, x forward, y left, z up (the robot's base_link
-- axes); [x, y, z, roll, pitch, yaw] in metres and radians, one entry per kit
-- sensor (kit_gnss, kit_cam360, kit_lidar).
--
-- chip_id is the manifest's calib_id. The robot caches the kit's frames by
-- (serial, calib_id), so neither the id nor the poses behind it may change: a
-- re-calibrated kit is a new calibration row.

create function public.calibration_kit_mount_valid(p_extrinsics jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_extrinsics is null or not (p_extrinsics ? 'kit_mount') then true
    when jsonb_typeof(p_extrinsics -> 'kit_mount') <> 'object' then false
    else not exists (
      select 1
      from jsonb_each(p_extrinsics -> 'kit_mount') as f (sensor, pose)
      where f.sensor not in ('kit_gnss', 'kit_cam360', 'kit_lidar')
         or jsonb_typeof(f.pose) <> 'array'
         or jsonb_array_length(f.pose) <> 6
         or exists (select 1 from jsonb_array_elements(f.pose) as v (n)
                    where jsonb_typeof(v.n) <> 'number')
    )
  end
$$;

alter table public.calibration
  add column chip_id bigint generated always as identity (minvalue 1 maxvalue 4294967295),
  add constraint calibration_chip_id_key unique (chip_id),
  add constraint calibration_kit_mount_check
    check (public.calibration_kit_mount_valid(extrinsics));

comment on column public.calibration.chip_id is
  'calib_id written to the kit identity chip (uint32); never changes.';
comment on column public.calibration.extrinsics is
  'Free-form sensor poses. kit_mount: {kit_gnss|kit_cam360|kit_lidar: [x, y, z, roll, pitch, yaw]} '
  'in the robot''s kit_mount frame (x forward, y left, z up; m, rad); fixed once written.';

create function public.calibration_chip_fixed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.chip_id is distinct from old.chip_id then
    raise exception 'calibration.chip_id never changes' using errcode = '23514';
  end if;
  if new.extrinsics -> 'kit_mount' is distinct from old.extrinsics -> 'kit_mount' then
    raise exception 'calibration kit_mount poses are fixed; add a new calibration version'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger calibration_chip_fixed
  before update on public.calibration
  for each row execute function public.calibration_chip_fixed();
