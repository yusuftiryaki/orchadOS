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
const completeSignup = vi.hoisted(() => vi.fn());
const waitAtLeast = vi.hoisted(() => vi.fn(async () => {}));

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
vi.mock("@/lib/signup/client", () => ({ registerCustomer, completeSignup }));
vi.mock("@/lib/signup/timing", () => ({ CODE_STEP_MIN_MS: 2000, waitAtLeast }));

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
  completeSignup.mockResolvedValue({ ok: true, status: "completed" });
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

const SIGNUP_FORM = {
  full_name: "Ayşe Deneme",
  email: "ayse@example.com",
  password: "parola-123",
  password_repeat: "parola-123",
  contact_preference: "sms",
  kvkk_notice: "on",
};

// docs/hukuk/kararlar.md H33: no answer tells whether a number is registered.
describe("signupAction register hides registered numbers", () => {
  it("moves to the code step for a number that cannot get a code (a profile phone without a login)", async () => {
    registerCustomer.mockResolvedValue({ ok: true });
    const state = await signupAction(
      INITIAL_SIGNUP_STATE,
      form({ ...SIGNUP_FORM, phone: "0532 999 99 99" }),
    );
    expect(state.error).toBeNull();
    expect(state.step).toBe("code");
    expect(state.notice).toBe(s.codeSent("+90 5•• ••• •• 99"));
  });

  it("answers new, registered and code-less numbers alike, each after the time floor", async () => {
    registerCustomer.mockResolvedValue({ ok: true });
    auth.signInWithOtp.mockImplementation(async ({ phone }: { phone: string }) => ({
      data: {},
      error:
        phone === KNOWN
          ? null
          : phone === UNKNOWN
            ? { code: "otp_disabled", message: "Signups not allowed for otp" }
            : { code: "signup_disabled", message: "Signups not allowed for this instance" },
    }));
    const states = [];
    for (const phone of ["0532 123 45 67", "0532 999 99 99", "0532 555 55 55"]) {
      const state = await signupAction(INITIAL_SIGNUP_STATE, form({ ...SIGNUP_FORM, phone }));
      states.push({
        ...strip(state),
        values: { ...state.values, phone: "" },
        phone: null,
        notice: null,
      });
    }
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect(states[0].step).toBe("code");
    expect(waitAtLeast).toHaveBeenCalledTimes(3);
    for (const call of waitAtLeast.mock.calls as unknown as [number, number][]) {
      expect(call[1]).toBe(2000);
    }
  });

  it("shows the generic message for a taken e-mail", async () => {
    registerCustomer.mockResolvedValue({ ok: false, error: "not_completed" });
    const state = await signupAction(
      INITIAL_SIGNUP_STATE,
      form({ ...SIGNUP_FORM, phone: "0532 999 99 99" }),
    );
    expect(state.step).toBe("form");
    expect(state.error).toBe(
      "Kayıt tamamlanamadı; bu bilgilerle hesabınız varsa telefonunuzla giriş yapın.",
    );
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("signupAction verify", () => {
  it.each([
    ["completed", "/portal"],
    ["already_completed", "/portal"],
    ["no_pending", "/"],
  ])("a %s sign-up lands on %s", async (status, target) => {
    completeSignup.mockResolvedValue({ ok: true, status });
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await expect(
      signupAction(
        { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
        form({ intent: "verify", phone: KNOWN, code: "123456" }),
      ),
    ).rejects.toThrow(`redirect ${target}`);
  });
});
