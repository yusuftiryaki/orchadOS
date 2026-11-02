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
  'c31fea1a2e1a57e053ff272b75b94460e208686a65da0da0c9ca5a43dcb975ec');
