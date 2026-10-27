// The code step of self sign-up (docs/musteri-yonetimi.md §7, web flow step 2).
// customer-signup opens the account with the phone not confirmed yet, and
// GoTrue treats a login code request for such a phone as a sign-up, which is
// closed (enable_signup = false): signInWithOtp fails with signup_disabled and
// no SMS goes out. A new account asks for the phone confirmation code with
// resend instead; an account whose phone is already verified (the owner of
// the number registering again) signs in with signInWithOtp. Both codes are
// checked with verifyOtp({type: "sms"}).

// The two calls of supabase.auth used here (a fake in unit tests).
export interface SignupCodeAuth<E extends { code?: string }> {
  signInWithOtp(credentials: {
    phone: string;
    options: { shouldCreateUser: false; channel: "sms" };
  }): Promise<{ error: E | null }>;
  resend(credentials: { type: "sms"; phone: string }): Promise<{ error: E | null }>;
}

// Sends the SMS code for a phone that has just been registered; resolves to
// the Auth error, or null once a code is on its way.
export async function requestSignupCode<E extends { code?: string }>(
  auth: SignupCodeAuth<E>,
  phone: string,
): Promise<E | null> {
  const signIn = await auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (signIn.error?.code !== "signup_disabled") return signIn.error;
  return (await auth.resend({ type: "sms", phone })).error;
}
