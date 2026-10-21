-- Metric registry as reference data (docs/metodoloji.md, Ek B).
--
-- Until now metric_definition rows lived only in supabase/seed.sql, so hosted
-- projects had none. They are created here instead, with the same ids the seed
-- used (md5('orchados-seed:metric:' || code)), so existing references keep
-- working. Rows that already exist (projects loaded with the old seed) are left
-- alone.

insert into public.metric_definition (
  id, code, name, description, unit, value_type, scale_min, scale_max, categories,
  valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, m.unit,
       m.value_type::public.metric_value_type, m.scale_min, m.scale_max, m.categories,
       m.valid_seasons::public.season[], m.card_visibility::public.card_visibility,
       m.subject_kinds::public.measurement_subject[]
from (values
  -- Methodology v0 scales (docs/metodoloji.md, section 4).
  ('dead_branch_scale', 'Kuru dal', '0 none, 1 <10%, 2 10-30%, 3 >30% of the crown. Staff question, AI image, expert.',
   null, 'scale', 0::smallint, 3::smallint, null::text[], '{winter,spring,summer,harvest}', 'shown', '{tree}'),
  ('trunk_base_scale', 'Gövde ve dip', '0-3: wound, cavity, bark loss, gummosis, root suckers. 2+ needs a close-up.',
   null, 'scale', 0, 3, null, '{winter,spring,summer,harvest}', 'shown', '{tree}'),
  ('pruning_status', 'Budama', 'Pruned this season: done, partial, not_done. Care compliance; does not affect the class.',
   null, 'category', null, null, '{done,partial,not_done}', '{winter}', 'shown', '{tree}'),
  ('crown_density_scale', 'Taç doluluğu', '0 normal, 1 slightly sparse, 2 clearly sparse, 3 very sparse. Leafy period only.',
   null, 'scale', 0, 3, null, '{spring,summer}', 'shown', '{tree}'),
  ('frost_damage_scale', 'Don hasarı', '0-3: blackened flowers and young shoots.',
   null, 'scale', 0, 3, null, '{spring}', 'shown', '{tree}'),
  ('pest_sign_severity', 'Zararlı belirtisi', 'Visible pest signs: none, mild (a few branches), marked (crown-wide). Not a diagnosis.',
   null, 'category', null, null, '{none,mild,marked}', '{spring,summer}', 'shown', '{tree}'),
  ('pest_sign_type', 'Zararlı türü', 'Pest suggested by the visible signs: psylla, bud_borer, stink_bug, other.',
   null, 'category', null, null, '{psylla,bud_borer,stink_bug,other}', '{spring,summer}', 'shown', '{tree}'),
  ('fruit_load_scale', 'Meyve yükü', '0-3. Alternate bearing is normal; does not affect the class.',
   null, 'scale', 0, 3, null, '{summer}', 'shown', '{tree}'),
  ('harvest_complete', 'Hasat tamam', 'Harvest of the tree is complete.',
   null, 'boolean', null, null, null, '{harvest}', 'shown', '{tree}'),
  ('branch_break', 'Dal kırığı', 'Broken branch seen.',
   null, 'boolean', null, null, null, '{harvest}', 'shown', '{tree}'),
  ('theft_trace', 'Hırsızlık izi', 'Signs of early picking or theft in the parcel.',
   null, 'boolean', null, null, null, '{harvest}', 'shown', '{parcel}'),
  -- Measured quantities (docs/veri-modeli.md, "Metrik kaydı örnekleri").
  ('crown_diameter', 'Taç çapı', 'LiDAR, photogrammetry.',
   'm', 'numeric', null, null, null, '{spring,summer}', 'shown', '{tree}'),
  ('crown_volume', 'Taç hacmi', 'LiDAR.',
   'm3', 'numeric', null, null, null, '{spring,summer}', 'shown', '{tree}'),
  ('trunk_diameter_h30', 'Gövde çapı (30 cm)', 'Trunk diameter at 30 cm. Tape measure, LiDAR cylinder fit.',
   'cm', 'numeric', null, null, null, '{winter,spring,summer,harvest}', 'shown', '{tree}'),
  ('scaffold_branch_count', 'Ana dal sayısı', 'Expert observation, QSM.',
   'count', 'numeric', null, null, null, '{winter}', 'shown', '{tree}'),
  ('fractal_dimension', 'Fraktal boyut', 'QSM, box counting. Research only.',
   null, 'numeric', null, null, null, '{winter}', 'hidden', '{tree}'),
  ('canopy_temp_delta', 'Taç sıcaklık farkı', 'Thermal. Canopy minus air temperature.',
   'degC', 'numeric', null, null, null, '{summer}', 'under_evaluation', '{tree}')
) as m (code, name, description, unit, value_type, scale_min, scale_max, categories,
        valid_seasons, card_visibility, subject_kinds)
on conflict do nothing;
