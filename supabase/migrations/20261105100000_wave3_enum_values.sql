-- Legal follow-ups, wave 3 / 1: enum values (docs/hukuk/kararlar.md H15, H20,
-- H22, H23; T05, T07, T08, T23). A separate file: a value added to an enum
-- cannot be used in the transaction that adds it.
--
-- garden_removal_reason, ops side (H20 (c) as changed by H36, contract Md.
--   12/3 "Şirket'in çıkarması": just causes only): location_misdeclared (the
--   garden's real location differs materially from the application),
--   owner_breach (material or repeated breach of Md. 5), no_authority (no
--   authority of the owner), third_party_objection (Md. 6/4), staff_safety,
--   payment_default (a payment not made despite the Md. 8/6 warning, H35,
--   T30), service_withdrawn_district (the company ends field service in the
--   garden's district for every owner there on the same day), by_agreement
--   (the owner's written consent recorded). transfer and duplicate already
--   exist. There is no "outside the service area" cause (H36).
-- garden_removal_reason, system side (T08, H23: the access flow of every way
--   a contract ends for a garden): period_ended (the order completed without
--   a renewal), order_terminated (ops_terminate_order), pilot_ended (a pilot
--   parcel set passive).
-- notification_template visit_scheduled (T07, contract 8A/1: the visit date
--   at least 3 days ahead, with the /bahcede-bulunanlar link of H01) and
--   garden_transfer_reports (T23, H22: "raporlarınızı indirin" before the exit
--   day of a transfer).

alter type public.garden_removal_reason add value if not exists 'location_misdeclared';
alter type public.garden_removal_reason add value if not exists 'owner_breach';
alter type public.garden_removal_reason add value if not exists 'no_authority';
alter type public.garden_removal_reason add value if not exists 'third_party_objection';
alter type public.garden_removal_reason add value if not exists 'staff_safety';
alter type public.garden_removal_reason add value if not exists 'payment_default';
alter type public.garden_removal_reason add value if not exists 'service_withdrawn_district';
alter type public.garden_removal_reason add value if not exists 'by_agreement';
alter type public.garden_removal_reason add value if not exists 'period_ended';
alter type public.garden_removal_reason add value if not exists 'order_terminated';
alter type public.garden_removal_reason add value if not exists 'pilot_ended';

alter type public.notification_template add value if not exists 'visit_scheduled';
alter type public.notification_template add value if not exists 'garden_transfer_reports';
