import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/supabase/types";
import {
  completeSignup,
  registerCustomer,
  signupErrorFromResponse,
  type SignupError,
} from "./client";
import type { SignupInput } from "./validation";

const INPUT: SignupInput = {
  fullName: "Ayşe Yılmaz",
  phone: "+905321234567",
  email: "ayse@example.com",
  password: "fistik-2026",
  contactPreference: "sms",
  explicitServiceImprovement: true,
  explicitMarketing: false,
};

class FakeFunctionsError extends Error {
  constructor(
    name: string,
    public context: unknown,
  ) {
    super(name);
    this.name = name;
  }
}

const httpError = (status: number, body: unknown) =>
  new FakeFunctionsError(
    "FunctionsHttpError",
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

function fakeClient(result: { data?: unknown; error?: unknown } | (() => never)) {
  const invoke = vi.fn(async () => {
    if (typeof result === "function") return result();
    return { data: result.data ?? null, error: result.error ?? null };
  });
  return { client: { functions: { invoke } } as unknown as Client, invoke };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signupErrorFromResponse", () => {
  it.each<[number, unknown, SignupError]>([
    [400, { error: "invalid_input", field: "phone" }, "invalid_input"],
    [400, { error: "captcha_failed" }, "captcha_failed"],
    [409, { error: "not_completed" }, "not_completed"],
    // A function deployed before H33: the same generic error.
    [409, { error: "email_taken" }, "not_completed"],
    [409, { error: "phone_registered" }, "not_completed"],
    [429, { error: "too_many_attempts" }, "too_many_attempts"],
    [503, { error: "signup_closed" }, "signup_closed"],
    [500, { error: "failed" }, "failed"],
    [403, { error: "phone_not_verified" }, "phone_not_verified"],
    [401, { error: "unauthorized" }, "failed"],
    [404, { error: "not_found" }, "signup_unavailable"],
    [404, null, "signup_unavailable"],
    [502, null, "signup_unavailable"],
    [503, { error: "boot_error" }, "signup_unavailable"],
    [500, { error: "something" }, "signup_unavailable"],
    [418, "teapot", "failed"],
  ])("%i %j -> %s", (status, body, expected) => {
    expect(signupErrorFromResponse(status, body)).toBe(expected);
  });
});

describe("registerCustomer", () => {
  it("sends the design §7 body with the proxy secret", async () => {
    vi.stubEnv("SIGNUP_PROXY_SECRET", "signup-proxy-local");
    const { client, invoke } = fakeClient({ data: { next: "verify_phone" } });
    expect(await registerCustomer(client, INPUT, "203.0.113.5", "tok")).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("customer-signup", {
      body: {
        action: "register",
        full_name: "Ayşe Yılmaz",
        phone: "+905321234567",
        email: "ayse@example.com",
        password: "fistik-2026",
        contact_preference: "sms",
        consents: {
          kvkk_notice_version: "kvkk-v2-taslak",
          explicit_text_version: "riza-v2-taslak",
          explicit_service_improvement: true,
          explicit_marketing: false,
        },
        client_ip: "203.0.113.5",
        captcha_token: "tok",
      },
      headers: { "x-orchados-proxy-secret": "signup-proxy-local" },
    });
  });

  it("omits an unknown IP, a missing token and an unset secret", async () => {
    vi.stubEnv("SIGNUP_PROXY_SECRET", "");
    const { client, invoke } = fakeClient({ data: { next: "verify_phone" } });
    await registerCustomer(client, INPUT, null, null);
    const [, options] = invoke.mock.calls[0] as unknown as [
      string,
      { body: object; headers: object },
    ];
    expect(options.body).not.toHaveProperty("client_ip");
    expect(options.body).not.toHaveProperty("captcha_token");
    expect(options.headers).toEqual({});
  });

  it("maps HTTP errors and keeps the field", async () => {
    const { client } = fakeClient({
      error: httpError(400, { error: "invalid_input", field: "email" }),
    });
    expect(await registerCustomer(client, INPUT, null, null)).toEqual({
      ok: false,
      error: "invalid_input",
      field: "email",
    });
    const taken = fakeClient({ error: httpError(409, { error: "not_completed" }) });
    expect(await registerCustomer(taken.client, INPUT, null, null)).toEqual({
      ok: false,
      error: "not_completed",
    });
  });

  it("treats an undeployed function, relay and network errors as unavailable", async () => {
    for (const error of [
      httpError(404, { message: "Function not found" }),
      new FakeFunctionsError("FunctionsRelayError", new Response("", { status: 500 })),
      new FakeFunctionsError("FunctionsFetchError", new TypeError("fetch failed")),
    ]) {
      const { client } = fakeClient({ error });
      expect(await registerCustomer(client, INPUT, null, null)).toEqual({
        ok: false,
        error: "signup_unavailable",
      });
    }
    const throwing = fakeClient(() => {
      throw new Error("boom");
    });
    expect(await registerCustomer(throwing.client, INPUT, null, null)).toEqual({
      ok: false,
      error: "signup_unavailable",
    });
  });

  it("treats an unexpected success body as failed", async () => {
    const { client } = fakeClient({ data: { next: "something_else" } });
    expect(await registerCustomer(client, INPUT, null, null)).toEqual({
      ok: false,
      error: "failed",
    });
  });
});

describe("completeSignup", () => {
  it.each(["completed", "already_completed", "no_pending"] as const)(
    "returns %s",
    async (status) => {
      const { client, invoke } = fakeClient({ data: { status } });
      expect(await completeSignup(client)).toEqual({ ok: true, status });
      expect(invoke.mock.calls[0]).toMatchObject([
        "customer-signup",
        { body: { action: "complete" } },
      ]);
    },
  );

  it("maps 403 phone_not_verified and an unreachable function", async () => {
    const forbidden = fakeClient({ error: httpError(403, { error: "phone_not_verified" }) });
    expect(await completeSignup(forbidden.client)).toEqual({
      ok: false,
      error: "phone_not_verified",
    });
    const missing = fakeClient({ error: httpError(404, {}) });
    expect(await completeSignup(missing.client)).toEqual({
      ok: false,
      error: "signup_unavailable",
    });
  });
});
