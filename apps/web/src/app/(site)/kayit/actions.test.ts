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
// The ticket cookie: {ticket, phone} or null.
const cookie = vi.hoisted(() => ({ value: null as { ticket: string; phone: string } | null }));
const registerCustomer = vi.hoisted(() => vi.fn());
const completeSignup = vi.hoisted(() => vi.fn());
// customer-signup send_code (grants with the ticket and asks Auth itself).
const sendSignupCode = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/signup/client", () => ({
  registerCustomer,
  completeSignup,
  sendSignupCode,
  SIGNUP_REFUSED_LOGIN: "/giris?kayit=yarim",
}));
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
  cookie.value = null;
  rpc.mockImplementation(async () => ({ data: true, error: null }));
  sendSignupCode.mockResolvedValue(true);
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
  it("sends the first code of a new account (unconfirmed phone) through send_code", async () => {
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
    expect(sendSignupCode).toHaveBeenCalledWith(expect.anything(), UNKNOWN, TICKET);
    // Never Auth's public resend, and no grant from the browser's session:
    // signup_code_grant is service role only (auth hardening, item 3).
    expect(auth.resend).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("signup_code_grant", expect.anything());
    expect(cookie.value).toEqual({ ticket: TICKET, phone: UNKNOWN });
  });

  // Review of PR #93, finding 1: without a ticket (a function deployed before
  // tickets) no confirmation code is asked for; with one, send_code decides.
  it("asks no confirmation code without a ticket", async () => {
    registerCustomer.mockResolvedValue({ ok: true, ticket: null });
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
    expect(sendSignupCode).not.toHaveBeenCalled();
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
  // Auth hardening, item 6: Auth's public resend can replace the code of a
  // pending sign-up without sending one; the registrant's wrong codes (with
  // their ticket) do not count toward the lock, everyone else's do.
  it("passes the ticket with a wrong code", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired", message: "x" } });
    rpc.mockImplementation(async () => ({ data: 5, error: null }));
    cookie.value = { ticket: TICKET, phone: UNKNOWN };
    const codeState = { ...INITIAL_SIGNUP_STATE, step: "code" as const, phone: UNKNOWN };
    await signupAction(codeState, form({ intent: "verify", phone: UNKNOWN, code: "123456" }));
    expect(rpc).toHaveBeenCalledWith("phone_login_record_failure", {
      p_phone: UNKNOWN,
      p_ticket: TICKET,
    });
    cookie.value = null;
    await signupAction(codeState, form({ intent: "verify", phone: UNKNOWN, code: "123456" }));
    expect(rpc).toHaveBeenLastCalledWith("phone_login_record_failure", { p_phone: UNKNOWN });
  });

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

  // Review of PR #93: the code opened a sign-up this browser cannot prove is
  // its own. Round 2: signed out and sent to the login page, whose guidance
  // is "e-mail and password", never "register again" (which would loop).
  it("signs out and goes to the login guidance when complete answers signup_mismatch", async () => {
    completeSignup.mockResolvedValue({ ok: false, error: "signup_mismatch" });
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await expect(
      signupAction(
        { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
        form({ intent: "verify", phone: KNOWN, code: "123456" }),
      ),
    ).rejects.toThrow("redirect /giris?kayit=yarim");
    // Without a cookie no ticket goes, and complete still checks.
    expect(completeSignup.mock.calls[0][1]).toBeNull();
    expect(auth.signOut).toHaveBeenCalled();
    expect(s.errors.signup_mismatch).not.toMatch(/yeniden kayıt/);
    expect(siteText.login.signupUnfinished).toMatch(/e-posta ve parola/);
  });

  it("signs out and stays on the page when complete fails", async () => {
    completeSignup.mockResolvedValue({ ok: false, error: "failed" });
    auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const state = await signupAction(
      { ...INITIAL_SIGNUP_STATE, step: "code", phone: KNOWN },
      form({ intent: "verify", phone: KNOWN, code: "123456" }),
    );
    expect(auth.signOut).toHaveBeenCalled();
    expect(state.step).toBe("form");
    expect(state.error).toBe(s.errors.failed);
  });
});
