-- methodology-v0.2 (docs/metodoloji.md, section 2 and 7; expert agent decision
-- in docs/uzman-ajan-onerileri.md, section 6): six visits a year in the
-- "Kapsamlı" package, a new month-to-season calendar (winter November-March,
-- spring April-May, summer June-August, harvest September-October) and a
-- pre-harvest visit in early August that counts as summer.
--
-- The calendar itself lives in code, keyed by the visit's methodology version
-- (apps/web expert/season.ts, the AI worker's methodology.py, the field app's
-- field_task.dart; shared vectors in test-vectors/season.json). This migration
-- changes only the registry, which is not versioned: widening a metric's
-- seasons lets it be entered in more visits and changes no stored value.

-- 1. Seasons of existing metrics ----------------------------------------------

-- The pre-harvest visit (early August, summer under v0.2) looks for theft,
-- broken branches and heaps under the tree, like the harvest visit.
update public.metric_definition
set valid_seasons = array_append(valid_seasons, 'summer'::public.season)
where code in ('theft_trace', 'branch_break', 'debris_under_tree_present')
  and not ('summer'::public.season = any (valid_seasons));

-- A late-March visit is winter under v0.2 and can meet a late frost on swelling
-- buds. Only the expert enters it in winter; the AI worker does not ask for it
-- (AI_SKIP_IN_SEASON in services/ai-worker methodology.py).
update public.metric_definition
set valid_seasons = array_append(valid_seasons, 'winter'::public.season)
where code = 'frost_damage_scale'
  and not ('winter'::public.season = any (valid_seasons));

-- 2. New close-up questions (winter-v0.2, summer-v0.2) -------------------------

-- Same id rule as 20261021180000_metric_registry.sql. Yes/no, hidden on the
-- card, evidence for the expert.
-- Winter dead check: the bud test is asked the positive way ("a plump or
-- swelling bud on any of the three tips?"; yes = alive). The winter-v0.1 code
-- dead_test_no_buds stays for the answers already stored.
-- Summer: the fence question is about the parcel, not a tree: the field app
-- asks it once per visit and stores it without a tree (subject parcel).
insert into public.metric_definition (
  id, code, name, description, unit, value_type, valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, null,
       'boolean'::public.metric_value_type, m.valid_seasons::public.season[],
       'hidden'::public.card_visibility, m.subject_kinds::public.measurement_subject[]
from (values
  ('dead_test_live_bud', 'Kuru testi: canlı tomurcuk var',
   'Field question: a plump or swelling bud on at least one of three branch tips (the tree is alive there).',
   '{winter}', '{tree}'),
  ('early_emptied_cluster_present', 'Erken boşaltılmış salkım sapı var mı',
   'Field question: an emptied cluster stalk on the branch before the harvest (theft sign).',
   '{summer}', '{tree}'),
  ('fence_breach_present', 'Tel ya da çitte yeni geçit var mı',
   'Field question, once per visit: a newly opened gap in the wire or fence of the parcel (theft sign).',
   '{summer}', '{parcel}')
) as m (code, name, description, valid_seasons, subject_kinds)
on conflict do nothing;
