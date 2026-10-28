import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { billingFieldOf, billingReasonOf, type BillingError } from "@/lib/billing/errors";
import type { Json } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import type { BoError } from "./urls";
import type {
  AddonQuoteInput,
  ManualPaymentInput,
  PackageInput,
  ParcelQuoteInput,
  PriceListDraftInput,
  QuoteTermsInput,
  RefundInput,
  RemovalRequestInput,
  RemovalScheduleInput,
  VerifyInput,
} from "./validation";

// Writes of the back office, as the signed-in ops user: the ops_* functions
// decide what is allowed (ops of the org, never on the caller's own customer
// records) and write the audit log. Error messages are reason codes without
// values; only the code and a field name are kept, nothing is logged.

export type BoMutation<T = undefined> =
  { ok: true; value: T } | { ok: false; error: BoError; field?: string };

const ok = <T>(value: T): BoMutation<T> => ({ ok: true, value });

// A function's response → its value (rows, an id; never null on success) or
// the reason code and field.
function result<T>(response: {
  data: T | null;
  error: { code?: string; message?: string; details?: string | null } | null;
}): BoMutation<T> {
  if (!response.error) return ok(response.data as T);
  const error: BillingError = billingReasonOf(response.error);
  const field = billingFieldOf(response.error);
  return field ? { ok: false, error, field } : { ok: false, error };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

// The full TCKN of a customer (audited by the function). Shown once.
export async function revealIdentityNumber(
  supabase: Client,
  orgId: string,
  userId: string,
): Promise<BoMutation<string | null>> {
  const r = result(
    await supabase.rpc("ops_billing_profile", {
      p_org_id: orgId,
      p_user_id: userId,
      p_reveal: true,
    }),
  );
  return r.ok ? ok(r.value[0]?.identity_number ?? null) : r;
}

// ---------------------------------------------------------------------------
// Applications and quotes
// ---------------------------------------------------------------------------

export async function verifyGarden(supabase: Client, gardenId: string, input: VerifyInput) {
  return result(
    await supabase.rpc("ops_verify_application_garden", {
      p_garden_id: gardenId,
      p_verified_area_m2: input.verifiedAreaM2,
      ...(input.boundary ? { p_boundary: input.boundary as Json } : {}),
      ...(input.note ? { p_note: input.note } : {}),
    }),
  );
}

const termArgs = (terms: QuoteTermsInput) => ({
  ...(terms.validDays ? { p_valid_days: terms.validDays } : {}),
  p_discount_bp: terms.discountBp,
  ...(terms.discountNote ? { p_discount_note: terms.discountNote } : {}),
  ...(terms.noteToCustomer ? { p_note_to_customer: terms.noteToCustomer } : {}),
});

export async function issueQuote(supabase: Client, applicationId: string, terms: QuoteTermsInput) {
  return result(
    await supabase.rpc("ops_issue_quote", {
      p_application_id: applicationId,
      ...(terms.proposedServiceStart
        ? { p_proposed_service_start: terms.proposedServiceStart }
        : {}),
      ...termArgs(terms),
    }),
  );
}

export async function issueParcelQuote(
  supabase: Client,
  orgId: string,
  customerUserId: string,
  input: ParcelQuoteInput,
  renewalOfOrderId: string | null,
) {
  return result(
    await supabase.rpc("ops_issue_parcel_quote", {
      p_org_id: orgId,
      p_customer_user_id: customerUserId,
      p_package_id: input.packageId,
      p_parcel_ids: input.parcelIds,
      p_first_year: input.firstYear,
      p_proposed_service_start: input.proposedServiceStart,
      ...(renewalOfOrderId ? { p_renewal_of_order_id: renewalOfOrderId } : {}),
      ...termArgs(input),
    }),
  );
}

export async function rejectApplication(
  supabase: Client,
  applicationId: string,
  reason: string,
  note: string | null,
) {
  return result(
    await supabase.rpc("ops_reject_application", {
      p_application_id: applicationId,
      p_reason: reason,
      ...(note ? { p_note: note } : {}),
    }),
  );
}

// ---------------------------------------------------------------------------
// Garden membership (IP14, docs/bahce-yonetimi.md §4, §9.6)
// ---------------------------------------------------------------------------

// An add-on quote joining a base order: for an application's gardens, or for
// existing parcels (input.parcelIds).
export async function issueAddonQuote(
  supabase: Client,
  baseOrderId: string,
  applicationId: string | null,
  input: AddonQuoteInput,
) {
  return result(
    await supabase.rpc("ops_issue_addon_quote", {
      p_base_order_id: baseOrderId,
      ...(input.parcelIds ? { p_parcel_ids: input.parcelIds } : {}),
      ...(applicationId && !input.parcelIds ? { p_application_id: applicationId } : {}),
      ...(input.proposedServiceStart
        ? { p_proposed_service_start: input.proposedServiceStart }
        : {}),
      ...termArgs(input),
    }),
  );
}

// Links an application garden to the customer's earlier parcel; null unlinks.
export async function linkGardenParcel(
  supabase: Client,
  gardenId: string,
  parcelId: string | null,
) {
  return result(
    await supabase.rpc("ops_link_application_garden_parcel", {
      p_garden_id: gardenId,
      // null unlinks (the generated type has no null).
      p_parcel_id: parcelId as string,
    }),
  );
}

export async function withdrawApplicationGarden(supabase: Client, gardenId: string, note: string) {
  return result(
    await supabase.rpc("ops_withdraw_application_garden", {
      p_garden_id: gardenId,
      p_note: note,
    }),
  );
}

// A removal opened by ops for an order line (scheduled at once; SMS).
export async function requestGardenRemoval(
  supabase: Client,
  orderItemId: string,
  input: RemovalRequestInput,
) {
  return result(
    await supabase.rpc("ops_request_garden_removal", {
      p_order_item_id: orderItemId,
      p_reason: input.reason,
      p_effective_on: input.effectiveOn,
      ...(input.note ? { p_note: input.note } : {}),
      ...(input.accessDays != null ? { p_access_days: input.accessDays } : {}),
      p_revoke_all_access: input.revokeAllAccess,
    }),
  );
}

export async function scheduleGardenRemoval(
  supabase: Client,
  removalId: string,
  input: RemovalScheduleInput,
) {
  return result(
    await supabase.rpc("ops_schedule_garden_removal", {
      p_removal_id: removalId,
      p_effective_on: input.effectiveOn,
      ...(input.note ? { p_note: input.note } : {}),
      ...(input.accessDays != null ? { p_access_days: input.accessDays } : {}),
      ...(input.revokeAllAccess != null ? { p_revoke_all_access: input.revokeAllAccess } : {}),
    }),
  );
}

export async function cancelGardenRemoval(supabase: Client, removalId: string, note: string) {
  return result(
    await supabase.rpc("ops_cancel_garden_removal", { p_removal_id: removalId, p_note: note }),
  );
}

export async function completeGardenRemoval(supabase: Client, removalId: string) {
  return result(await supabase.rpc("ops_complete_garden_removal", { p_removal_id: removalId }));
}

// ---------------------------------------------------------------------------
// Orders and payments
// ---------------------------------------------------------------------------

export async function recordManualPayment(
  supabase: Client,
  orderId: string,
  input: ManualPaymentInput,
) {
  return result(
    await supabase.rpc("ops_record_manual_payment", {
      p_order_id: orderId,
      p_amount_kurus: input.amountKurus,
      p_value_date: input.valueDate,
      p_bank_reference: input.bankReference,
      ...(input.note ? { p_note: input.note } : {}),
    }),
  );
}

export async function extendPaymentDue(supabase: Client, orderId: string, dueOn: string) {
  return result(
    await supabase.rpc("ops_extend_payment_due", { p_order_id: orderId, p_due_on: dueOn }),
  );
}

export async function cancelOrder(supabase: Client, orderId: string, note: string | null) {
  return result(
    await supabase.rpc("ops_cancel_order", {
      p_order_id: orderId,
      ...(note ? { p_note: note } : {}),
    }),
  );
}

export async function terminateOrder(supabase: Client, orderId: string, note: string) {
  return result(await supabase.rpc("ops_terminate_order", { p_order_id: orderId, p_note: note }));
}

export async function voidManualPayment(supabase: Client, paymentId: string, note: string) {
  return result(
    await supabase.rpc("ops_void_manual_payment", { p_payment_id: paymentId, p_note: note }),
  );
}

export async function resolvePaymentReview(
  supabase: Client,
  paymentId: string,
  input: { succeeded: boolean; providerRef: string | null; note: string | null },
) {
  return result(
    await supabase.rpc("ops_resolve_payment_review", {
      p_payment_id: paymentId,
      p_succeeded: input.succeeded,
      p_provider_ref: input.providerRef ?? "",
      ...(input.note ? { p_note: input.note } : {}),
    }),
  );
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function requestRefund(supabase: Client, paymentId: string, input: RefundInput) {
  return result(
    await supabase.rpc("ops_request_refund", {
      p_payment_id: paymentId,
      p_amount_kurus: input.amountKurus,
      p_reason: input.reason,
      ...(input.note ? { p_note: input.note } : {}),
      ...(input.paymentItemId ? { p_payment_item_id: input.paymentItemId } : {}),
    }),
  );
}

export interface ProcessedRefund {
  status: "succeeded" | "failed";
  failureCode: string | null;
}

// A card refund through the payments Edge Function (docs/musteri-yonetimi.md
// §8.4), with the ops user's token. 404 and 5xx (not deployed, provider or
// service down) read as "payments_unreachable".
export async function processRefund(
  supabase: Client,
  refundId: string,
): Promise<BoMutation<ProcessedRefund>> {
  const { data, error } = await supabase.functions.invoke("payments", {
    body: { action: "refund", refund_id: refundId },
  });
  if (!error) {
    const body = data as { status?: unknown; failure_code?: unknown } | null;
    return ok({
      status: body?.status === "succeeded" ? "succeeded" : "failed",
      failureCode: typeof body?.failure_code === "string" ? body.failure_code : null,
    });
  }
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response).status;
    if (status === 401 || status === 403) return { ok: false, error: "forbidden" };
    if (status === 409) return { ok: false, error: "refund_not_open" };
    if (status === 400) return { ok: false, error: "invalid_input" };
    if (status === 404 || status >= 500) return { ok: false, error: "payments_unreachable" };
    return { ok: false, error: "write_failed" };
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return { ok: false, error: "payments_unreachable" };
  }
  return { ok: false, error: "write_failed" };
}

export async function completeManualRefund(
  supabase: Client,
  refundId: string,
  input: { bankReference: string; completedOn: string },
) {
  return result(
    await supabase.rpc("ops_complete_manual_refund", {
      p_refund_id: refundId,
      p_bank_reference: input.bankReference,
      p_completed_on: input.completedOn,
    }),
  );
}

export async function cancelRefund(supabase: Client, refundId: string, note: string | null) {
  return result(
    await supabase.rpc("ops_cancel_refund", {
      p_refund_id: refundId,
      ...(note ? { p_note: note } : {}),
    }),
  );
}

export async function resolveRefund(
  supabase: Client,
  refundId: string,
  input: { succeeded: boolean; providerRef: string | null; note: string | null },
) {
  return result(
    await supabase.rpc("ops_resolve_refund", {
      p_refund_id: refundId,
      p_succeeded: input.succeeded,
      ...(input.providerRef ? { p_provider_ref: input.providerRef } : {}),
      ...(input.note ? { p_note: input.note } : {}),
    }),
  );
}

// ---------------------------------------------------------------------------
// Prices and settings
// ---------------------------------------------------------------------------

export async function savePackage(supabase: Client, orgId: string, input: PackageInput) {
  return result(
    await supabase.rpc("ops_save_package", {
      p_org_id: orgId,
      p_package: input as unknown as Json,
    }),
  );
}

export async function createPriceListDraft(
  supabase: Client,
  orgId: string,
  copyFromId: string | null,
) {
  return result(
    await supabase.rpc("ops_create_price_list_draft", {
      p_org_id: orgId,
      ...(copyFromId ? { p_copy_from_id: copyFromId } : {}),
    }),
  );
}

export async function savePriceListDraft(
  supabase: Client,
  priceListId: string,
  input: PriceListDraftInput,
) {
  return result(
    await supabase.rpc("ops_save_price_list_draft", {
      p_price_list_id: priceListId,
      // An unset start is stored as null (publishing then asks for one).
      p_valid_from: input.validFrom as string,
      p_vat_rate_bp: input.vatRateBp,
      p_note: input.note,
      p_items: input.items as unknown as Json,
    }),
  );
}

export async function publishPriceList(supabase: Client, priceListId: string) {
  return result(await supabase.rpc("ops_publish_price_list", { p_price_list_id: priceListId }));
}

export async function deletePriceListDraft(supabase: Client, priceListId: string) {
  return result(
    await supabase.rpc("ops_delete_price_list_draft", { p_price_list_id: priceListId }),
  );
}

export async function saveSetting(
  supabase: Client,
  orgId: string,
  settings: Record<string, string | number | boolean | null>,
) {
  return result(
    await supabase.rpc("ops_save_billing_setting", { p_org_id: orgId, p_settings: settings }),
  );
}
