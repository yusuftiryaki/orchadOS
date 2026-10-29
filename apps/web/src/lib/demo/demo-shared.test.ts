import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_EMAIL_DOMAIN,
  demoEmail,
  demoMode,
  demoSecrets,
  ipBucket,
  parseDemoRequest,
  statusFor,
} from "../../../../../supabase/functions/_shared/demo";

// The rules of the demo-start Edge Function (docs/demo-turu.md §4, §7).

describe("parseDemoRequest", () => {
  it("accepts start with optional client_ip and captcha_token", () => {
    expect(parseDemoRequest({ action: "start" })).toEqual({
      ok: true,
      value: { action: "start", clientIp: null, captchaToken: null },
    });
    expect(
      parseDemoRequest({ action: "start", client_ip: " 198.51.100.7 ", captcha_token: "tok" }),
    ).toEqual({
      ok: true,
      value: { action: "start", clientIp: "198.51.100.7", captchaToken: "tok" },
    });
  });

  it("accepts cleanup", () => {
    expect(parseDemoRequest({ action: "cleanup" })).toEqual({
      ok: true,
      value: { action: "cleanup" },
    });
  });

  it("names the bad field", () => {
    expect(parseDemoRequest(null)).toEqual({ ok: false, field: "body" });
    expect(parseDemoRequest([])).toEqual({ ok: false, field: "body" });
    expect(parseDemoRequest({ action: "register" })).toEqual({ ok: false, field: "action" });
    expect(parseDemoRequest({ action: "start", client_ip: "not an ip" })).toEqual({
      ok: false,
      field: "client_ip",
    });
    expect(parseDemoRequest({ action: "start", client_ip: 7 })).toEqual({
      ok: false,
      field: "client_ip",
    });
    expect(parseDemoRequest({ action: "start", captcha_token: "" })).toEqual({
      ok: false,
      field: "captcha_token",
    });
    expect(parseDemoRequest({ action: "start", captcha_token: "x".repeat(4097) })).toEqual({
      ok: false,
      field: "captcha_token",
    });
  });
});

describe("statusFor", () => {
  it("maps every error code", () => {
    expect(
      (
        [
          "invalid_input",
          "captcha_failed",
          "rate_limited",
          "demo_closed",
          "demo_capacity",
          "failed",
          "unauthorized",
          "demo_read_only",
        ] as const
      ).map(statusFor),
    ).toEqual([400, 400, 429, 503, 503, 500, 401, 403]);
  });
});

describe("demoEmail", () => {
  it("builds the visitor address on the given domain", () => {
    expect(DEFAULT_DEMO_EMAIL_DOMAIN).toBe("demo.orchados.invalid");
    expect(demoEmail("0b9c", DEFAULT_DEMO_EMAIL_DOMAIN)).toBe(
      "ziyaretci-0b9c@demo.orchados.invalid",
    );
    expect(demoEmail("x", "ziyaretci.example.com")).toBe("ziyaretci-x@ziyaretci.example.com");
  });
});

describe("ipBucket", () => {
  it("keeps an IPv4 address", () => {
    expect(ipBucket("198.51.100.23")).toBe("198.51.100.23");
    expect(ipBucket(" 203.0.113.9 ")).toBe("203.0.113.9");
  });

  it("reduces an IPv6 address to its /64, expanded and lowercase", () => {
    expect(ipBucket("2001:DB8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("2001:db8:aa:bb:cc:dd:ee:ff")).toBe("2001:db8:aa:bb::/64");
    expect(ipBucket("2001:0db8:0000:0001::")).toBe("2001:db8:0:1::/64");
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
  });

  it("puts two addresses of one /64 into the same bucket", () => {
    expect(ipBucket("2001:db8:1:2::a")).toBe(ipBucket("2001:db8:1:2:ffff:1:2:3"));
    expect(ipBucket("2001:db8:1:2::a")).not.toBe(ipBucket("2001:db8:1:3::a"));
  });

  it("treats an IPv4-mapped IPv6 address as IPv4", () => {
    expect(ipBucket("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(ipBucket("::FFFF:c633:6407")).toBe("198.51.100.7");
    expect(ipBucket("0:0:0:0:0:ffff:198.51.100.7")).toBe("198.51.100.7");
  });

  it("returns null for anything else", () => {
    for (const bad of [
      null,
      "",
      "unknown",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "2001:db8::1::2",
      "2001:db8:::1",
      "12345::1",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "::ffff:300.1.1.1",
      "g::1",
    ]) {
      expect(ipBucket(bad), String(bad)).toBeNull();
    }
  });
});

describe("demoMode", () => {
  const live = "0x4AAAAAAAlivesecretvalue";

  it("is closed without a mode or with an unknown one", () => {
    expect(demoMode({}).open).toBe(false);
    expect(demoMode({ turnstileSecret: live }).open).toBe(false);
    expect(demoMode({ mode: "", turnstileSecret: live }).open).toBe(false);
    expect(demoMode({ mode: "on", turnstileSecret: live }).open).toBe(false);
    expect(demoMode({ mode: "PUBLIC", turnstileSecret: live }).open).toBe(false);
  });

  it("dev opens; Turnstile only with a secret", () => {
    expect(demoMode({ mode: "dev" })).toEqual({ open: true, captcha: "off" });
    expect(demoMode({ mode: "dev", turnstileSecret: "" })).toEqual({
      open: true,
      captcha: "off",
    });
    expect(demoMode({ mode: "dev", turnstileSecret: live })).toEqual({
      open: true,
      captcha: "required",
    });
  });

  it("public opens only with a live secret, and always verifies", () => {
    expect(demoMode({ mode: "public", turnstileSecret: live })).toEqual({
      open: true,
      captcha: "required",
    });
    expect(demoMode({ mode: "public" })).toEqual({ open: false, captcha: "required" });
  });

  it.each([
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
  ])("public refuses Cloudflare's test key %s", (dummy) => {
    expect(demoMode({ mode: "public", turnstileSecret: dummy }).open).toBe(false);
    // dev still verifies with it (local, CI).
    expect(demoMode({ mode: "dev", turnstileSecret: dummy })).toEqual({
      open: true,
      captcha: "required",
    });
  });
});

// The self-hosted robot check (docs/hukuk/kararlar.md H03, T12).
describe("demoMode with CAPTCHA_PROVIDER=altcha", () => {
  const key = "k".repeat(32);

  it("public opens only with a key of at least 32 characters, and always checks", () => {
    expect(demoMode({ mode: "public", provider: "altcha", altchaKey: key })).toEqual({
      open: true,
      captcha: "required",
    });
    expect(demoMode({ mode: "public", provider: "altcha", altchaKey: key.slice(1) }).open).toBe(
      false,
    );
    // A live Turnstile secret does not stand in for the missing key.
    expect(
      demoMode({ mode: "public", provider: "altcha", turnstileSecret: "0x4AAAAAAAlive" }).open,
    ).toBe(false);
    expect(demoMode({ provider: "altcha", altchaKey: key }).open).toBe(false);
  });

  it("dev checks a sent token when the key is set (local, CI)", () => {
    expect(demoMode({ mode: "dev", provider: "altcha", altchaKey: key })).toEqual({
      open: true,
      captcha: "if_sent",
    });
    expect(demoMode({ mode: "dev", provider: "altcha" })).toEqual({ open: true, captcha: "off" });
  });

  it("an unknown provider keeps the demo closed", () => {
    for (const mode of ["dev", "public"]) {
      expect(
        demoMode({ mode, provider: "hcaptcha", turnstileSecret: "0x4AAAAAAAlive", altchaKey: key }),
      ).toEqual({ open: false, captcha: "required" });
    }
    expect(
      demoMode({ mode: "public", provider: " Turnstile ", turnstileSecret: "0x4AAAAAAAlive" }).open,
    ).toBe(true);
  });
});

describe("demoSecrets", () => {
  const env =
    (values: Record<string, string>) =>
    (name: string): string | undefined =>
      values[name];

  it("prefers the DEMO_ names (shared hosting on the test project)", () => {
    const get = env({
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      DEMO_TURNSTILE_SECRET_KEY: "0x4AAAAAAAdemolive",
      SIGNUP_HASH_SECRET: "test-hash",
      DEMO_SIGNUP_HASH_SECRET: "demo-hash",
      SIGNUP_PROXY_SECRET: "test-proxy",
      DEMO_SIGNUP_PROXY_SECRET: "demo-proxy",
    });
    expect(demoSecrets(get)).toEqual({
      turnstileSecret: "0x4AAAAAAAdemolive",
      hashSecret: "demo-hash",
      proxySecret: "demo-proxy",
    });
  });

  it("falls back to the shared names (a separate demo project, local, CI)", () => {
    const get = env({
      TURNSTILE_SECRET_KEY: "0x4AAAAAAAlive",
      SIGNUP_HASH_SECRET: "hash",
      SIGNUP_PROXY_SECRET: "proxy",
      DEMO_SIGNUP_PROXY_SECRET: "",
    });
    expect(demoSecrets(get)).toEqual({
      turnstileSecret: "0x4AAAAAAAlive",
      hashSecret: "hash",
      proxySecret: "proxy",
    });
  });

  it("is empty when neither is set", () => {
    expect(demoSecrets(env({}))).toEqual({ turnstileSecret: "", hashSecret: "", proxySecret: "" });
  });

  it("public mode opens with the demo's live key over the test project's test key", () => {
    const { turnstileSecret } = demoSecrets(
      env({
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        DEMO_TURNSTILE_SECRET_KEY: "0x4AAAAAAAdemolive",
      }),
    );
    expect(demoMode({ mode: "public", turnstileSecret }).open).toBe(true);
  });

  it("public mode keeps refusing a test key that comes from the fallback", () => {
    const { turnstileSecret } = demoSecrets(
      env({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }),
    );
    expect(demoMode({ mode: "public", turnstileSecret }).open).toBe(false);
  });

  it("public mode refuses a DEMO_ test key even when the shared key is live", () => {
    const { turnstileSecret } = demoSecrets(
      env({
        TURNSTILE_SECRET_KEY: "0x4AAAAAAAlive",
        DEMO_TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
      }),
    );
    expect(demoMode({ mode: "public", turnstileSecret }).open).toBe(false);
  });
});
