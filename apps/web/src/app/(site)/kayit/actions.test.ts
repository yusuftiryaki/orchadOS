import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteText } from "@/lib/i18n/messages/site";
import { INITIAL_SIGNUP_STATE } from "./signup-state";

// Review of PR #53, findings 1 and 2, and of PR #93 (the sign-up ticket).
// The Supabase client, the function calls and the ticket cookie are faked;
// the action's own logic runs.

const flags = vi.hoisted(() => ({ signupEnabled: true }));
const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  resend: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
// signup_code_allowed: the ticket is the pending sign-up's of this phone.
const db = vi.hoisted(() => ({ codeAllowed: true }));
// The ticket cookie: {ticket, phone} or null.
const cookie = vi.hoisted(() => ({ value: null as { ticket: string; phone: string } | null }));
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
vi.mock("@/lib/signup/ticket", () => ({
  readTicket: async () =>
    cookie.value ? { ticket: cookie.value.ticket, binding: cookie.value.phone } : null,
  storeTicket: async (ticket: string, phone: string) => {
    cookie.value = { ticket, phone };
  },
  clearTicket: async () => {
    cookie.value = null;
  },
  ticketFitsPhone: (c: { binding: string }, phone: string) => c.binding === phone,
}));

const { signupAction } = await import("./actions");

const s = siteText.signup;
const KNOWN = "+905321234567";
const UNKNOWN = "+905329999999";
const TICKET = "t".repeat(43);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  flags.signupEnabled = true;
  vi.clearAllMocks();
  db.codeAllowed = true;
  cookie.value = null;
  rpc.mockImplementation(async (fn: string) => ({
    data: fn === "signup_code_allowed" ? db.codeAllowed : true,
    error: null,
  }));
  registerCustomer.mockResolvedValue({ ok: true, ticket: TICKET });
  completeSignup.mockResolvedValue({ ok: true, status: "completed" });
  auth.signOut.mockResolvedValue({ error: null });
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
    cookie.value = { ticket: TICKET, phone: KNOWN };
    const known = await signupAction(codeState, form({ intent: "resend", phone: KNOWN }));
    cookie.value = { ticket: TICKET, phone: UNKNOWN };
    const unknown = await signupAction(codeState, form({ intent: "resend", phone: UNKNOWN }));
    expect(known.error).toBeNull();
    expect(unknown.error).toBeNull();
    expect(unknown.step).toBe("code");
    expect(strip({ ...unknown, phone: KNOWN, notice: null })).toEqual(
      strip({ ...known, notice: null }),
    );
  });

  // Review of PR #93, finding 6: Auth's per-number limits only hit numbers
  // with an account, so they get the normal code step too.
  it.each(["over_sms_send_rate_limit", "over_request_rate_limit", "sms_send_failed"])(
    "shows the code step when Auth answers %s",
    async (code) => {
      auth.signInWithOtp.mockResolvedValue({ data: {}, error: { code, message: "x" } });
      cookie.value = { ticket: TICKET, phone: KNOWN };
      const state = await signupAction(
        { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
        form({ intent: "resend", phone: KNOWN }),
      );
      expect(state.error).toBeNull();
      expect(state.step).toBe("code");
      expect(state.notice).toBe(s.codeRequested("+90 5•• ••• •• 67"));
    },
  );

  it("sends nothing for a number this browser did not register", async () => {
    const codeState = { ...INITIAL_SIGNUP_STATE, step: "code" as const, phone: KNOWN };
    const none = await signupAction(codeState, form({ intent: "resend", phone: KNOWN }));
    cookie.value = { ticket: TICKET, phone: UNKNOWN };
    const other = await signupAction(codeState, form({ intent: "resend", phone: KNOWN }));
    for (const state of [none, other]) {
      expect(state.step).toBe("form");
      expect(state.error).toBe(s.registerAgain);
    }
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(auth.resend).not.toHaveBeenCalled();
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
    expect(rpc).toHaveBeenCalledWith("signup_code_allowed", { p_phone: UNKNOWN, p_ticket: TICKET });
    expect(auth.resend).toHaveBeenCalledWith({ type: "sms", phone: UNKNOWN });
    expect(cookie.value).toEqual({ ticket: TICKET, phone: UNKNOWN });
  });

  // Review of PR #93, finding 1: an unconfirmed account someone else opened
  // with this phone never gets its confirmation code sent to the phone.
  it("asks no confirmation code for an account this browser did not open", async () => {
    db.codeAllowed = false;
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "signup_disabled", message: "Signups not allowed for this instance" },
    });
    const state = await signupAction(
      INITIAL_SIGNUP_STATE,
      form({ ...SIGNUP_FORM, phone: "0532 999 99 99" }),
    );
    expect(state.error).toBeNull();
    expect(state.step).toBe("code");
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("sends the previous ticket with a new register and keeps the new one", async () => {
    cookie.value = { ticket: "p".repeat(43), phone: UNKNOWN };
    registerCustomer.mockResolvedValue({ ok: true, ticket: "n".repeat(43) });
    await signupAction(INITIAL_SIGNUP_STATE, form({ ...SIGNUP_FORM, phone: "0532 999 99 99" }));
    expect(registerCustomer.mock.calls[0][4]).toBe("p".repeat(43));
    expect(cookie.value).toEqual({ ticket: "n".repeat(43), phone: UNKNOWN });
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
    const state = await signupAction(
      INITIAL_SIGNUP_STATE,
      form({ ...SIGNUP_FORM, phone: "0532 999 99 99" }),
    );
    expect(state.error).toBeNull();
    expect(state.step).toBe("code");
    expect(state.notice).toBe(s.codeRequested("+90 5•• ••• •• 99"));
  });

  it("answers new, registered and code-less numbers alike, each after the time floor", async () => {
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
    cookie.value = { ticket: TICKET, phone: KNOWN };
    completeSignup.mockResolvedValue({ ok: true, status });
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await expect(
      signupAction(
        { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
        form({ intent: "verify", phone: KNOWN, code: "123456" }),
      ),
    ).rejects.toThrow(`redirect ${target}`);
    expect(completeSignup.mock.calls[0][1]).toBe(TICKET);
    expect(cookie.value).toBeNull();
  });

  // Review of PR #93, finding 1: the code opened someone else's sign-up.
  it.each([["signup_mismatch"], ["failed"]])(
    "signs out and stays on the page when complete answers %s",
    async (error) => {
      completeSignup.mockResolvedValue({ ok: false, error });
      auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
      const state = await signupAction(
        { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
        form({ intent: "verify", phone: KNOWN, code: "123456" }),
      );
      // Without a cookie the ticket is "", which no pending sign-up carries.
      expect(completeSignup.mock.calls[0][1]).toBe("");
      expect(auth.signOut).toHaveBeenCalled();
      expect(state.step).toBe("form");
      expect(state.error).toBe(s.errors[error as "failed"]);
    },
  );
});
