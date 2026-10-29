import { afterEach, describe, expect, it, vi } from "vitest";
import { demoProxySecret, demoStartErrorOf } from "./start";

describe("demoStartErrorOf", () => {
  it.each([
    [400, { error: "captcha_failed" }, "captcha_failed"],
    [429, { error: "rate_limited" }, "rate_limited"],
    [503, { error: "demo_closed" }, "demo_closed"],
    [503, { error: "demo_capacity" }, "demo_capacity"],
    [500, { error: "failed" }, "failed"],
    [404, null, "unavailable"],
    [502, "bad gateway", "unavailable"],
    [401, { error: "unauthorized" }, "failed"],
  ] as const)("%s %j → %s", (status, body, code) => {
    expect(demoStartErrorOf(status, body)).toBe(code);
  });
});

describe("demoProxySecret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers DEMO_SIGNUP_PROXY_SECRET (shared hosting on the test project)", () => {
    vi.stubEnv("SIGNUP_PROXY_SECRET", "test-site");
    vi.stubEnv("DEMO_SIGNUP_PROXY_SECRET", "demo");
    expect(demoProxySecret()).toBe("demo");
  });

  it("falls back to SIGNUP_PROXY_SECRET", () => {
    vi.stubEnv("SIGNUP_PROXY_SECRET", "shared");
    vi.stubEnv("DEMO_SIGNUP_PROXY_SECRET", "");
    expect(demoProxySecret()).toBe("shared");
  });

  it("is undefined when neither is set", () => {
    vi.stubEnv("SIGNUP_PROXY_SECRET", "");
    vi.stubEnv("DEMO_SIGNUP_PROXY_SECRET", "");
    expect(demoProxySecret()).toBeUndefined();
  });
});
