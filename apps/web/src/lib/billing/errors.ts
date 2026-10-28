// Reason codes of the billing functions (docs/musteri-yonetimi.md §6.10). The
// database raises a short code as the message and at most a field name as the
// detail, never a value; here only the code (and the field) is kept, nothing
// is logged. Turkish texts: billingText.errors (i18n/messages/billing.ts).

export const BILLING_ERRORS = [
  // 42501
  "forbidden",
  "demo_read_only",
  // P0002
  "not_found",
  // 22023
  "invalid_input",
  "boundary_invalid",
  "consent_required",
  "item_required",
  // 23505
  "exists",
  // P0001
  "not_customer",
  "application_not_draft",
  "application_not_open",
  "application_incomplete",
  "too_many_gardens",
  "garden_not_verified",
  "no_price_list",
  "package_not_priced",
  "price_list_not_draft",
  "price_list_incomplete",
  "valid_from_in_past",
  "quote_not_open",
  "quote_expired",
  "billing_profile_incomplete",
  "order_not_payable",
  "has_payments",
  "payment_in_progress",
  "order_active",
  "amount_exceeds_balance",
  "refund_exceeds_payment",
  "refund_not_open",
  "fake_payments_disabled",
  "signup_closed",
  "too_many_attempts",
  "state_changed",
  // P0001, IP14 (docs/bahce-yonetimi.md §9.7)
  "no_membership",
  "addon_period_too_short",
  "addon_base_closed",
  "parcel_in_service",
  "parcel_not_reusable",
  "account_garden_limit",
  "garden_withdrawn",
  "last_garden",
  "not_revisable",
  "not_in_service",
  "garden_removal_open",
  "parcel_order_pending",
  "withdrawal_expired",
  "removal_not_open",
  "removal_not_due",
  "garden_changes_closed",
  "parcel_read_only",
  "parcel_removal_scheduled",
  "parcel_removed",
  // P0001, legal follow-ups (docs/musteri-yonetimi.md §6.10, docs/hukuk/kararlar.md
  // T27, T21, T03, T04)
  "consent_not_asked",
  "legal_text_outdated",
  "legal_texts_not_final",
  "withdrawal_period_open",
  "boundary_dispute_open",
  "order_not_active",
  "contract_document_immutable",
  // P0001, wave 3 (docs/hukuk/kararlar.md T05, T07, T06)
  "removal_reason_not_allowed",
  "removal_notice_too_short",
  "postponement_not_allowed",
  "visit_not_planned",
  "proposed_date_outside_window",
  "deemed_done_not_allowed",
  "carry_over_not_allowed",
  "missed_visit_frozen",
  "reconciliation_frozen",
  // 55000
  "payment_not_open",
  // Anything else (network, unexpected database error).
  "write_failed",
] as const;

export type BillingError = (typeof BILLING_ERRORS)[number];

export type BillingResult<T = undefined> =
  { ok: true; value: T } | { ok: false; error: BillingError; field?: string };

const KNOWN = new Set<string>(BILLING_ERRORS);

// PostgREST error → reason, like reasonOf in lib/operations/mutations.ts: row
// level security and privilege denials (42501 without one of our messages)
// are "forbidden", unique violations "exists", anything else "write_failed".
export function billingReasonOf(error: { code?: string; message?: string } | null): BillingError {
  if (!error) return "write_failed";
  const message = error.message ?? "";
  if (KNOWN.has(message)) return message as BillingError;
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505") return "exists";
  return "write_failed";
}

// The field an invalid_input (or application_incomplete, consent_required)
// names in its detail, when it is a plain field name.
export function billingFieldOf(error: { details?: string | null } | null): string | undefined {
  const detail = error?.details ?? "";
  return /^[a-z][a-z0-9_.]{0,63}$/.test(detail) ? detail : undefined;
}
