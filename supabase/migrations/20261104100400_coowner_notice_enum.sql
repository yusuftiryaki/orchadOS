-- T15 (H30, H32): the co-owner invitation SMS template. Alone in its file: a
-- new enum value cannot be used in the transaction that adds it
-- (20261104100410_coowner_notice_flow.sql uses it).
alter type public.notification_template add value if not exists 'viewer_invited';
