"use server";

import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { maskPhone } from "@/lib/notifications/phone";
import { formReader } from "@/lib/operations/validation";
import { claimSignupTicket, completeSignup, SIGNUP_REFUSED_LOGIN } from "@/lib/signup/client";
import { sendAccountCode } from "@/lib/signup/send-code";
import { clearTicket, readTicket, storeTicket } from "@/lib/signup/ticket";
import { createClient } from "@/lib/supabase/server";
import { accountPhone, type VerifyState } from "./verify-state";

// Phone verification for a signed-in self-service account that left the
// sign-up before the SMS code. The number is read from the account on the
// server; the browser never sends it. The session must have been opened with
// the account's password: `claim` turns it into a sign-up ticket (the code
// opens a new session without the password, review of PR #93), the ticket
// asks for the phone code (customer-signup send_code) and goes with complete.

const s = siteText.signup;

export async function verifyPhoneAction(
  previous: VerifyState,
  form: FormData,
): Promise<VerifyState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/giris?next=%2Fkayit%2Fdogrula");
  const phone = accountPhone(data.user.phone);
  if (!phone) return { ...previous, error: s.verifyPage.noPhone, notice: null };

  const allowed = await supabase.rpc("phone_login_allowed", { p_phone: phone });
  if (allowed.data === false) return { ...previous, error: t.login.phone.locked, notice: null };

  if (formReader(form)("intent") !== "verify") {
    const claim = await claimSignupTicket(supabase);
    if (!claim.ok) return { ...previous, error: s.errors[claim.error], notice: null };
    // No pending sign-up: a confirmed phone still gets its login code, an
    // unconfirmed one nothing (there is no sign-up left to complete).
    if (claim.ticket) await storeTicket(claim.ticket, phone);
    const reason = await sendAccountCode(supabase, phone, { ticket: claim.ticket });
    if (reason) {
      return {
        ...previous,
        error: reason === "not_registered" ? s.errors.failed : t.login.phone[reason],
        notice: null,
      };
    }
    return {
      step: "code",
      sentAt: Date.now(),
      notice: s.codeSent(maskPhone(phone)),
      error: null,
    };
  }

  const token = formReader(form)("code").replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(token)) {
    return { ...previous, error: t.login.phone.invalidCode, notice: null };
  }
  const ticket = (await readTicket())?.ticket ?? null;
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    // As on /kayit: not counted with the ticket of this phone's pending sign-up.
    const left = await supabase.rpc("phone_login_record_failure", {
      p_phone: phone,
      ...(ticket ? { p_ticket: ticket } : {}),
    });
    return { ...previous, error: t.login.phone.wrongCode(left.data ?? 0), notice: null };
  }

  const completed = await completeSignup(supabase, ticket);
  if (!completed.ok && completed.error === "signup_mismatch") {
    await supabase.auth.signOut();
    redirect(SIGNUP_REFUSED_LOGIN);
  }
  if (completed.ok) await clearTicket();
  redirect(
    completed.ok && (completed.status === "completed" || completed.status === "already_completed")
      ? "/portal"
      : "/",
  );
}
