"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { maskPhone } from "@/lib/notifications/phone";
import { formReader, normalizePhone } from "@/lib/operations/validation";
import { completeSignup, registerCustomer } from "@/lib/signup/client";
import { sendAccountCode } from "@/lib/signup/send-code";
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

// The visitor's address as seen by our server, passed to the function for
// its rate limit (design §7.1, step 3). The platform's proxy sets the header.
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

// Sends an SMS code to the account's phone. Returns an error text or null.
// `hideUnknown`: a number without an account gets the same answer as one
// with an account, as on /giris (the resend intent takes the number from the
// form, so it must not tell whether a number is registered).
async function sendCode(
  supabase: Client,
  phone: string,
  hideUnknown: boolean,
): Promise<string | null> {
  const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
  if (allowed.data === false) return t.login.phone.locked;
  const reason = await sendAccountCode(supabase, phone);
  if (reason === null) return null;
  if (reason === "not_registered") return hideUnknown ? null : s.errors.failed;
  return t.login.phone[reason];
}

function codeStep(previous: SignupState, phone: string): SignupState {
  return {
    ...previous,
    step: "code",
    phone,
    sentAt: Date.now(),
    fieldErrors: {},
    notice: s.codeSent(maskPhone(phone)),
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

  // Turnstile puts its token into this field of the surrounding form.
  const captchaToken = formReader(form)("cf-turnstile-response") || null;
  if (flags.turnstileSiteKey && !captchaToken) {
    return { ...base, fieldErrors: {}, error: s.captchaMissing };
  }

  const supabase = await createClient();
  const result = await registerCustomer(supabase, parsed.value, await clientIp(), captchaToken);
  if (!result.ok) {
    const field = SIGNUP_FIELDS.find((f) => f === result.field);
    return {
      ...base,
      fieldErrors: field ? { [field]: fieldMessage(field, "invalid") } : {},
      error: s.errors[result.error],
    };
  }

  const error = await sendCode(supabase, parsed.value.phone, false);
  if (error) return { ...base, fieldErrors: {}, error };
  return codeStep({ ...base, fieldErrors: {} }, parsed.value.phone);
}

function codePhone(form: FormData): string | null {
  const phone = normalizePhone(formReader(form)("phone"));
  return phone && phone !== "invalid" && TR_MOBILE.test(phone) ? phone : null;
}

async function resend(previous: SignupState, form: FormData): Promise<SignupState> {
  const phone = codePhone(form);
  if (!phone) return { ...previous, step: "form", error: s.errors.invalid_input, notice: null };
  const error = await sendCode(await createClient(), phone, true);
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

  const completed = await completeSignup(supabase);
  redirect(completed.ok && completed.status === "completed" ? "/portal" : "/");
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
