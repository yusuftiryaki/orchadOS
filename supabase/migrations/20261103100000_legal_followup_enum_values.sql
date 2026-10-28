-- Legal follow-ups, wave 1 / 1: enum values (docs/hukuk/kararlar.md T03, T04,
-- T18). A separate file: a value added to an enum cannot be used in the
-- transaction that adds it.
--
-- consent_kind early_performance: the optional box of the quote acceptance
--   (H11 (a), contract Md. 8B/4).
-- notification_template contract_ready (T04: the order's contract documents
--   are in Sözleşmelerim), withdrawal_received (T03: confirmation of a
--   withdrawal, H11 (c)), addon_order_closed (T18: an unstarted add-on order
--   cancelled because its period closed, contract 8D/6).

alter type public.consent_kind add value if not exists 'early_performance';

alter type public.notification_template add value if not exists 'contract_ready';
alter type public.notification_template add value if not exists 'withdrawal_received';
alter type public.notification_template add value if not exists 'addon_order_closed';
