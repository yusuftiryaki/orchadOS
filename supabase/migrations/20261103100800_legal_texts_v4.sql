-- Legal-text registry: the launch price list examples (docs/hukuk/kararlar.md,
-- "Lansman fiyat listesi") bumped the contract, the pre-information form and
-- the refund policy to v4 (apps/web/src/lib/legal/versions.ts; v3 archived in
-- docs/hukuk/arsiv/). Template hashes from apps/web/src/lib/legal/text-hash.ts;
-- the early-performance box text is unchanged and takes the contract's
-- version. The v3 rows keep their hashes: orders accepted under them stay
-- registrable (T04).
select private.register_legal_text('distance_sales', 'mesafeli-v4-taslak',
  '7edaa9ffa577d0538c1930fcf71a1faf561c282802af76ff9c2b59b6db4b7222');
select private.register_legal_text('pre_information', 'onbilgi-v4-taslak',
  '1a77ee0dda45f72f68d1f628603ecff5d2e2ceb9f83adaa0fc9b5ee6da4c1e33');
select private.register_legal_text('refund_policy', 'iade-v4-taslak',
  '67f4e8a122b12dac851dfd8a95f43698263b8d7f231c25c8be9d2f45613b722b');
select private.register_legal_text('early_performance', 'mesafeli-v4-taslak',
  '3745a7686d1205ffcd0af3081d3891b345a297c6fdfbdbf37c7028c09b1c5bb2');
