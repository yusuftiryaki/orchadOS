"use server";

import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { maskPhone } from "@/lib/notifications/phone";
import { formReader } from "@/lib/operations/validation";
import { completeSignup } from "@/lib/signup/client";
import { sendAccountCode } from "@/lib/signup/send-code";
import { createClient } from "@/lib/supabase/server";
import { accountPhone, type VerifyState } from "./verify-state";

// Phone verification for a signed-in self-service account that left the
// sign-up before the SMS code. The number is read from the account on the
// server; the browser never sends it.

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
    // The signed-in account's own phone (its session came from its password).
    const reason = await sendAccountCode(supabase, phone, { confirm: true });
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
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) {
    const left = await supabase.rpc("phone_login_record_failure", { p_phone: phone });
    return { ...previous, error: t.login.phone.wrongCode(left.data ?? 0), notice: null };
  }

  const completed = await completeSignup(supabase);
  redirect(
    completed.ok && (completed.status === "completed" || completed.status === "already_completed")
      ? "/portal"
      : "/",
  );
}
