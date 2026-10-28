"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { billingFieldOf, billingReasonOf } from "@/lib/billing/errors";
import { requireSection } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { formValues, type FormState } from "@/lib/operations/form-state";
import { formReader } from "@/lib/operations/validation";
import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type { Payment } from "@/lib/billing/types";
import { getBillingProfile, hasFallbackEmail, liveCardAttempt } from "@/lib/portal-billing/data";
import { paymentStartError, returnOriginOf, clientIpOf } from "@/lib/portal-billing/payments";
import { portalHref, safeBackPath, type PortalError } from "@/lib/portal-billing/urls";
import {
  parseBillingProfileForm,
  parseContactForm,
  parseGardenForm,
  parseNote,
  type PortalFieldError,
} from "@/lib/portal-billing/validation";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

// Server actions of the customer portal's billing screens (IP12-D). They run
// as the signed-in customer; the customer_* functions decide what is allowed
// and answer with a reason code (docs/musteri-yonetimi.md §6.10). Plain forms
// redirect with `?bilgi=` / `?hata=`; the forms that keep typed values use
// useActionState. Form values are personal data and are never logged.

async function context() {
  await requireSection("portal");
  return createClient();
}

function idOf(form: FormData, name: string): string {
  const value = formReader(form)(name);
  return isUuid(value) ? value : "";
}

const fieldText = (field: string, error: PortalFieldError) =>
  P.fieldErrorOverrides[field]?.[error] ?? P.fieldErrors[error];

function invalid(form: FormData, errors: Partial<Record<string, PortalFieldError>>): FormState {
  return {
    error: P.formError,
    fieldErrors: Object.fromEntries(
      Object.entries(errors).map(([field, error]) => [field, fieldText(field, error!)]),
    ),
    values: formValues(form),
  };
}

// A database error of a form: an invalid_input that names a field goes next to
// that field; any other code above the form.
function failed(
  form: FormData,
  error: { code?: string; message?: string; details?: string | null },
  fieldMap: Record<string, string> = {},
): FormState {
  const reason = billingReasonOf(error);
  const dbField = billingFieldOf(error);
  const field = dbField ? (fieldMap[dbField] ?? dbField) : undefined;
  if (reason === "boundary_invalid") {
    return {
      error: P.formError,
      fieldErrors: { boundary: P.errors.boundary_invalid },
      values: formValues(form),
    };
  }
  if (reason === "invalid_input" && field) {
    return {
      error: P.formError,
      fieldErrors: { [field]: fieldText(field, "invalid") },
      values: formValues(form),
    };
  }
  return { error: P.errors[reason], fieldErrors: {}, values: formValues(form) };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function createApplicationAction(form: FormData) {
  const supabase = await context();
  const packageId = idOf(form, "package_id");
  if (!packageId) redirect(portalHref.newApplication({ hata: "invalid_input" }));
  const { data, error } = await supabase.rpc("customer_create_application", {
    p_package_id: packageId,
  });
  if (error || !data) redirect(portalHref.newApplication({ hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(data, { bilgi: "taslak_acildi" }));
}

export async function setPackageAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  const packageId = idOf(form, "package_id");
  const note = parseNote(formReader(form)("customer_note"));
  if (!applicationId) redirect(portalHref.applications({ hata: "not_found" }));
  if (!packageId || note === "too_long") {
    redirect(portalHref.application(applicationId, { hata: "invalid_input" }));
  }
  const { error } = await supabase.rpc("customer_set_application_package", {
    p_application_id: applicationId,
    p_package_id: packageId,
    ...(note ? { p_customer_note: note } : {}),
  });
  if (error) redirect(portalHref.application(applicationId, { hata: billingReasonOf(error) }));
  revalidatePath(portalHref.application(applicationId));
  redirect(portalHref.application(applicationId, { bilgi: "paket_kaydedildi" }));
}

export async function saveGardenAction(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  const gardenId = idOf(form, "garden_id");
  if (!applicationId) return { error: P.errors.not_found, fieldErrors: {}, values: {} };
  const parsed = parseGardenForm(formReader(form));
  if (!parsed.ok) return invalid(form, parsed.errors);

  const { error } = await supabase.rpc("customer_save_application_garden", {
    p_application_id: applicationId,
    p_garden: parsed.value.garden,
    p_detail: parsed.value.detail,
    ...(gardenId ? { p_garden_id: gardenId } : {}),
  });
  if (error) return failed(form, error, P.dbFields);
  revalidatePath(portalHref.application(applicationId));
  redirect(portalHref.application(applicationId, { bilgi: "bahce_kaydedildi" }));
}

export async function removeGardenAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  const gardenId = idOf(form, "garden_id");
  if (!applicationId || !gardenId) redirect(portalHref.applications({ hata: "not_found" }));
  const { error } = await supabase.rpc("customer_remove_application_garden", {
    p_garden_id: gardenId,
  });
  if (error) redirect(portalHref.application(applicationId, { hata: billingReasonOf(error) }));
  revalidatePath(portalHref.application(applicationId));
  redirect(portalHref.application(applicationId, { bilgi: "bahce_silindi" }));
}

export async function submitApplicationAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  if (!applicationId) redirect(portalHref.applications({ hata: "not_found" }));
  const { error } = await supabase.rpc("customer_submit_application", {
    p_application_id: applicationId,
  });
  if (error) {
    const reason = billingReasonOf(error);
    const missing = reason === "application_incomplete" ? billingFieldOf(error) : undefined;
    redirect(portalHref.application(applicationId, { hata: reason, eksik: missing }));
  }
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(applicationId, { bilgi: "basvuru_gonderildi" }));
}

export async function withdrawApplicationAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  if (!applicationId) redirect(portalHref.applications({ hata: "not_found" }));
  const { error } = await supabase.rpc("customer_withdraw_application", {
    p_application_id: applicationId,
  });
  if (error) redirect(portalHref.application(applicationId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(applicationId, { bilgi: "basvuru_geri_cekildi" }));
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

// The KVKK notice acknowledgement (customer_set_consent accepts only
// granted = true for it). Returns to the quote or the consents page.
export async function acknowledgeKvkkAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const back = safeBackPath(read("geri")) ?? portalHref.consents();
  const go = (r: { bilgi?: "aydinlatma_kaydedildi"; hata?: PortalError }) =>
    `${back}${back.includes("?") ? "&" : "?"}${r.bilgi ? `bilgi=${r.bilgi}` : `hata=${r.hata}`}`;
  if (read("kvkk_notice") !== "on") redirect(go({ hata: "consent_required" }));
  const { error } = await supabase.rpc("customer_set_consent", {
    p_kind: "kvkk_notice",
    p_granted: true,
    p_text_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
  });
  if (error) redirect(go({ hata: billingReasonOf(error) }));
  revalidatePath(back);
  redirect(go({ bilgi: "aydinlatma_kaydedildi" }));
}

export async function acceptQuoteAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const quoteId = idOf(form, "quote_id");
  if (!quoteId) redirect(portalHref.home({ hata: "not_found" }));
  if (read("distance_sales") !== "on" || read("pre_information") !== "on") {
    redirect(portalHref.quote(quoteId, { hata: "onay_eksik" }));
  }
  const { data, error } = await supabase.rpc("customer_accept_quote", {
    p_quote_id: quoteId,
    p_consents: {
      distance_sales: LEGAL_TEXT_VERSIONS.distance_sales,
      pre_information: LEGAL_TEXT_VERSIONS.pre_information,
    },
  });
  if (error || !data) redirect(portalHref.quote(quoteId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.order(data, { bilgi: "teklif_kabul_edildi" }));
}

export async function declineQuoteAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const quoteId = idOf(form, "quote_id");
  if (!quoteId) redirect(portalHref.home({ hata: "not_found" }));
  const revision = read("intent") === "revise";
  const note = parseNote(read("note"));
  if (note === "too_long") redirect(portalHref.quote(quoteId, { hata: "invalid_input" }));
  const { error } = await supabase.rpc("customer_decline_quote", {
    p_quote_id: quoteId,
    p_request_revision: revision,
    ...(note ? { p_note: note } : {}),
  });
  if (error) redirect(portalHref.quote(quoteId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.quote(quoteId, { bilgi: revision ? "revize_istendi" : "teklif_reddedildi" }));
}

// ---------------------------------------------------------------------------
// Orders and payments
// ---------------------------------------------------------------------------

// Card payment: the `payments` Edge Function opens a payment attempt and the
// provider's checkout (docs/musteri-yonetimi.md §8.4); the browser goes there.
// The provider sends it back through payment-callback to /portal/odeme/<id>.
export async function startPaymentAction(form: FormData) {
  const supabase = await context();
  const orderId = idOf(form, "order_id");
  if (!orderId) redirect(portalHref.orders({ hata: "not_found" }));
  if (!siteFlags().paymentsEnabled)
    redirect(portalHref.order(orderId, { hata: "payments_disabled" }));

  // A live card attempt (another tab, or one in fraud review) must settle
  // first: a second attempt could charge the customer twice.
  const { data: attempts, error: attemptsError } = await supabase
    .from("payment")
    .select(BILLING_COLUMNS.payment)
    .eq("order_id", orderId);
  if (attemptsError) redirect(portalHref.order(orderId, { hata: "write_failed" }));
  const live = liveCardAttempt((attempts ?? []) as Payment[]);
  if (live) redirect(portalHref.payment(live.id, { hata: "payment_in_progress" }));

  const h = await headers();
  const returnOrigin = returnOriginOf(h);
  if (!returnOrigin) redirect(portalHref.order(orderId, { hata: "invalid_input" }));
  const { data, error } = await supabase.functions.invoke<{
    payment_id: string;
    redirect_url: string;
  }>("payments", {
    body: {
      action: "start",
      order_id: orderId,
      return_origin: returnOrigin,
      client_ip: clientIpOf(h),
    },
  });
  if (error || !data?.redirect_url) {
    redirect(portalHref.order(orderId, { hata: await paymentStartError(error) }));
  }
  redirect(data.redirect_url);
}

export async function cancelOrderAction(form: FormData) {
  const supabase = await context();
  const orderId = idOf(form, "order_id");
  if (!orderId) redirect(portalHref.orders({ hata: "not_found" }));
  const { error } = await supabase.rpc("customer_cancel_order", { p_order_id: orderId });
  if (error) redirect(portalHref.order(orderId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.order(orderId, { bilgi: "siparis_iptal_edildi" }));
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function saveBillingProfileAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireSection("portal");
  const supabase = await createClient();
  const current = await getBillingProfile(supabase);
  if (!current) return { error: P.errors.not_customer, fieldErrors: {}, values: {} };
  const parsed = parseBillingProfileForm(formReader(form), {
    identityRequired: current.identityNumberRequired,
    hasIdentity: !!current.identityNumberMasked,
    emailRequired: !(await hasFallbackEmail(supabase, user.email)),
  });
  // The TCKN is never sent back to the browser, not even after an error.
  const keep = (state: FormState): FormState => ({
    ...state,
    values: { ...state.values, identity_number: "" },
  });
  if (!parsed.ok) return keep(invalid(form, parsed.errors));
  const { error } = await supabase.rpc("customer_save_billing_profile", {
    p_profile: { ...parsed.value },
  });
  if (error) return keep(failed(form, error));
  revalidatePath("/portal", "layout");
  const back = safeBackPath(formReader(form)("geri"));
  redirect(back ?? portalHref.billing(null, { bilgi: "fatura_kaydedildi" }));
}

export async function saveContactAction(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await context();
  const parsed = parseContactForm(formReader(form));
  if (!parsed.ok) return invalid(form, parsed.errors);
  const { error } = await supabase.rpc("customer_update_contact", {
    p_full_name: parsed.value.fullName,
    p_email: parsed.value.email ?? "",
    p_contact_preference: parsed.value.contactPreference,
  });
  if (error) return failed(form, error);
  revalidatePath(portalHref.account());
  redirect(portalHref.account({ bilgi: "iletisim_kaydedildi" }));
}

const EXPLICIT = ["explicit_service_improvement", "explicit_marketing"] as const;

export async function setConsentAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const kind = read("kind");
  if (!(EXPLICIT as readonly string[]).includes(kind)) {
    redirect(portalHref.consents({ hata: "invalid_input" }));
  }
  const { error } = await supabase.rpc("customer_set_consent", {
    p_kind: kind,
    p_granted: read("granted") === "true",
    p_text_version: LEGAL_TEXT_VERSIONS.explicit_consent,
  });
  if (error) redirect(portalHref.consents({ hata: billingReasonOf(error) }));
  revalidatePath(portalHref.consents());
  redirect(portalHref.consents({ bilgi: "izin_kaydedildi" }));
}
