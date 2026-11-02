-- Maintenance-service addendum v2 (docs/hukuk/kararlar.md H38): the mowing is
-- done by the Company's autonomous robot (MARABA-I) under staff supervision;
-- staff may finish the parts the robot cannot safely reach; liability covers
-- the robot and the staff; the early-performance box says "İşe başlandığında".
-- Registry row for the new version (template hash from
-- apps/web/src/lib/legal/text-hash.ts). The v1 text is archived
-- (docs/hukuk/arsiv/bakim-hizmeti-ek-sozlesme-taslagi-v1.md) and its row stays,
-- without a hash, as every archived version. Requests made under v1 keep their
-- terms_version; new requests must name the current version.

select private.register_legal_text('service_terms', 'bakim-v2-taslak',
  '62957b5d688da0f23265699401d26a947f4ba4e757e0278dd5409ef0687453f8');

update private.legal_text_version set sha256 = null
where kind = 'service_terms' and not is_current and version = 'bakim-v1-taslak';
