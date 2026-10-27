-- IP12-A2 / 1: notification templates of the customer account
-- (docs/musteri-yonetimi.md §6.2, §12). A file of its own: a value added with
-- alter type ... add value cannot be used in the transaction that adds it.

alter type public.notification_template add value if not exists 'quote_ready';
alter type public.notification_template add value if not exists 'application_rejected';
alter type public.notification_template add value if not exists 'payment_received';
alter type public.notification_template add value if not exists 'refund_completed';
alter type public.notification_template add value if not exists 'payment_reminder';
