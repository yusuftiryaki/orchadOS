-- IP12 / 1: closed value sets of customer acquisition and billing
-- (docs/musteri-yonetimi.md §6.2). The notification template values are added
-- by IP12-A2 in a file of its own (alter type ... add value).

create type public.application_status as enum ('draft', 'submitted', 'quoted', 'accepted', 'rejected', 'withdrawn');
create type public.application_rejection_reason as enum (
  'out_of_service_area', 'area_mismatch', 'not_authorized', 'duplicate', 'capacity', 'other'
);
create type public.quote_status as enum ('issued', 'accepted', 'declined', 'superseded', 'expired', 'cancelled');
create type public.order_status as enum ('awaiting_payment', 'active', 'completed', 'cancelled', 'terminated');
create type public.payment_provider as enum ('iyzico', 'manual', 'fake');
create type public.payment_status as enum ('initiated', 'pending_review', 'succeeded', 'failed', 'expired', 'voided');
create type public.refund_kind as enum ('void', 'refund', 'manual');
create type public.refund_status as enum ('requested', 'processing', 'succeeded', 'failed', 'cancelled');
create type public.refund_reason as enum (
  'withdrawal', 'missed_visit', 'termination', 'overpayment', 'order_closed', 'provider_mismatch', 'goodwill', 'other'
);
create type public.price_list_status as enum ('draft', 'published');
create type public.billing_party_kind as enum ('individual', 'company');
create type public.consent_kind as enum (
  'kvkk_notice', 'explicit_service_improvement', 'explicit_marketing', 'distance_sales', 'pre_information'
);
create type public.consent_source as enum ('signup', 'portal', 'quote_acceptance', 'ops');
