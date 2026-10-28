import { phoneCodeError, type PhoneCodeError } from "@/app/giris/login-methods";
import type { Client } from "@/lib/supabase/types";

// Sends an SMS code to an existing account's phone (docs/musteri-yonetimi.md
// §7.1). GoTrue treats a code request for a phone that is not confirmed yet
// as a sign-up, which is refused (signup_disabled) because sign-ups are off;
// such an account asks with resend (phone confirmation, through the Send SMS
// hook). verifyOtp({type: "sms"}) then confirms the phone either way, with an
// otp amr. A verified phone signs in with signInWithOtp.
//
// `confirm`: whether the caller may ask for the phone confirmation code, i.e.
// the account is the caller's own (the signed-in /kayit/dogrula page, or the
// pending sign-up this browser's register wrote: signup_code_allowed). Never
// for anyone else's unconfirmed account: the code would sign the phone's
// owner in to an account someone else opened (review of PR #93). Without it
// an unconfirmed phone gets no code ("not_registered").
export async function sendAccountCode(
  supabase: Client,
  phone: string,
  { confirm }: { confirm: boolean },
): Promise<PhoneCodeError | null> {
  const signIn = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (signIn.error?.code !== "signup_disabled") return phoneCodeError(signIn.error);
  if (!confirm) return "not_registered";
  const { error } = await supabase.auth.resend({ type: "sms", phone });
  return phoneCodeError(error);
}
