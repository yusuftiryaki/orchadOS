-- LiDAR measurements on the owner's report card (docs/lidar-olcumleri.md §9).
--
-- Owner decision (5 Nov 2026): the crown and pruning measurements are shown to
-- the owner now; validation against hand measurements follows in the pilot
-- (docs/lidar-olcumleri.md §7) and no expert step is required for them.
--
-- 1. card_visibility shown for tree_height and pruning_cut_count (crown_diameter,
--    crown_volume, scaffold_branch_count and pruning_status were shown already).
--    The removed wood volume and fraction stay under_evaluation: they are
--    biased low (docs/lidar-olcumleri.md §5.2); size_class stays a hidden
--    proposal; wood_volume and fractal_dimension stay research.
-- 2. New hidden metric crown_base_height: the height of the crown base, written
--    by the crown stage so the portal can draw the crown on the tree photos and
--    in the tour. Owners read every measurement of a published visit (RLS does
--    not look at card_visibility), so hidden is enough for the drawing.
-- 3. private.lidar_method_metrics() accepts crown_base_height for lidar_crown.

update public.metric_definition
set card_visibility = 'shown'
where code in ('tree_height', 'pruning_cut_count');

insert into public.metric_definition (
  id, code, name, description, unit, value_type, valid_seasons, card_visibility, subject_kinds
)
values (
  md5('orchados-seed:metric:crown_base_height')::uuid, 'crown_base_height', 'Taç tabanı yüksekliği',
  'Height of the crown base above the ground under the tree (lidar_crown). Used to draw the crown '
  'on photos and in the tour; not a card value.',
  'm', 'numeric', '{winter,spring,summer,harvest}', 'hidden', '{tree}'
)
on conflict do nothing;

create or replace function private.lidar_method_metrics()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "lidar_crown": ["tree_height", "crown_diameter", "crown_volume", "size_class", "crown_base_height"],
    "lidar_qsm": ["scaffold_branch_count", "wood_volume", "fractal_dimension"],
    "lidar_pruning": ["pruned_wood_volume", "pruned_wood_fraction", "pruning_cut_count", "pruning_status"]
  }'::jsonb;
$$;
