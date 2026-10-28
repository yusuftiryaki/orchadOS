"use server";

import { redirect } from "next/navigation";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { maskPhone } from "@/lib/notifications/phone";
import { captchaRequired, captchaTokenOf } from "@/lib/site/captcha";
import { clientIp } from "@/lib/site/client-ip";
import { formReader, normalizePhone } from "@/lib/operations/validation";
import { completeSignup, registerCustomer } from "@/lib/signup/client";
import { sendAccountCode } from "@/lib/signup/send-code";
import { clearTicket, readTicket, storeTicket, ticketFitsPhone } from "@/lib/signup/ticket";
import { CODE_STEP_MIN_MS, waitAtLeast } from "@/lib/signup/timing";
import {
  parseSignupForm,
  SIGNUP_FIELDS,
  TR_MOBILE,
  type SignupField,
  type SignupFieldError,
} from "@/lib/signup/validation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";
import { INITIAL_VALUES, type SignupState, type SignupValues } from "./signup-state";

// Self-service sign-up (docs/musteri-yonetimi.md §7, web flow): register
// through the customer-signup function, send an SMS code, verify it, complete.
// One action serves both steps (`intent`). Form values, phone numbers and
// codes are never logged and never put into a URL.

const s = siteText.signup;

function fieldMessage(field: SignupField, error: SignupFieldError): string {
  return s.fieldErrorOverrides[field]?.[error] ?? s.fieldErrors[error];
}

function valuesOf(form: FormData): SignupValues {
  const read = formReader(form);
  return {
    full_name: read("full_name"),
    phone: read("phone"),
    email: read("email"),
    contact_preference: read("contact_preference") || INITIAL_VALUES.contact_preference,
    explicit_service_improvement: read("explicit_service_improvement") === "on",
    explicit_marketing: read("explicit_marketing") === "on",
  };
}

// Sends an SMS code to the phone. Returns an error text or null.
// Register answers a registered phone like a new one (docs/hukuk/kararlar.md
// H33), so the code step must not tell them apart either: whether a code went
// out, Auth's per-number limits (which only hit numbers with an account) and
// a failed send all get the same code step; the resend countdown runs on the
// client (sentAt). Every answer takes at least CODE_STEP_MIN_MS.
// The phone confirmation code is asked for only for the pending sign-up this
// browser's register wrote (the ticket, signup_code_allowed); any other
// number only gets a login code, which reaches only its verified owner.
async function sendCode(
  supabase: Client,
  phone: string,
  ticket: string | null,
): Promise<string | null> {
  const started = Date.now();
  try {
    const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
    if (allowed.data === false) return t.login.phone.locked;
    const own = ticket
      ? await supabase.rpc("signup_code_allowed", { p_phone: phone, p_ticket: ticket })
      : null;
    await sendAccountCode(supabase, phone, { confirm: own?.data === true });
    return null;
  } finally {
    await waitAtLeast(started, CODE_STEP_MIN_MS);
  }
}

function codeStep(previous: SignupState, phone: string): SignupState {
  return {
    ...previous,
    step: "code",
    phone,
    sentAt: Date.now(),
    fieldErrors: {},
    notice: s.codeRequested(maskPhone(phone)),
    error: null,
  };
}

async function register(previous: SignupState, form: FormData): Promise<SignupState> {
  const values = valuesOf(form);
  const base: SignupState = { ...previous, step: "form", values, notice: null, error: null };
  const flags = siteFlags();
  if (!flags.signupEnabled) return { ...base, fieldErrors: {}, error: s.errors.signup_closed };

  const parsed = parseSignupForm(formReader(form));
  if (!parsed.ok) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const field of SIGNUP_FIELDS) {
      const error = parsed.errors[field];
      if (error) fieldErrors[field] = fieldMessage(field, error);
    }
    return { ...base, fieldErrors, error: s.formErrors };
  }

  // The widget puts its token into a field of the surrounding form.
  const captchaToken = captchaTokenOf(formReader(form), flags.captchaProvider);
  if (captchaRequired(flags) && !captchaToken) {
    return { ...base, fieldErrors: {}, error: s.captchaMissing };
  }

  const supabase = await createClient();
  const previousTicket = (await readTicket())?.ticket ?? null;
  const result = await registerCustomer(
    supabase,
    parsed.value,
    await clientIp(),
    captchaToken,
    previousTicket,
  );
  if (!result.ok) {
    const field = SIGNUP_FIELDS.find((f) => f === result.field);
    return {
      ...base,
      fieldErrors: field ? { [field]: fieldMessage(field, "invalid") } : {},
      error: s.errors[result.error],
    };
  }

  // Every 200 carries a ticket; a function deployed before tickets sends
  // none, and then no confirmation code is asked for.
  if (result.ticket) await storeTicket(result.ticket, parsed.value.phone);
  else await clearTicket();
  const error = await sendCode(supabase, parsed.value.phone, result.ticket);
  if (error) return { ...base, fieldErrors: {}, error };
  return codeStep({ ...base, fieldErrors: {} }, parsed.value.phone);
}

function codePhone(form: FormData): string | null {
  const phone = normalizePhone(formReader(form)("phone"));
  return phone && phone !== "invalid" && TR_MOBILE.test(phone) ? phone : null;
}

// Only for the phone this browser registered (the ticket cookie is bound to
// it): resend needs no robot check of its own because register, with its
// robot check and rate limits, came first.
async function resend(previous: SignupState, form: FormData): Promise<SignupState> {
  const phone = codePhone(form);
  if (!phone) return { ...previous, step: "form", error: s.errors.invalid_input, notice: null };
  const ticket = await readTicket();
  if (!ticket || !ticketFitsPhone(ticket, phone)) {
    return {
      ...previous,
      step: "form",
      phone: null,
      sentAt: null,
      notice: null,
      error: s.registerAgain,
    };
  }
  const error = await sendCode(await createClient(), phone, ticket.ticket);
  if (error) return { ...previous, error, notice: null };
  return codeStep(previous, phone);
}

async function verify(previous: SignupState, form: FormData): Promise<SignupState> {
  const phone = codePhone(form);
  if (!phone) return { ...previous, step: "form", error: s.errors.invalid_input, notice: null };
  const token = formReader(form)("code").replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(token)) {
    return { ...previous, error: t.login.phone.invalidCode, notice: null };
  }

  const supabase = await createClient();
  const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
  if (allowed.data === false) return { ...previous, error: t.login.phone.locked, notice: null };

  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    const left = await supabase.rpc("phone_login_record_failure", { p_phone: phone });
    return { ...previous, error: t.login.phone.wrongCode(left.data ?? 0), notice: null };
  }

  // A registered phone's owner is now signed in to their own account
  // (already_completed or no_pending): "/" takes them to their section. A
  // pending sign-up must carry this browser's ticket; otherwise the session
  // the code opened belongs to someone else's sign-up (customer-signup
  // deletes it) and is closed here at once.
  const ticket = await readTicket();
  const completed = await completeSignup(supabase, ticket?.ticket ?? "");
  if (!completed.ok) {
    await supabase.auth.signOut();
    return {
      ...previous,
      step: "form",
      phone: null,
      sentAt: null,
      notice: null,
      error: s.errors[completed.error],
    };
  }
  await clearTicket();
  redirect(
    completed.status === "completed" || completed.status === "already_completed" ? "/portal" : "/",
  );
}

export async function signupAction(previous: SignupState, form: FormData): Promise<SignupState> {
  const intent = formReader(form)("intent");
  // The action stays reachable when sign-up is off (/kayit shows the closed
  // card); then no intent sends or checks a code.
  if ((intent === "verify" || intent === "resend") && !siteFlags().signupEnabled) {
    return { ...previous, step: "form", notice: null, error: s.errors.signup_closed };
  }
  switch (intent) {
    case "verify":
      return verify(previous, form);
    case "resend":
      return resend(previous, form);
    case "restart":
      return { ...previous, step: "form", phone: null, sentAt: null, notice: null, error: null };
    default:
      return register(previous, form);
  }
}
