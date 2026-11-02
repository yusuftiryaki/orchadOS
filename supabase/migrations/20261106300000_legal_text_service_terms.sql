-- Maintenance-service addendum (docs/hukuk/kararlar.md H37): the mowing terms
-- (docs/hukuk/bakim-hizmeti-ek-sozlesme-taslagi.md, site /bakim-hizmeti)
-- become a registered legal text of their own kind, service_terms, so a
-- service request can record the version and template hash it accepted
-- (apps/web/src/lib/legal/text-hash.ts). No new table.

alter table private.legal_text_version drop constraint legal_text_version_kind_check;
alter table private.legal_text_version add constraint legal_text_version_kind_check check (kind in (
  'kvkk_notice', 'explicit_consent', 'privacy', 'distance_sales', 'pre_information', 'refund_policy',
  'field_notice', 'early_performance', 'service_terms'));

select private.register_legal_text('service_terms', 'bakim-v1-taslak',
  '0f035f809af3bc20d4617825ef6709d9329ee4ba2c3cf7b4380dba7672ecf493');
