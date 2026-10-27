-- Close-up questions of methodology v0.1 (docs/metodoloji.md, section 7;
-- expert agent proposal 1.4 and 1.5 of docs/uzman-ajan-onerileri.md, accepted
-- on 27 October 2026). The field app asks what the crew sees or touches, with
-- no farming terms; "göremedim" writes no measurement.
--
-- Same id rule as 20261021180000_metric_registry.sql. Questions that keep
-- their meaning use their existing codes (trunk_damage_present,
-- frost_damage_present, fruit_present, harvest_complete, branch_break); base
-- shoots and dried leaves are answered on the visit metrics basal_sprout_level
-- and dried_leaves_attached with source staff. The v0 question codes stay for
-- the answers already stored.

insert into public.metric_definition (
  id, code, name, description, unit, value_type, valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, null,
       'boolean'::public.metric_value_type, m.valid_seasons::public.season[],
       'hidden'::public.card_visibility, '{tree}'::public.measurement_subject[]
from (values
  -- Winter
  ('fresh_cut_present', 'Yeni kesim yeri var mı', 'Field question: a light, fresh pruning cut (not yet grey) is seen.', '{winter}'),
  ('dead_scaffold_present', 'Kuru kalın dal var mı', 'Field question: a thick (scaffold) branch looks dead.', '{winter,spring,summer,harvest}'),
  ('gum_present', 'Zamk var mı', 'Field question: hardened resin-like drops on the trunk or the base.', '{winter}'),
  -- Winter, dead suspicion: three branch tips from different sides (section 5).
  ('dead_test_no_buds', 'Kuru testi: tomurcuk yok', 'Field question: none of three branch tips has a plump bud.', '{winter}'),
  ('dead_test_snaps', 'Kuru testi: dal kırılıyor', 'Field question: three thin twigs snap instead of bending.', '{winter}'),
  ('dead_test_brown_cambium', 'Kuru testi: kabuk altı kahverengi', 'Field question: under 1 cm of scratched bark all three twigs are brown and dry.', '{winter}'),
  -- Spring
  ('flower_cluster_present', 'Çiçek salkımı var mı', 'Field question: the tree carries flower clusters.', '{spring}'),
  ('pollen_present', 'Polen tozu var mı', 'Field question: touching a cluster leaves yellow dust on the hand (male tree).', '{spring}'),
  ('shoot_tip_dieback_present', 'Ucu kurumuş sürgün var mı', 'Field question: young shoots with a dried tip.', '{spring}'),
  -- Spring and summer: psylla signs.
  ('honeydew_present', 'Yapışkan yaprak var mı', 'Field question: sticky or shiny leaves (honeydew).', '{spring,summer,harvest}'),
  ('sooty_mould_present', 'Siyah is var mı', 'Field question: black sooty coating on the leaves.', '{spring,summer,harvest}'),
  ('white_flakes_present', 'Beyaz pul var mı', 'Field question: white, sugar-like flakes on the leaves or under the tree.', '{summer,harvest}'),
  ('green_fruit_drop_present', 'Dökülmüş yeşil meyve var mı', 'Field question: many green fruits dropped under the tree.', '{summer}'),
  -- Harvest
  ('debris_under_tree_present', 'Ağaç altında yığın var mı', 'Field question: a heap of leaves, stalks or broken twigs under the tree. Not a theft sign on its own.', '{harvest}'),
  ('dry_weeds_present', 'Kuru ot var mı', 'Field question: dry weeds or a heap above knee height around the tree (fire risk).', '{harvest,summer}')
) as m (code, name, description, valid_seasons)
on conflict do nothing;
