// Sign-in methods offered on the login page: e-mail + password, and phone
// (SMS code; codes go through our own provider via the Auth Send SMS hook).
export type LoginMethod = "password" | "phone";

export const LOGIN_METHODS: { id: LoginMethod; enabled: boolean }[] = [
  { id: "password", enabled: true },
  { id: "phone", enabled: true },
];

// Seconds before another code may be requested; matches auth.sms.max_frequency
// in supabase/config.toml (and the hosted project's setting).
export const RESEND_AFTER_SECONDS = 60;

export function resendWaitSeconds(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_AFTER_SECONDS * 1000 - now) / 1000));
}

// Why a code request failed, from the Auth error. "not_registered" is not
// shown: the page does not reveal whether a number has an account.
export type PhoneCodeError =
  "not_registered" | "locked" | "tooManyCodes" | "tooSoon" | "sendFailed";

export function phoneCodeError(
  error: { code?: string; message?: string } | null,
): PhoneCodeError | null {
  if (!error) return null;
  // Errors from our hook (send-sms) arrive as the message.
  if (error.message === "phone_locked") return "locked";
  if (error.message === "too_many_codes") return "tooManyCodes";
  switch (error.code) {
    case "otp_disabled":
    case "signup_disabled":
    case "user_not_found":
      return "not_registered";
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "tooSoon";
    default:
      return "sendFailed";
  }
}

// Only same-origin relative paths are allowed as a post-login target.
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
