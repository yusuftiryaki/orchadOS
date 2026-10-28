// Column lists for every billing table read from the web app
// (docs/musteri-yonetimi.md §6.8). Customer tables hide their internal columns
// with column grants, so `select("*")` fails for API users; read with these
// instead: `.from("quote").select(BILLING_COLUMNS.quote)`. Each list equals the
// columns granted to `authenticated` (checked by the billing-columns
// integration test); keep it in step with the migrations.

// The columns of garden_removal the shared reads select: without the T03
// notice columns (notice_channel, notice_received_on), which only
// latestWithdrawal reads (with a fallback), so the ops removal pages keep
// working against a database without them (one release; PR previews and the
// deploy gap).
export const GARDEN_REMOVAL_READ =
  "id, org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by, reason, customer_note, at_period_end, withdrawal, requested_effective_on, effective_on, access_days, access_until, refund_mode, refund_kurus, calculation, requested_at, scheduled_at, completed_at, cancelled_at, cancelled_by, access_notice_sent_at, access_revoked_at, created_at, updated_at";

export const BILLING_COLUMNS = {
  service_application:
    "id, org_id, customer_user_id, number, status, package_id, customer_note, rejection_reason, submitted_at, decided_at, created_at, updated_at",
  application_garden:
    "id, org_id, application_id, customer_user_id, sort_order, name, province, district, village, declared_area_m2, irrigation, estimated_tree_count, position, position_uncertainty_m, boundary, verified_area_m2, verified_at, parcel_id, created_at, updated_at, withdrawn_at",
  quote:
    "id, org_id, customer_user_id, application_id, renewal_of_order_id, number, status, price_list_id, price_list_version, package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year, vat_rate_bp, discount_bp, discount_note, base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus, currency, inputs, proposed_service_start, valid_until, note_to_customer, issued_at, decided_at, created_at, updated_at, addon_of_order_id",
  quote_item:
    "id, org_id, quote_id, customer_user_id, line_no, application_garden_id, parcel_id, garden_name, area_m2, billable_area_tenths, visits, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, visit_amount_kurus, line_base_kurus, line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus, created_at",
  service_order:
    "id, org_id, customer_user_id, quote_id, number, status, total_kurus, paid_kurus, refunded_kurus, currency, payment_due_at, reminder_sent_at, service_start, service_end, activated_at, completed_at, cancelled_at, cancel_reason, terminated_at, renewal_of_order_id, created_at, updated_at, addon_of_order_id",
  service_order_item:
    "id, org_id, order_id, customer_user_id, quote_item_id, line_no, garden_name, amount_kurus, parcel_id, created_at, updated_at, removed_on, garden_removal_id",
  payment:
    "id, org_id, order_id, customer_user_id, provider, status, amount_kurus, provider_amount_kurus, paid_kurus, refunded_kurus, currency, installment, token_expires_at, provider_payment_id, card_association, card_family, card_last4, fraud_status, failure_code, receipt_number, bank_reference, value_date, initiated_at, succeeded_at, failed_at, voided_at, created_at, updated_at",
  payment_item:
    "id, org_id, payment_id, customer_user_id, line_no, order_item_id, name, amount_kurus, provider_item_id, refunded_kurus, created_at, updated_at",
  refund:
    "id, org_id, payment_id, order_id, customer_user_id, payment_item_id, number, kind, status, amount_kurus, currency, reason, requested_at, attempts, processing_since, processed_at, provider_ref, failure_code, retryable, bank_reference, completed_on, created_at, updated_at, garden_removal_id",
  service_package:
    "id, org_id, code, name, description, periodic_visits_per_year, includes_inventory, active, sort_order, created_at, updated_at",
  price_list:
    "id, org_id, version, status, valid_from, currency, vat_rate_bp, note, created_by, published_by, published_at, created_at, updated_at",
  price_list_item:
    "id, org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, created_at, updated_at",
  org_billing_setting:
    "org_id, accepts_signups, allow_fake_payments, identity_number_required, legal_name, tax_office, tax_number, mersis_number, address, phone, email, bank_name, iban, iban_holder, payment_due_days, quote_valid_days, renewal_notice_days, updated_by, created_at, updated_at, garden_changes_enabled, addon_min_days, removal_notice_days, removal_access_days, removal_refund_mode, marketing_consent_enabled, kep_address, site_domain, kvkk_email, inventory_reuse_months, legal_gate_enforced, coowner_notice_flow_enabled, boundary_declaration_required, kvkk_request_form_enabled",
  audit_event:
    "id, org_id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at",
  // IP14 (docs/bahce-yonetimi.md §9.5): without the internal ops_note,
  // requested_by, decided_by, blocked_reason and revoke_all_access (ops reads
  // them through ops_garden_removals and ops_garden_removal_preview).
  garden_removal: `${GARDEN_REMOVAL_READ}, notice_channel, notice_received_on`,
} as const;

export type BillingTable = keyof typeof BILLING_COLUMNS;
