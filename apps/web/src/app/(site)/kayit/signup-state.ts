import type { SignupField } from "@/lib/signup/validation";

// State of the two-step sign-up form (actions.ts). Kept out of the "use
// server" file, which may only export async functions.

// Fields shown again after a failed submit. The password is not among them.
export interface SignupValues {
  full_name: string;
  phone: string;
  email: string;
  contact_preference: string;
  explicit_service_improvement: boolean;
  explicit_marketing: boolean;
}

export interface SignupState {
  step: "form" | "code";
  values: SignupValues;
  fieldErrors: Partial<Record<SignupField, string>>;
  // E.164, carried in a hidden field on the code step.
  phone: string | null;
  // When the last code was requested (ms), for the resend countdown.
  sentAt: number | null;
  notice: string | null;
  error: string | null;
}

export const INITIAL_VALUES: SignupValues = {
  full_name: "",
  phone: "",
  email: "",
  contact_preference: "whatsapp",
  explicit_service_improvement: false,
  explicit_marketing: false,
};

export const INITIAL_SIGNUP_STATE: SignupState = {
  step: "form",
  values: INITIAL_VALUES,
  fieldErrors: {},
  phone: null,
  sentAt: null,
  notice: null,
  error: null,
};
