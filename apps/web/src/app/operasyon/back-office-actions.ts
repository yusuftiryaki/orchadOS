"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customerListView, type CustomerListView } from "@/components/back-office/customer-rows";
import { requireSection } from "@/lib/auth/session";
import { listCustomers, membershipOf, refundKinds } from "@/lib/back-office/data";
import type { BoFormState } from "@/lib/back-office/form-state";
import {
  cancelGardenRemoval,
  cancelOrder,
  cancelRefund,
  completeGardenRemoval,
  completeManualRefund,
  createPriceListDraft,
  deletePriceListDraft,
  extendPaymentDue,
  issueAddonQuote,
  issueParcelQuote,
  issueQuote,
  linkGardenParcel,
  processRefund,
  publishPriceList,
  recordManualPayment,
  rejectApplication,
  requestGardenRemoval,
  requestRefund,
  resolvePaymentReview,
  resolveRefund,
  revealIdentityNumber,
  savePackage,
  savePriceListDraft,
  saveSetting,
  scheduleGardenRemoval,
  terminateOrder,
  verifyGarden,
  voidManualPayment,
  withdrawApplicationGarden,
  type BoMutation,
} from "@/lib/back-office/mutations";
import { boHref, type BoError } from "@/lib/back-office/urls";
import {
  addDays,
  formReader,
  parseAddonQuote,
  parseIntInRange,
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
  parseRemovalRequest,
  parseRemovalSchedule,
  parseResolution,
  parseSettings,
  parseVerify,
  type Parsed,
} from "@/lib/back-office/validation";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { listOwnerProfiles, opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
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

// The owners list searched by name, phone or e-mail. The term is personal
// data, so it comes in a POST body and only the masked rows go back; it never
// reaches a URL, the history or an access log.
export async function searchCustomersAction(
  _prev: CustomerListView | null,
  form: FormData,
): Promise<CustomerListView> {
  const { user, supabase } = await context();
  const read = formReader(form);
  const query = read("q").slice(0, 100) || null;
  const orgs = await opsOrgs(supabase, user.id);
  const [list, profiles] = await Promise.all([
    listCustomers(supabase, orgs, query),
    listOwnerProfiles(supabase),
  ]);
  return customerListView(list, profiles, read("kaynak") === "self");
}

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
  // A member gets a separate period only with the explicit checkbox (IP14 §4.4).
  if (read("member") === "1" && read("separate_period") !== "on") {
    return invalidField("separate_period");
  }
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
// Garden membership (IP14, docs/bahce-yonetimi.md §4–§5, §12)
// ---------------------------------------------------------------------------

// An add-on quote: for an application's gardens (application_id) or for
// existing parcels (parcel_ids).
export async function issueAddonQuoteAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const baseOrderId = idOf(read, "base_order_id");
  if (!baseOrderId) return notFound;
  const applicationId = read("application_id");
  if (applicationId && !isUuid(applicationId)) return notFound;
  const parsed = parsedOr(parseAddonQuote(read, form, applicationId ? "application" : "parcels"));
  if ("state" in parsed) return parsed.state;
  return then(
    issueAddonQuote(supabase, baseOrderId, applicationId || null, parsed.value),
    (quoteId) => boHref.quote(quoteId, { notice: "quote_issued" }),
  );
}

// Links an application garden to the customer's earlier parcel, or (empty
// parcel_id) removes the link.
export async function linkGardenAction(_prev: BoFormState, form: FormData): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const applicationId = idOf(read, "application_id");
  const gardenId = idOf(read, "garden_id");
  if (!applicationId || !gardenId) return notFound;
  const parcelId = read("parcel_id");
  if (parcelId && !isUuid(parcelId)) return notFound;
  return then(linkGardenParcel(supabase, gardenId, parcelId || null), () =>
    boHref.application(applicationId, { notice: parcelId ? "garden_linked" : "garden_unlinked" }),
  );
}

export async function withdrawGardenAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const applicationId = idOf(read, "application_id");
  const gardenId = idOf(read, "garden_id");
  if (!applicationId || !gardenId) return notFound;
  const note = parsedOr(parseNote(read, true));
  if ("state" in note) return note.state;
  return then(withdrawApplicationGarden(supabase, gardenId, note.value!), () =>
    boHref.application(applicationId, { notice: "garden_withdrawn" }),
  );
}

// The setting's access days, carried by the form (the database checks again).
const settingDays = (read: (name: string) => string) =>
  parseIntInRange(read("setting_access_days"), 0, 365) ?? 0;

// "Bahçeyi çıkar" on an order line.
export async function requestRemovalAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const itemId = idOf(read, "order_item_id");
  if (!itemId) return notFound;
  const days = { today: todayIn(new Date()), lastDay: parseIsoDate(read("last_day")) };
  const parsed = parsedOr(parseRemovalRequest(read, days, settingDays(read)));
  if ("state" in parsed) return parsed.state;
  return then(requestGardenRemoval(supabase, itemId, parsed.value), (removalId) =>
    boHref.removal(removalId, { notice: "removal_requested" }),
  );
}

// "Tüm bahçeleri çıkar": one removal per garden in service, same day, reason
// and note; the result of each line is reported (no redirect).
export async function removeAllGardensAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const orgId = idOf(read, "org_id");
  const userId = idOf(read, "user_id");
  if (!orgId || !userId) return notFound;
  const parsed = parsedOr(
    parseRemovalRequest(read, { today: todayIn(new Date()), lastDay: null }, settingDays(read)),
  );
  if ("state" in parsed) return parsed.state;
  let gardens;
  try {
    ({ gardens } = await membershipOf(supabase, orgId, userId));
  } catch {
    return { error: billingText.errors.forbidden };
  }
  const inService = gardens.filter((g) => g.state === "in_service" && g.order_item_id);
  if (inService.length === 0) return { error: B.membership.removeAllNone };
  const lines: NonNullable<BoFormState["lines"]> = [];
  for (const g of inService) {
    // A line ending before the day leaves on its own end (removal_last_effective).
    const effectiveOn =
      g.service_end && parsed.value.effectiveOn > g.service_end
        ? addDays(g.service_end, 1)
        : parsed.value.effectiveOn;
    const r = await requestGardenRemoval(supabase, g.order_item_id, {
      ...parsed.value,
      effectiveOn,
    });
    lines.push(
      r.ok
        ? { label: g.garden_name, ok: true, text: B.membership.lineDone(g.order_number) }
        : { label: g.garden_name, ok: false, text: failed(r).error! },
    );
  }
  revalidatePath("/operasyon", "layout");
  return { error: null, lines };
}

export async function scheduleRemovalAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const removalId = idOf(read, "removal_id");
  const requestedOn = parseIsoDate(read("requested_on"));
  if (!removalId || !requestedOn) return notFound;
  const days = { today: todayIn(new Date()), lastDay: parseIsoDate(read("last_day")) };
  const parsed = parsedOr(
    parseRemovalSchedule(read, days, {
      requestedOn,
      reason: read("removal_reason"),
      accessDays: parseIntInRange(read("current_access_days"), 0, 365) ?? -1,
      settingAccessDays: settingDays(read),
    }),
  );
  if ("state" in parsed) return parsed.state;
  return then(scheduleGardenRemoval(supabase, removalId, parsed.value), () =>
    boHref.removal(removalId, { notice: "removal_scheduled" }),
  );
}

export async function completeRemovalAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const removalId = idOf(read, "removal_id");
  if (!removalId) return notFound;
  if (read("confirm") !== "on") return invalidField("confirm");
  return then(completeGardenRemoval(supabase, removalId), () =>
    boHref.removal(removalId, { notice: "removal_completed" }),
  );
}

export async function cancelRemovalAction(
  _prev: BoFormState,
  form: FormData,
): Promise<BoFormState> {
  const { supabase } = await context();
  const read = formReader(form);
  const removalId = idOf(read, "removal_id");
  if (!removalId) return notFound;
  const note = parsedOr(parseNote(read, true));
  if ("state" in note) return note.state;
  return then(cancelGardenRemoval(supabase, removalId, note.value!), () =>
    boHref.removal(removalId, { notice: "removal_cancelled" }),
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
    boHref.prices({ notice: "package_saved" }, orgId),
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
  const read = formReader(form);
  const listId = idOf(read, "price_list_id");
  if (!listId) return notFound;
  const orgId = idOf(read, "org_id");
  return then(deletePriceListDraft(supabase, listId), () =>
    boHref.prices({ notice: "draft_deleted" }, orgId),
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
    boHref.settings({ notice: "settings_saved" }, orgId),
  );
}
