"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection } from "@/lib/auth/session";
import { refundKinds } from "@/lib/back-office/data";
import type { BoFormState } from "@/lib/back-office/form-state";
import {
  cancelOrder,
  cancelRefund,
  completeManualRefund,
  createPriceListDraft,
  deletePriceListDraft,
  extendPaymentDue,
  issueParcelQuote,
  issueQuote,
  processRefund,
  publishPriceList,
  recordManualPayment,
  rejectApplication,
  requestRefund,
  resolvePaymentReview,
  resolveRefund,
  revealIdentityNumber,
  savePackage,
  savePriceListDraft,
  saveSetting,
  terminateOrder,
  verifyGarden,
  voidManualPayment,
  type BoMutation,
} from "@/lib/back-office/mutations";
import { boHref, type BoError } from "@/lib/back-office/urls";
import {
  formReader,
  parseIsoDate,
  parseManualPayment,
  parseManualRefund,
  parseNote,
  parsePackage,
  parseParcelQuote,
  parsePriceListDraft,
  parseQuoteTerms,
  parseRefund,
  parseReject,
  parseResolution,
  parseSettings,
  parseVerify,
  type Parsed,
} from "@/lib/back-office/validation";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Server actions of the back office (docs/musteri-yonetimi.md §11). They run
// as the signed-in ops user; the ops_* functions decide what is allowed and
// write the audit log. Form values are personal data: nothing here logs them.

const B = backOfficeText;

async function context() {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  return { user, supabase };
}

const errorText = (error: BoError) =>
  error === "payments_unreachable" ? B.paymentsUnreachable : billingText.errors[error];

// Field names of the forms and of the functions' details → labels; the price
// list editor's per-package fields (unit_<id>, min_<id>, inv_<id>) by kind.
const PRICE_FIELDS: Record<string, string> = {
  unit: "unit_price_kurus",
  min: "minimum_fee_kurus",
  inv: "inventory_fee_kurus",
};
function fieldLabel(field: string): string {
  const kind = /^(unit|min|inv)_/.exec(field)?.[1];
  return B.fields[kind ? PRICE_FIELDS[kind] : field] ?? field;
}

const invalidField = (field: string): BoFormState => ({
  error: `${B.formError} ${B.fieldError(fieldLabel(field))}`,
});

function failed(result: { error: BoError; field?: string }): BoFormState {
  const text = errorText(result.error);
  return { error: result.field ? `${text} ${B.fieldError(fieldLabel(result.field))}` : text };
}

// A parsed form, or the state that names the bad field.
function parsedOr<T>(parsed: Parsed<T>): { value: T } | { state: BoFormState } {
  return parsed.ok ? { value: parsed.value } : { state: invalidField(parsed.field) };
}

// The id of a hidden field, or nothing (then the form was tampered with).
function idOf(read: (name: string) => string, name: string): string | null {
  const id = read(name);
  return isUuid(id) ? id : null;
}

const notFound: BoFormState = { error: billingText.errors.not_found };

function done(path: string): never {
  revalidatePath("/operasyon", "layout");
  redirect(path);
}

// Runs a mutation; on success redirects to `to`, else returns the error.
async function then<T>(
  mutation: Promise<BoMutation<T>>,
  to: (value: T) => string,
): Promise<BoFormState> {
  const result = await mutation;
  if (!result.ok) return failed(result);
  done(to(result.value));
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

// The TCKN once, in this response only; ops_billing_profile writes the audit.
export async function revealIdentityAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { user, supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  const userId = idOf(read, "user_id");
  if (!orgId || !userId) return notFound;
  if (!(await opsOrgs(supabase, user.id)).some((o) => o.id === orgId)) {
    return { error: billingText.errors.forbidden };
  }
  const result = await revealIdentityNumber(supabase, orgId, userId);
  if (!result.ok) return failed(result);
  return { error: null, revealed: result.value };
}

// ---------------------------------------------------------------------------
// Applications and quotes
// ---------------------------------------------------------------------------

export async function verifyGardenAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const applicationId = idOf(read, "application_id");
  const gardenId = idOf(read, "garden_id");
  if (!applicationId || !gardenId) return notFound;
  const parsed = parsedOr(parseVerify(read));
  if ("state" in parsed) return parsed.state;
  return then(verifyGarden(supabase, gardenId, parsed.value), () =>
    boHref.application(applicationId, { notice: "garden_verified" }),
  );
}

export async function issueQuoteAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const applicationId = idOf(read, "application_id");
  if (!applicationId) return notFound;
  const parsed = parsedOr(parseQuoteTerms(read));
  if ("state" in parsed) return parsed.state;
  return then(issueQuote(supabase, applicationId, parsed.value), (quoteId) =>
    boHref.quote(quoteId, { notice: "quote_issued" }),
  );
}

export async function rejectApplicationAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const applicationId = idOf(read, "application_id");
  if (!applicationId) return notFound;
  const parsed = parsedOr(parseReject(read));
  if ("state" in parsed) return parsed.state;
  return then(
    rejectApplication(supabase, applicationId, parsed.value.reason, parsed.value.note),
    () => boHref.application(applicationId, { notice: "application_rejected" }),
  );
}

export async function issueParcelQuoteAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  const customerUserId = idOf(read, "customer_user_id");
  if (!orgId || !customerUserId) return notFound;
  const renewalOf = read("renewal_of_order_id");
  if (renewalOf && !isUuid(renewalOf)) return notFound;
  const parsed = parsedOr(parseParcelQuote(read, form));
  if ("state" in parsed) return parsed.state;
  return then(
    issueParcelQuote(supabase, orgId, customerUserId, parsed.value, renewalOf || null),
    (quoteId) => boHref.quote(quoteId, { notice: "quote_issued" }),
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function recordManualPaymentAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orderId = idOf(read, "order_id");
  if (!orderId) return notFound;
  const parsed = parsedOr(parseManualPayment(read));
  if ("state" in parsed) return parsed.state;
  return then(recordManualPayment(supabase, orderId, parsed.value), () =>
    boHref.order(orderId, { notice: "payment_recorded" }),
  );
}

export async function extendDueAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orderId = idOf(read, "order_id");
  if (!orderId) return notFound;
  const dueOn = parseIsoDate(read("due_on"));
  if (!dueOn) return invalidField("due_on");
  return then(extendPaymentDue(supabase, orderId, dueOn), () =>
    boHref.order(orderId, { notice: "due_extended" }),
  );
}

export async function cancelOrderAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orderId = idOf(read, "order_id");
  if (!orderId) return notFound;
  const note = parsedOr(parseNote(read, false));
  if ("state" in note) return note.state;
  return then(cancelOrder(supabase, orderId, note.value), () =>
    boHref.order(orderId, { notice: "order_cancelled" }),
  );
}

export async function terminateOrderAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orderId = idOf(read, "order_id");
  if (!orderId) return notFound;
  if (read("confirm") !== "on") return invalidField("confirm");
  const note = parsedOr(parseNote(read, true));
  if ("state" in note) return note.state;
  return then(terminateOrder(supabase, orderId, note.value!), () =>
    boHref.order(orderId, { notice: "order_terminated" }),
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function resolveReviewAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const paymentId = idOf(read, "payment_id");
  if (!paymentId) return notFound;
  const parsed = parsedOr(parseResolution(read));
  if ("state" in parsed) return parsed.state;
  return then(resolvePaymentReview(supabase, paymentId, parsed.value), () =>
    boHref.payment(paymentId, { notice: "review_resolved" }),
  );
}

export async function voidManualPaymentAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const paymentId = idOf(read, "payment_id");
  if (!paymentId) return notFound;
  const note = parsedOr(parseNote(read, true));
  if ("state" in note) return note.state;
  return then(voidManualPayment(supabase, paymentId, note.value!), () =>
    boHref.payment(paymentId, { notice: "payment_voided" }),
  );
}

// ops_request_refund, then every card refund it opened goes to the payments
// function, one after the other (docs/musteri-yonetimi.md §8.4). A transfer
// refund waits for ops to pay it back (İadeler).
export async function requestRefundAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const paymentId = idOf(read, "payment_id");
  if (!paymentId) return notFound;
  const parsed = parsedOr(parseRefund(read));
  if ("state" in parsed) return parsed.state;
  const requested = await requestRefund(supabase, paymentId, parsed.value);
  if (!requested.ok) return failed(requested);

  const cards = (await refundKinds(supabase, requested.value)).filter((r) => r.kind !== "manual");
  let unreachable = false;
  let failedAny = false;
  for (const refund of cards) {
    const processed = await processRefund(supabase, refund.id);
    if (!processed.ok) {
      if (processed.error === "payments_unreachable") unreachable = true;
      failedAny = true;
      break;
    }
    if (processed.value.status !== "succeeded") failedAny = true;
  }
  if (unreachable) done(boHref.payment(paymentId, { error: "payments_unreachable" }));
  const notice =
    cards.length === 0
      ? "refund_requested"
      : failedAny
        ? "refund_processing_failed"
        : "refund_processed";
  done(boHref.payment(paymentId, { notice }));
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function processRefundAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const refundId = idOf(formReader(form), "refund_id");
  if (!refundId) return notFound;
  const result = await processRefund(supabase, refundId);
  if (!result.ok) return failed(result);
  done(
    boHref.refunds({
      notice: result.value.status === "succeeded" ? "refund_processed" : "refund_processing_failed",
    }),
  );
}

export async function completeManualRefundAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const refundId = idOf(read, "refund_id");
  if (!refundId) return notFound;
  const parsed = parsedOr(parseManualRefund(read));
  if ("state" in parsed) return parsed.state;
  return then(completeManualRefund(supabase, refundId, parsed.value), () =>
    boHref.refunds({ notice: "refund_completed" }),
  );
}

export async function cancelRefundAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const refundId = idOf(read, "refund_id");
  if (!refundId) return notFound;
  const note = parsedOr(parseNote(read, false));
  if ("state" in note) return note.state;
  return then(cancelRefund(supabase, refundId, note.value), () =>
    boHref.refunds({ notice: "refund_cancelled" }),
  );
}

export async function resolveRefundAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const refundId = idOf(read, "refund_id");
  if (!refundId) return notFound;
  const parsed = parsedOr(parseResolution(read));
  if ("state" in parsed) return parsed.state;
  return then(resolveRefund(supabase, refundId, parsed.value), () =>
    boHref.refunds({ notice: "refund_resolved" }),
  );
}

// ---------------------------------------------------------------------------
// Prices and settings
// ---------------------------------------------------------------------------

export async function savePackageAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  if (!orgId) return notFound;
  const id = read("id");
  if (id && !isUuid(id)) return notFound;
  const parsed = parsedOr(parsePackage(read));
  if ("state" in parsed) return parsed.state;
  return then(savePackage(supabase, orgId, parsed.value), () =>
    boHref.prices({ notice: "package_saved" }),
  );
}

export async function createDraftAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  if (!orgId) return notFound;
  const copyFrom = read("copy_from_id");
  if (copyFrom && !isUuid(copyFrom)) return notFound;
  return then(createPriceListDraft(supabase, orgId, copyFrom || null), (id) =>
    boHref.priceList(id, { notice: "draft_created" }),
  );
}

export async function saveDraftAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const listId = idOf(read, "price_list_id");
  if (!listId) return notFound;
  const packageIds = form
    .getAll("package_ids")
    .filter((v): v is string => typeof v === "string" && isUuid(v));
  const parsed = parsedOr(parsePriceListDraft(read, packageIds));
  if ("state" in parsed) return parsed.state;
  return then(savePriceListDraft(supabase, listId, parsed.value), () =>
    boHref.priceList(listId, { notice: "draft_saved" }),
  );
}

export async function publishDraftAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const listId = idOf(read, "price_list_id");
  if (!listId) return notFound;
  if (read("confirm") !== "on") return invalidField("confirm");
  return then(publishPriceList(supabase, listId), () =>
    boHref.priceList(listId, { notice: "price_list_published" }),
  );
}

export async function deleteDraftAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const listId = idOf(formReader(form), "price_list_id");
  if (!listId) return notFound;
  return then(deletePriceListDraft(supabase, listId), () =>
    boHref.prices({ notice: "draft_deleted" }),
  );
}

export async function saveSettingsAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  if (!orgId) return notFound;
  const parsed = parsedOr(parseSettings(read));
  if ("state" in parsed) return parsed.state;
  return then(saveSetting(supabase, orgId, parsed.value), () =>
    boHref.settings({ notice: "settings_saved" }),
  );
}
