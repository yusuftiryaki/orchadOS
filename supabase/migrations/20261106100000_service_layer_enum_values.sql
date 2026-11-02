-- IP15 / 1: notification templates of the service layer (docs/MVP.md,
-- Module 6). In a file of their own: a new enum value cannot be used in the
-- transaction that adds it.
--
-- service_scheduled, service_completed, service_cancelled: status changes of
-- a service request the owner made (ref_id: the request). Service messages
-- in the sense of docs/hukuk/kararlar.md H06 (the service bought). There is
-- no recommendation message: offering a new service by SMS is a commercial
-- message and needs İYS consent (H06); the recommendation shows in the
-- portal only.

alter type public.notification_template add value if not exists 'service_scheduled';
alter type public.notification_template add value if not exists 'service_completed';
alter type public.notification_template add value if not exists 'service_cancelled';
