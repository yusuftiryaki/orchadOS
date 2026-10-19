-- Yes/no metrics (field staff answers, docs/veri-modeli.md "Belirsizlik").
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it, and the next migration uses it.

alter type public.metric_value_type add value if not exists 'boolean';
