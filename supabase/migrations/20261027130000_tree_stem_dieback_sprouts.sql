-- Three things that were squeezed into the "multi_stem" verification reason
-- (docs/metodoloji.md, sections 3 and 4.9-4.10; expert agent proposal of
-- 27 October 2026, awaiting the pilot expert):
-- - stem_form: a fixed property of the tree, set in the inventory;
-- - basal_sprout_level: root/base suckers, a visit measurement (care);
-- - dieback_pattern + dried_leaves_attached: how the dead wood is spread over
--   the crown, a visit measurement. How much is dead stays dead_branch_scale.

create type public.stem_form as enum ('single', 'multi', 'unknown');

alter table public.tree add column stem_form public.stem_form not null default 'unknown';
comment on column public.tree.stem_form is
  'single or multi trunk from the base; set by the office in the inventory, corrected by the expert.';

insert into public.metric_definition (
  id, code, name, description, unit, value_type, scale_min, scale_max, categories,
  valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, null,
       m.value_type::public.metric_value_type, null, null, m.categories,
       m.valid_seasons::public.season[], 'shown', '{tree}'
from (values
  ('basal_sprout_level', 'Dip sürgünü',
   'Thin shoots from the base or the roots: none, few (1-5, below knee height), dense (more, a cluster, above waist height or wrist-thick). Care; does not affect the class.',
   'category', '{none,few,dense}'::text[], '{winter,spring,summer,harvest}'),
  ('dieback_pattern', 'Kuruma deseni',
   'How the dead wood is spread (the amount is dead_branch_scale): none, tip_dieback, one_sided, top_down, top_dead_base_alive. one_sided and top_down raise the class to at least attention.',
   'category', '{none,tip_dieback,one_sided,top_down,top_dead_base_alive}', '{winter,spring,summer,harvest}'),
  ('dried_leaves_attached', 'Dalda asılı kuru yaprak',
   'Dried brown leaves still hanging on the branches in the leafy period: sudden wilting. Raises the class to at least problem.',
   'boolean', null, '{spring,summer,harvest}')
) as m (code, name, description, value_type, categories, valid_seasons)
on conflict do nothing;

-- Root suckers moved to basal_sprout_level.
update public.metric_definition
set description = '0-3: wound, cavity, bark loss, gummosis, root collar. 2+ needs a close-up.'
where code = 'trunk_base_scale'
  and description = '0-3: wound, cavity, bark loss, gummosis, root suckers. 2+ needs a close-up.';
