import { phoneCodeError, type PhoneCodeError } from "@/app/(site)/giris/login-methods";
import { sendSignupCode } from "@/lib/signup/client";
import type { Client } from "@/lib/supabase/types";

// Sends an SMS code to an existing account's phone (docs/musteri-yonetimi.md
// §7.1). GoTrue treats a code request for a phone that is not confirmed yet
// as a sign-up, which is refused (signup_disabled) because sign-ups are off;
// a verified phone signs in with signInWithOtp.
//
// `ticket`: this browser's sign-up ticket (the /kayit register's, or the one
// /kayit/dogrula's `claim` handed out), or null. Only with it is the phone
// confirmation code of an unconfirmed phone asked for, and only through
// customer-signup `send_code`: the function checks the ticket against the
// phone's pending sign-up (signup_code_grant, service role, rate limited) and
// asks Auth for the code in the same request; the Send SMS hook sends it only
// while that request's marker is there (signup_sms_allowed). Never for anyone
// else's unconfirmed account: the code would sign the phone's owner in to an
// account someone else opened (review of PR #93). Without a ticket an
// unconfirmed phone gets no code ("not_registered"). send_code answers the
// same whether a code went out or not (docs/hukuk/kararlar.md H33).
export async function sendAccountCode(
  supabase: Client,
  phone: string,
  { ticket }: { ticket: string | null },
): Promise<PhoneCodeError | null> {
  const signIn = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (signIn.error?.code !== "signup_disabled") return phoneCodeError(signIn.error);
  if (!ticket) return "not_registered";
  return (await sendSignupCode(supabase, phone, ticket)) ? null : "sendFailed";
}
