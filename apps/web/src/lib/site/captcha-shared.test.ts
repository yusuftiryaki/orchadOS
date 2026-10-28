import { describe, expect, it, vi } from "vitest";
import {
  ALTCHA_KEY_MIN,
  ALTCHA_TTL_MS,
  captchaConfigured,
  captchaEnv,
  captchaMode,
  type CaptchaEnv,
  createAltchaChallenge,
  encodeAltchaPayload,
  parseCaptchaProvider,
  sha256Hex,
  SpentChallenges,
  verifyAltcha,
  verifyCaptcha,
} from "../../../../../supabase/functions/_shared/captcha";
import { solveAltcha } from "./altcha-solver";

// The robot check of customer-signup and demo-start (docs/hukuk/kararlar.md
// H03, T12): provider choice, fail-closed modes and the self-hosted ALTCHA
// proof of work.

const KEY = "k".repeat(ALTCHA_KEY_MIN);
const NOW = Date.parse("2026-10-28T12:00:00Z");
const env = (values: Record<string, string>) => (name: string) => values[name];
const TURNSTILE: CaptchaEnv = { provider: "turnstile", turnstileSecret: "secret", altchaKey: "" };
const ALTCHA: CaptchaEnv = { provider: "altcha", turnstileSecret: "", altchaKey: KEY };

async function solved(purpose: "signup" | "demo" = "signup", now = NOW, key = KEY) {
  const challenge = await createAltchaChallenge(key, purpose, now, { maxNumber: 500 });
  const number = await solveAltcha(challenge);
  expect(number).not.toBeNull();
  return { challenge, token: encodeAltchaPayload({ ...challenge, number: number! }) };
}

describe("provider and mode", () => {
  it("defaults to Turnstile; an unknown provider is null", () => {
    expect(parseCaptchaProvider(undefined)).toBe("turnstile");
    expect(parseCaptchaProvider(" Turnstile ")).toBe("turnstile");
    expect(parseCaptchaProvider("altcha")).toBe("altcha");
    expect(parseCaptchaProvider("hcaptcha")).toBeNull();
  });

  it("reads the DEMO_ names first for the demo", () => {
    const get = env({
      CAPTCHA_PROVIDER: "turnstile",
      DEMO_CAPTCHA_PROVIDER: "altcha",
      ALTCHA_HMAC_KEY: "shared",
      DEMO_ALTCHA_HMAC_KEY: KEY,
      TURNSTILE_SECRET_KEY: "t",
    });
    expect(captchaEnv(get, "DEMO_")).toEqual({
      provider: "altcha",
      turnstileSecret: "t",
      altchaKey: KEY,
    });
    expect(captchaEnv(get)).toEqual({
      provider: "turnstile",
      turnstileSecret: "t",
      altchaKey: "shared",
    });
  });

  it("keeps Turnstile's rule: its secret verifies, the local flag only replaces a missing one", () => {
    expect(captchaMode(TURNSTILE, undefined)).toBe("verify");
    expect(captchaMode(TURNSTILE, "1")).toBe("verify");
    const none = { ...TURNSTILE, turnstileSecret: "" };
    expect(captchaMode(none, undefined)).toBe("unconfigured");
    expect(captchaMode(none, "")).toBe("unconfigured");
    expect(captchaMode(none, "true")).toBe("unconfigured");
    expect(captchaMode(none, "1")).toBe("skip");
  });

  it("altcha verifies with its key; fails closed without one or with a short one", () => {
    expect(captchaMode(ALTCHA, undefined)).toBe("verify");
    // Local stack: a sent token is checked, a missing one passes.
    expect(captchaMode(ALTCHA, "1")).toBe("optional");
    expect(captchaMode({ ...ALTCHA, altchaKey: "" }, undefined)).toBe("unconfigured");
    expect(captchaMode({ ...ALTCHA, altchaKey: KEY.slice(1) }, undefined)).toBe("unconfigured");
    // The Turnstile secret does not stand in for the missing key.
    expect(captchaMode({ ...ALTCHA, altchaKey: "", turnstileSecret: "s" }, undefined)).toBe(
      "unconfigured",
    );
    expect(captchaMode({ ...ALTCHA, provider: null }, "1")).toBe("unconfigured");
    expect(captchaConfigured({ ...ALTCHA, provider: null })).toBe(false);
  });
});

describe("ALTCHA", () => {
  it("issues a signed challenge with expiry and purpose in the salt", async () => {
    const c = await createAltchaChallenge(KEY, "signup", NOW, { number: 7 });
    expect(c.algorithm).toBe("SHA-256");
    expect(c.challenge).toBe(await sha256Hex(`${c.salt}7`));
    expect(c.salt).toMatch(/^[0-9a-f]{24}\?expires=\d+&purpose=signup&$/);
    expect(Number(/expires=(\d+)/.exec(c.salt)![1]) * 1000).toBe(NOW + ALTCHA_TTL_MS);
    expect(c.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(c)).not.toContain(KEY);
  });

  it("accepts a solved challenge", async () => {
    const { token, challenge } = await solved();
    expect(await verifyAltcha(KEY, token, "signup", NOW + 1000)).toEqual({
      ok: true,
      challenge: challenge.challenge,
      expiresMs: NOW + ALTCHA_TTL_MS,
    });
  });

  it("refuses a wrong number, a forged signature, another key and garbage", async () => {
    const { token, challenge } = await solved();
    const payload = JSON.parse(atob(token));
    const wrong = encodeAltchaPayload({ ...payload, number: payload.number + 1 });
    expect(await verifyAltcha(KEY, wrong, "signup", NOW)).toEqual({
      ok: false,
      reason: "solution",
    });
    const forged = encodeAltchaPayload({ ...payload, signature: "0".repeat(64) });
    expect(await verifyAltcha(KEY, forged, "signup", NOW)).toEqual({
      ok: false,
      reason: "signature",
    });
    expect(await verifyAltcha("x".repeat(32), token, "signup", NOW)).toEqual({
      ok: false,
      reason: "signature",
    });
    // A salt with a later expiry does not match the signed hash.
    const later = challenge.salt.replace(/expires=\d+/, "expires=9999999999");
    expect(
      await verifyAltcha(KEY, encodeAltchaPayload({ ...payload, salt: later }), "signup", NOW),
    ).toEqual({ ok: false, reason: "solution" });
    for (const bad of ["", "not base64!", btoa("{}"), btoa("[1]")]) {
      expect(await verifyAltcha(KEY, bad, "signup", NOW)).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  it("refuses an expired solution and one for the other purpose", async () => {
    const { token } = await solved("demo");
    expect(await verifyAltcha(KEY, token, "demo", NOW + ALTCHA_TTL_MS)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await verifyAltcha(KEY, token, "signup", NOW)).toEqual({ ok: false, reason: "purpose" });
  });

  it("refuses a replay", async () => {
    const { token } = await solved();
    const spent = new SpentChallenges();
    const ctx = { purpose: "signup" as const, ip: null, nowMs: NOW, spent };
    expect(await verifyCaptcha(ALTCHA, token, ctx)).toBe(true);
    expect(await verifyCaptcha(ALTCHA, token, ctx)).toBe(false);
  });

  it("forgets expired solutions only when full, and then refuses rather than forgets", () => {
    const spent = new SpentChallenges(2);
    expect(spent.use("a", NOW + 10, NOW)).toBe(true);
    expect(spent.use("b", NOW + 1000, NOW)).toBe(true);
    expect(spent.use("c", NOW + 1000, NOW)).toBe(false);
    expect(spent.use("c", NOW + 1000, NOW + 20)).toBe(true);
    expect(spent.use("a", NOW + 1000, NOW + 20)).toBe(false);
  });
});

describe("verifyCaptcha", () => {
  it("altcha never calls Cloudflare", async () => {
    const fetchMock = vi.fn();
    const { token } = await solved();
    const ctx = {
      purpose: "signup" as const,
      ip: "203.0.113.5",
      nowMs: NOW,
      spent: new SpentChallenges(),
      fetch: fetchMock,
    };
    expect(await verifyCaptcha(ALTCHA, token, ctx)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Turnstile asks siteverify with the secret and the IP", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    const ctx = {
      purpose: "signup" as const,
      ip: "203.0.113.5",
      nowMs: NOW,
      spent: new SpentChallenges(),
      fetch: fetchMock as unknown as typeof fetch,
    };
    expect(await verifyCaptcha(TURNSTILE, "tok", ctx)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(String(init.body)).toBe("secret=secret&response=tok&remoteip=203.0.113.5");
  });

  it("refuses without a token or a configured provider", async () => {
    const ctx = { purpose: "signup" as const, ip: null, nowMs: NOW, spent: new SpentChallenges() };
    expect(await verifyCaptcha(ALTCHA, null, ctx)).toBe(false);
    const { token } = await solved();
    expect(await verifyCaptcha({ ...ALTCHA, altchaKey: "" }, token, ctx)).toBe(false);
    expect(await verifyCaptcha({ ...ALTCHA, provider: null }, token, ctx)).toBe(false);
  });
});
