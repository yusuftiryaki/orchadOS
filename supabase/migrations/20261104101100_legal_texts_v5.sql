-- Legal texts v5 (docs/hukuk/kararlar.md H35, H36): the per-visit payment
-- plan and no stated service region in the distance sales contract, the
-- pre-information form and the refund policy. Registry rows for the new
-- versions (template hashes from apps/web/src/lib/legal/text-hash.ts); the
-- v4 texts are archived (docs/hukuk/arsiv/*-v4.md) and their rows stay,
-- without a hash, as every archived version. The early-performance box keeps
-- its wording; its version follows distance_sales.

select private.register_legal_text('distance_sales', 'mesafeli-v5-taslak',
  '89285c71262fcdc421c5710a5644af93057625765202921ffd570372ea414eb9');
select private.register_legal_text('pre_information', 'onbilgi-v5-taslak',
  'b892a7ce0e8234987da13ecf69c1874257ba237719b1c811c4662af619a2d101');
select private.register_legal_text('refund_policy', 'iade-v5-taslak',
  '82e3a856a06da8513a8fab49f3031fa72a2025e2d04bc44b45114551dcf239c3');
select private.register_legal_text('early_performance', 'mesafeli-v5-taslak',
  '3745a7686d1205ffcd0af3081d3891b345a297c6fdfbdbf37c7028c09b1c5bb2');

update private.legal_text_version set sha256 = null
where not is_current and version in ('mesafeli-v4-taslak', 'onbilgi-v4-taslak', 'iade-v4-taslak');
