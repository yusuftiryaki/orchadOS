import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteText } from "@/lib/i18n/messages/site";
import { INITIAL_SIGNUP_STATE } from "./signup-state";

// Review of PR #53, findings 1 and 2. The Supabase client and the function
// calls are faked; the action's own logic runs.

const flags = vi.hoisted(() => ({ signupEnabled: true }));
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  resend: vi.fn(),
  verifyOtp: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
const registerCustomer = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/lib/flags", () => ({
  siteFlags: () => ({ ...flags, turnstileSiteKey: null }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth, rpc }) }));
vi.mock("@/lib/signup/client", () => ({
  registerCustomer,
  completeSignup: async () => ({ ok: true, status: "completed" }),
}));

const { signupAction } = await import("./actions");

const s = siteText.signup;
const KNOWN = "+905321234567";
const UNKNOWN = "+905329999999";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  flags.signupEnabled = true;
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  auth.resend.mockResolvedValue({ data: {}, error: null });
  // Only KNOWN has an account (verified phone).
  auth.signInWithOtp.mockImplementation(async ({ phone }: { phone: string }) => ({
    data: {},
    error:
      phone === KNOWN ? null : { code: "otp_disabled", message: "Signups not allowed for otp" },
  }));
});

const strip = <T extends { sentAt: number | null }>(state: T) => ({ ...state, sentAt: 0 });

describe("signupAction resend", () => {
  it("answers the same for a number with and without an account", async () => {
    const codeState = { ...INITIAL_SIGNUP_STATE, step: "code" as const };
    const known = await signupAction(codeState, form({ intent: "resend", phone: KNOWN }));
    const unknown = await signupAction(codeState, form({ intent: "resend", phone: UNKNOWN }));
    expect(known.error).toBeNull();
    expect(unknown.error).toBeNull();
    expect(unknown.step).toBe("code");
    expect(strip({ ...unknown, phone: KNOWN, notice: null })).toEqual(
      strip({ ...known, notice: null }),
    );
  });

  it.each(["resend", "verify"])("%s is refused when sign-up is off", async (intent) => {
    flags.signupEnabled = false;
    const state = await signupAction(
      { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
      form({ intent, phone: KNOWN, code: "123456" }),
    );
    expect(state.error).toBe(s.errors.signup_closed);
    expect(state.step).toBe("form");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("signupAction register", () => {
  it("sends the first code of a new account (unconfirmed phone) through resend", async () => {
    registerCustomer.mockResolvedValue({ ok: true });
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "signup_disabled", message: "Signups not allowed for this instance" },
    });
    const state = await signupAction(
      INITIAL_SIGNUP_STATE,
      form({
        full_name: "Ayşe Deneme",
        phone: "0532 999 99 99",
        email: "ayse@example.com",
        password: "parola-123",
        password_repeat: "parola-123",
        contact_preference: "sms",
        kvkk_notice: "on",
      }),
    );
    expect(state.error).toBeNull();
    expect(state.step).toBe("code");
    expect(state.phone).toBe(UNKNOWN);
    expect(auth.resend).toHaveBeenCalledWith({ type: "sms", phone: UNKNOWN });
  });
});
