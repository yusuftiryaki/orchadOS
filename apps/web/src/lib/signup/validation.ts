import { isExplicitConsentAsked } from "@/lib/legal/consents";
import { normalizePhone, type Read } from "@/lib/operations/validation";

// Sign-up form parsing (pure, unit tested). Rules follow the customer-signup
// Edge Function (docs/musteri-yonetimi.md §7.1), so a form that passes here
// is not rejected there for its shape. Error codes never carry the values:
// they are personal data.

export const SIGNUP_FIELDS = [
  "full_name",
  "phone",
  "email",
  "password",
  "password_repeat",
  "contact_preference",
  "kvkk_notice",
] as const;
export type SignupField = (typeof SIGNUP_FIELDS)[number];
export type SignupFieldError = "required" | "invalid" | "too_short" | "too_long" | "mismatch";

export const SIGNUP_CONTACT_PREFERENCES = ["whatsapp", "sms"] as const;
export type SignupContactPreference = (typeof SIGNUP_CONTACT_PREFERENCES)[number];

// Turkish mobile numbers only (design §1: no foreign customers).
export const TR_MOBILE = /^\+905[0-9]{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
// Auth hashes passwords with bcrypt, which reads at most 72 bytes.
const PASSWORD_MAX = 72;
const NAME_MIN = 2;
const NAME_MAX = 120;
const EMAIL_MAX = 254;

export interface SignupInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  contactPreference: SignupContactPreference;
  // The two optional explicit consents (design §2). There is no AI-transfer
  // consent: its legal basis is the lawyer's call.
  explicitServiceImprovement: boolean;
  explicitMarketing: boolean;
}

export type SignupParsed =
  | { ok: true; value: SignupInput }
  | { ok: false; errors: Partial<Record<SignupField, SignupFieldError>> };

const checked = (read: Read, name: string) => read(name) === "on";

export function parseSignupForm(read: Read): SignupParsed {
  const errors: Partial<Record<SignupField, SignupFieldError>> = {};
  const set = (field: SignupField, error: SignupFieldError) => {
    errors[field] ??= error;
  };

  const fullName = read("full_name").trim().replace(/\s+/g, " ");
  if (fullName === "") set("full_name", "required");
  else if ([...fullName].length < NAME_MIN) set("full_name", "too_short");
  else if ([...fullName].length > NAME_MAX) set("full_name", "too_long");

  const phone = normalizePhone(read("phone"));
  if (phone === null) set("phone", "required");
  else if (phone === "invalid" || !TR_MOBILE.test(phone)) set("phone", "invalid");

  const email = read("email").trim().toLowerCase();
  if (email === "") set("email", "required");
  else if (email.length > EMAIL_MAX || !EMAIL.test(email)) set("email", "invalid");

  const password = read("password");
  if (password === "") set("password", "required");
  else if (password.length < PASSWORD_MIN) set("password", "too_short");
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX) set("password", "too_long");

  const repeat = read("password_repeat");
  if (repeat === "") set("password_repeat", "required");
  else if (repeat !== password) set("password_repeat", "mismatch");

  const preference = read("contact_preference").trim();
  if (preference === "") set("contact_preference", "required");
  else if (!(SIGNUP_CONTACT_PREFERENCES as readonly string[]).includes(preference)) {
    set("contact_preference", "invalid");
  }

  if (!checked(read, "kvkk_notice")) set("kvkk_notice", "required");

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fullName,
      phone: phone as string,
      email,
      password,
      contactPreference: preference as SignupContactPreference,
      // A consent the form does not ask is never recorded as given
      // (kararlar.md H06, H31); the Edge contract still carries both.
      explicitServiceImprovement:
        isExplicitConsentAsked("explicit_service_improvement") &&
        checked(read, "explicit_service_improvement"),
      explicitMarketing:
        isExplicitConsentAsked("explicit_marketing") && checked(read, "explicit_marketing"),
    },
  };
}
