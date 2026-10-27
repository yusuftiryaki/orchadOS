import { phoneCodeError, type PhoneCodeError } from "@/app/giris/login-methods";
import type { Client } from "@/lib/supabase/types";

// Sends an SMS code to an existing account's phone (docs/musteri-yonetimi.md
// §7.1). GoTrue treats a code request for a phone that is not confirmed yet
// as a sign-up, which is refused (signup_disabled) because sign-ups are off;
// such an account asks with resend (phone confirmation, through the Send SMS
// hook). verifyOtp({type: "sms"}) then confirms the phone either way, with an
// otp amr. A verified phone signs in with signInWithOtp.
export async function sendAccountCode(
  supabase: Client,
  phone: string,
): Promise<PhoneCodeError | null> {
  const signIn = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (signIn.error?.code !== "signup_disabled") return phoneCodeError(signIn.error);
  const { error } = await supabase.auth.resend({ type: "sms", phone });
  return phoneCodeError(error);
}
