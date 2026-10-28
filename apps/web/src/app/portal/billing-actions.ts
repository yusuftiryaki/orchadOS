"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { billingFieldOf, billingReasonOf } from "@/lib/billing/errors";
import { requireSection } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  EXPLICIT_CONSENT_KINDS,
  isExplicitConsentAsked,
  type ExplicitConsentKind,
} from "@/lib/legal/consents";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { formValues, type FormState } from "@/lib/operations/form-state";
import { formReader } from "@/lib/operations/validation";
import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type { Payment } from "@/lib/billing/types";
import {
  getBillingProfile,
  getServicePeriods,
  hasFallbackEmail,
  liveCardAttempt,
} from "@/lib/portal-billing/data";
import { paymentStartError, returnOriginOf, clientIpOf } from "@/lib/portal-billing/payments";
import {
  portalErrorOf,
  portalHref,
  safeBackPath,
  type PortalError,
} from "@/lib/portal-billing/urls";
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

// A demo visitor has no customer profile and writes nothing (docs/demo-turu.md
// §6.3): back to the gardens with "Demoda kapalı" before any call.
async function context() {
  if ((await requireSection("portal")).demo) redirect(portalHref.home({ hata: "demo_read_only" }));
  return createClient();
}

const DEMO_CLOSED: FormState = { error: P.errors.demo_read_only, fieldErrors: {}, values: {} };

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

type Client = Awaited<ReturnType<typeof createClient>>;

// A member (IP14, docs/bahce-yonetimi.md §4.1) adds gardens only while the
// switch is on (§2: otherwise ops cannot quote the add-on, so the portal asks
// the customer to contact the team), and the draft always carries the
// membership's package.
async function memberPeriod(supabase: Client) {
  const { primary } = await getServicePeriods(supabase);
  return primary;
}

// An older draft with another package is corrected once.
// customer_set_application_package rewrites the note too, so the draft's own
// note goes along. Redirects back to the application on an error.
async function alignDraftPackage(supabase: Client, applicationId: string, packageId: string) {
  const { data: draft } = await supabase
    .from("service_application")
    .select(BILLING_COLUMNS.service_application)
    .eq("id", applicationId)
    .maybeSingle();
  if (draft?.status !== "draft" || draft.package_id === packageId) return;
  const { error } = await supabase.rpc("customer_set_application_package", {
    p_application_id: applicationId,
    p_package_id: packageId,
    ...(draft.customer_note ? { p_customer_note: draft.customer_note } : {}),
  });
  if (error) redirect(portalHref.application(applicationId, { hata: billingReasonOf(error) }));
}

export async function createApplicationAction(form: FormData) {
  const supabase = await context();
  const primary = await memberPeriod(supabase);
  if (primary && !primary.garden_changes_enabled) {
    redirect(portalHref.newApplication({ hata: "garden_changes_closed" }));
  }
  const packageId = primary?.package_id ?? idOf(form, "package_id");
  if (!packageId) redirect(portalHref.newApplication({ hata: "invalid_input" }));
  const { data, error } = await supabase.rpc("customer_create_application", {
    p_package_id: packageId,
  });
  if (error || !data) redirect(portalHref.newApplication({ hata: billingReasonOf(error) }));
  if (primary) await alignDraftPackage(supabase, data, primary.package_id);
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(data, { bilgi: "taslak_acildi" }));
}

export async function setPackageAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  // A member's package is locked (IP14): only the note changes.
  const primary = await memberPeriod(supabase);
  const packageId = primary?.package_id ?? idOf(form, "package_id");
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
  if ((await requireSection("portal")).demo) return DEMO_CLOSED;
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

// IP14 (§5.5): one garden leaves a submitted or quoted application; an open
// quote is cancelled and ops quotes again.
export async function withdrawApplicationGardenAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  const gardenId = idOf(form, "garden_id");
  if (!applicationId || !gardenId) redirect(portalHref.applications({ hata: "not_found" }));
  if (formReader(form)("confirm") !== "on") {
    redirect(portalHref.application(applicationId, { hata: "consent_required" }));
  }
  const { error } = await supabase.rpc("customer_withdraw_application_garden", {
    p_garden_id: gardenId,
  });
  if (error) redirect(portalHref.application(applicationId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(applicationId, { bilgi: "bahce_basvurudan_cikarildi" }));
}

export async function submitApplicationAction(form: FormData) {
  const supabase = await context();
  const applicationId = idOf(form, "application_id");
  if (!applicationId) redirect(portalHref.applications({ hata: "not_found" }));
  // A member's draft goes out with the membership's package, even when the
  // customer never saved the locked package form (§4.1).
  const primary = await memberPeriod(supabase);
  if (primary && !primary.garden_changes_enabled) {
    redirect(portalHref.application(applicationId, { hata: "garden_changes_closed" }));
  }
  if (primary) await alignDraftPackage(supabase, applicationId, primary.package_id);
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
  if (error) redirect(go({ hata: portalErrorOf(error) }));
  revalidatePath(back);
  redirect(go({ bilgi: "aydinlatma_kaydedildi" }));
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

// IP14 (§5.5): an order awaiting payment that came from an application is
// cancelled and its application opens again for a new garden list.
export async function reviseOrderAction(form: FormData) {
  const supabase = await context();
  const orderId = idOf(form, "order_id");
  if (!orderId) redirect(portalHref.orders({ hata: "not_found" }));
  if (formReader(form)("confirm") !== "on") {
    redirect(portalHref.order(orderId, { hata: "consent_required" }));
  }
  const { data, error } = await supabase.rpc("customer_revise_order", { p_order_id: orderId });
  if (error || !data) redirect(portalHref.order(orderId, { hata: billingReasonOf(error) }));
  revalidatePath("/portal", "layout");
  redirect(portalHref.application(data, { bilgi: "siparis_duzeltmeye_acildi" }));
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function saveBillingProfileAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await requireSection("portal");
  if (user.demo) return DEMO_CLOSED;
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
  if ((await requireSection("portal")).demo) return DEMO_CLOSED;
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

// Withdrawing is always allowed; granting only a consent that is asked
// (docs/hukuk/kararlar.md H06, H31).
export async function setConsentAction(form: FormData) {
  const supabase = await context();
  const read = formReader(form);
  const kind = read("kind");
  if (!(EXPLICIT_CONSENT_KINDS as readonly string[]).includes(kind)) {
    redirect(portalHref.consents({ hata: "invalid_input" }));
  }
  const granted = read("granted") === "true";
  if (granted && !isExplicitConsentAsked(kind as ExplicitConsentKind)) {
    redirect(portalHref.consents({ hata: "consent_unavailable" }));
  }
  const { error } = await supabase.rpc("customer_set_consent", {
    p_kind: kind,
    p_granted: granted,
    p_text_version: LEGAL_TEXT_VERSIONS.explicit_consent,
  });
  // The database refuses an unasked consent too (consent_not_asked, T27).
  if (error) redirect(portalHref.consents({ hata: portalErrorOf(error) }));
  revalidatePath(portalHref.consents());
  redirect(portalHref.consents({ bilgi: "izin_kaydedildi" }));
}
