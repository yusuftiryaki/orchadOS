-- IP14 / 1: notification templates of garden removals (docs/bahce-yonetimi.md
-- §9.2, §10). A separate file: a value added to an enum cannot be used in the
-- transaction that adds it.

alter type public.notification_template add value if not exists 'garden_removal_scheduled';
alter type public.notification_template add value if not exists 'garden_removal_rescheduled';
alter type public.notification_template add value if not exists 'garden_removal_cancelled';
alter type public.notification_template add value if not exists 'garden_removal_completed';
alter type public.notification_template add value if not exists 'garden_access_ending';
