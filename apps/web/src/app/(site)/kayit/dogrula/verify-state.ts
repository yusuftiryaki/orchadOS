import { normalizePhone } from "@/lib/operations/validation";

export interface VerifyState {
  step: "send" | "code";
  sentAt: number | null;
  notice: string | null;
  error: string | null;
}

export const INITIAL_VERIFY_STATE: VerifyState = {
  step: "send",
  sentAt: null,
  notice: null,
  error: null,
};

// Auth keeps phone numbers without the leading "+".
export function accountPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizePhone(phone.startsWith("+") ? phone : `+${phone}`);
  return normalized && normalized !== "invalid" ? normalized : null;
}
