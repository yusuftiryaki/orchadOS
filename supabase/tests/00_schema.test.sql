-- Schema shape: schemas, tables, enums, geometry SRIDs, RLS switched on, triggers, seed basics.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

select has_extension('postgis', 'postgis is installed');
select has_schema('private', 'private schema exists');
select has_schema('authz', 'authz schema exists');

select tables_are(
  'public',
  array[
    'org', 'membership', 'parcel', 'parcel_access', 'boundary', 'slot', 'tree', 'zone',
    'device', 'sensor', 'rig', 'rig_sensor', 'calibration', 'session', 'capture',
    'asset', 'asset_source', 'metric_definition', 'measurement', 'measurement_evidence',
    'assessment', 'assessment_measurement', 'finding', 'finding_evidence', 'operation', 'trunk_label',
    'verification_item', 'session_event', 'parcel_route', 'ai_assessment_detail',
    'question', 'question_reply', 'notification', 'followup_request', 'coverage_report',
    -- Customers and billing (IP12, docs/musteri-yonetimi.md §6.3).
    'org_billing_setting', 'service_package', 'price_list', 'price_list_item', 'service_application',
    'application_garden', 'quote', 'quote_item', 'service_order', 'service_order_item', 'payment',
    'payment_item', 'refund', 'audit_event', 'garden_removal'
  ],
  'public has exactly the MVP tables'
);
select tables_are('private', array['owner_profile', 'parcel_detail', 'message_outbox', 'phone_login_attempt', 'viewer_invitation',
  'billing_profile', 'payment_billing_snapshot', 'consent_record', 'customer_signup', 'signup_attempt',
  'application_garden_detail', 'payment_event', 'document_sequence',
  -- Demo tour registry (IP13, docs/demo-turu.md §5.1).
  'demo_org', 'demo_parcel', 'demo_session', 'demo_attempt',
  -- Legal-text registry (T21) and contract documents (T04); spent
  -- self-hosted captcha challenges (T12).
  'legal_text_version', 'contract_document', 'captcha_spent'], 'private has the personal data tables');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'row level security is enabled on every table in public and private'
);

select is(
  (select count(*) from extensions.geometry_columns where f_table_schema = 'public' and srid <> 4326),
  0::bigint,
  'every geometry column is EPSG:4326'
);

select is(
  (select count(*) from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'id' and c.data_type <> 'uuid'),
  0::bigint,
  'every id column is a uuid'
);

select is(
  (select count(*) from information_schema.tables t
   where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     and t.table_name not in ('org', 'metric_definition')
     and not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'org_id')),
  0::bigint,
  'every tenant table carries org_id'
);

select enum_has_labels('public', 'org_role', array['field_staff', 'expert', 'ops'], 'org roles');
select enum_has_labels('public', 'parcel_role', array['owner', 'viewer'], 'parcel roles');
select enum_has_labels('public', 'slot_kind', array['row', 'interstitial'], 'slot kinds');
select enum_has_labels('public', 'tree_sex', array['female', 'male', 'unknown'], 'tree sex');
select enum_has_labels('public', 'graft_status', array['grafted', 'ungrafted', 'unknown'], 'graft status');
select enum_has_labels('public', 'age_class', array['sapling', 'young', 'productive', 'old', 'unknown'], 'age classes');
select enum_has_labels('public', 'tree_status', array['active', 'lost'], 'tree status');
select enum_has_labels('public', 'measurement_source', array['staff', 'algorithm', 'ai', 'expert'], 'measurement sources');
select enum_has_labels('public', 'metric_value_type', array['numeric', 'scale', 'category', 'boolean'], 'metric value types');

select views_are(
  'public', array['tree_latest_assessment', 'tree_latest_measurement'], 'public has the latest-value views'
);
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  0::bigint,
  'every view in public runs with security_invoker'
);
select is(
  (select public from storage.buckets where id = 'media'), false, 'media bucket exists and is private'
);

select has_trigger('public', 'capture', 'capture_insert_only', 'capture is insert-only');
select has_trigger('public', 'asset', 'asset_insert_only', 'asset is insert-only');
select has_trigger('public', 'measurement', 'measurement_insert_only', 'measurement is insert-only');
select has_trigger('public', 'quote_item', 'quote_item_insert_only', 'quote_item is insert-only');
select has_trigger('public', 'audit_event', 'audit_event_insert_only', 'audit_event is insert-only');
select has_trigger('private', 'consent_record', 'consent_record_insert_only', 'consent_record is insert-only');
select has_trigger('private', 'payment_event', 'payment_event_insert_only', 'payment_event is insert-only');
select has_trigger('private', 'payment_billing_snapshot', 'payment_billing_snapshot_insert_only',
  'payment_billing_snapshot is insert-only');
select has_trigger('public', 'quote', 'quote_guard', 'quotes are frozen');
select has_trigger('public', 'price_list', 'price_list_guard', 'published price lists are frozen');

select has_index('public', 'measurement', 'measurement_tree_metric_time_idx', 'measurement (tree, metric, time) index');

select col_not_null('public', 'measurement', 'method_version', 'measurement carries a method version');
select col_not_null('public', 'asset', 'content_hash', 'asset carries a content hash');

select set_eq(
  'select code from public.metric_definition',
  array['dead_branch_scale', 'trunk_base_scale', 'pruning_status', 'crown_density_scale',
        'frost_damage_scale', 'pest_sign_severity', 'pest_sign_type', 'fruit_load_scale',
        'harvest_complete', 'branch_break', 'theft_trace',
        'crown_diameter', 'crown_volume', 'trunk_diameter_h30',
        'scaffold_branch_count', 'fractal_dimension', 'canopy_temp_delta',
        -- Field app yes/no questions (20261021230000_field_sync).
        'dead_branch_present', 'trunk_damage_present', 'root_sucker_present', 'pruned', 'frost_damage_present',
        'pest_sign_present', 'fruit_present', 'drought_stress_sign', 'theft_sign_present',
        -- Field crew's "Sorun gördüm" mark (20261023130000_bulk_approval).
        'problem_seen',
        -- Pipeline presence check (20261025120200_tree_presence).
        'tree_visible',
        -- Dieback pattern and basal sprouts (20261027130000_tree_stem_dieback_sprouts).
        'basal_sprout_level', 'dieback_pattern', 'dried_leaves_attached',
        -- Close-up questions of methodology v0.1 (20261028120000_closeup_protocol_v01).
        'fresh_cut_present', 'dead_scaffold_present', 'gum_present', 'dead_test_no_buds',
        'dead_test_snaps', 'dead_test_brown_cambium', 'flower_cluster_present', 'pollen_present',
        'shoot_tip_dieback_present', 'honeydew_present', 'sooty_mould_present', 'white_flakes_present',
        'green_fruit_drop_present', 'debris_under_tree_present', 'dry_weeds_present',
        -- Close-up protocol of methodology v0.2 (20261103100800_methodology_v02).
        'dead_test_live_bud', 'early_emptied_cluster_present', 'fence_breach_present'],
  'migrations register the metrics from docs/metodoloji.md (Ek B), docs/veri-modeli.md and the field questions'
);

select results_eq(
  $$ select count(*) from public.slot $$, array[310::bigint], 'seed has 306 row slots + 4 interstitial slots'
);
select results_eq(
  $$ select count(*) from public.tree where status = 'active' $$, array[302::bigint], 'seed has 302 active trees'
);

select * from finish();
rollback;
