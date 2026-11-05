"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import { maskPhone } from "@/lib/notifications/phone";
import { normalizePhone } from "@/lib/operations/validation";
import { phoneCodeError, safeNextPath } from "./login-methods";

export interface LoginState {
  error: string | null;
  // The typed address, kept in the field after a refusal.
  email?: string;
}

export async function signInWithPassword(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t.login.missingFields, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t.login.invalidCredentials, email };

  redirect(safeNextPath(formData.get("next")));
}

// Phone login: number -> SMS code (sent by our provider through the Auth
// Send SMS hook, supabase/functions/send-sms) -> verify. Only invited accounts
// get a code (shouldCreateUser: false, sign-ups off). The page does not say
// whether a number is registered. Limits per number live in the database
// (phone_login_* functions). Numbers and codes are never logged.
export interface PhoneState {
  step: "phone" | "code";
  // E.164, carried in a hidden field between the two steps.
  phone: string | null;
  // When the last code was requested (ms), for the resend countdown.
  sentAt: number | null;
  notice: string | null;
  error: string | null;
}

export async function requestPhoneCode(
  previous: PhoneState,
  formData: FormData,
): Promise<PhoneState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (phone === null || phone === "invalid") {
    return { ...previous, error: t.login.phone.invalidNumber, notice: null };
  }

  const supabase = await createClient();
  const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
  if (allowed.data === false) return { ...previous, error: t.login.phone.locked, notice: null };

  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  const reason = phoneCodeError(error);
  if (reason && reason !== "not_registered") {
    return {
      ...previous,
      // A resend that came too soon keeps the code step and its countdown.
      step: previous.phone === phone ? previous.step : "phone",
      error: t.login.phone[reason],
      notice: null,
    };
  }
  return {
    step: "code",
    phone,
    sentAt: Date.now(),
    notice: t.login.phone.codeSent(maskPhone(phone)),
    error: null,
  };
}

export async function verifyPhoneCode(
  previous: PhoneState,
  formData: FormData,
): Promise<PhoneState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (phone === null || phone === "invalid") {
    return {
      step: "phone",
      phone: null,
      sentAt: null,
      notice: null,
      error: t.login.phone.invalidNumber,
    };
  }
  if (!/^[0-9]{6}$/.test(token)) return { ...previous, error: t.login.phone.invalidCode };

  const supabase = await createClient();
  const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
  if (allowed.data === false) return { ...previous, error: t.login.phone.locked, notice: null };

  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    const left = await supabase.rpc("phone_login_record_failure", { p_phone: phone });
    return { ...previous, error: t.login.phone.wrongCode(left.data ?? 0), notice: null };
  }

  redirect(safeNextPath(formData.get("next")));
}
