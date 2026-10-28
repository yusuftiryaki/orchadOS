import { describe, expect, it } from "vitest";
import {
  type AccountMatch,
  captchaMode,
  clientIp,
  decideMatches,
  hmacHex,
  isExpiredUnverified,
  jwtClaims,
  latestPhoneCodeAt,
  parseRegister,
  timingSafeEqual,
} from "../../../../../supabase/functions/_shared/signup";

// The rules of the customer-signup Edge Function (docs/musteri-yonetimi.md §7).

const valid = {
  action: "register",
  full_name: "  Ayşe   Yılmaz ",
  phone: "+905321234567",
  email: "Ayse@Example.com",
  password: "en-az-8-karakter",
  contact_preference: "whatsapp",
  consents: {
    kvkk_notice_version: "kvkk-v1-taslak",
    explicit_text_version: "riza-v1-taslak",
    explicit_service_improvement: false,
    explicit_marketing: true,
  },
  client_ip: "203.0.113.5",
};

describe("parseRegister", () => {
  it("accepts and normalises a valid body", () => {
    const parsed = parseRegister(valid);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        fullName: "Ayşe Yılmaz",
        email: "ayse@example.com",
        phone: "+905321234567",
        contactPreference: "whatsapp",
        clientIp: "203.0.113.5",
        captchaToken: null,
        consents: { explicit_service_improvement: false, explicit_marketing: true },
      },
    });
  });

  it.each([
    ["full_name", { full_name: "A" }],
    ["full_name", { full_name: "x".repeat(121) }],
    ["phone", { phone: "+15551234567" }],
    ["phone", { phone: "05321234567" }],
    ["phone", { phone: "+90532123456" }],
    ["email", { email: "not-an-email" }],
    ["password", { password: "short" }],
    ["password", { password: "ç".repeat(40) }],
    ["contact_preference", { contact_preference: "phone_call" }],
    ["consents", { consents: null }],
    ["kvkk_notice_version", { consents: { ...valid.consents, kvkk_notice_version: "KVKK v1" } }],
    ["explicit_text_version", { consents: { ...valid.consents, explicit_text_version: "" } }],
    [
      "explicit_service_improvement",
      { consents: { ...valid.consents, explicit_service_improvement: "true" } },
    ],
    ["explicit_marketing", { consents: { ...valid.consents, explicit_marketing: undefined } }],
    ["client_ip", { client_ip: "not an ip" }],
  ])("rejects a bad %s, naming the field only", (field, change) => {
    const body = { ...valid, ...change };
    const parsed = parseRegister(body);
    expect(parsed).toEqual({ ok: false, field });
    // The error never carries the value.
    expect(JSON.stringify(parsed)).not.toContain("+15551234567");
  });

  it("rejects what is not an object", () => {
    expect(parseRegister(null)).toEqual({ ok: false, field: "body" });
    expect(parseRegister([valid])).toEqual({ ok: false, field: "body" });
  });
});

describe("hashes and secrets", () => {
  it("hmacHex is HMAC-SHA256 in hex", async () => {
    // RFC 4231, test case 2.
    expect(await hmacHex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("timingSafeEqual compares whole strings", () => {
    expect(timingSafeEqual("signup-proxy-local", "signup-proxy-local")).toBe(true);
    expect(timingSafeEqual("signup-proxy-local", "signup-proxy-locaL")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("trusts the body's client_ip only with the proxy secret", () => {
    const headers = (h: Record<string, string>) => new Headers(h);
    const secret = "signup-proxy-local";
    expect(clientIp(headers({ "x-orchados-proxy-secret": secret }), "203.0.113.9", secret)).toBe(
      "203.0.113.9",
    );
    expect(
      clientIp(
        headers({
          "x-orchados-proxy-secret": "wrong",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        }),
        "203.0.113.9",
        secret,
      ),
    ).toBe("198.51.100.1");
    expect(
      clientIp(
        headers({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.1" }),
        null,
        secret,
      ),
    ).toBe("198.51.100.7");
    // No secret configured: the body is never trusted.
    expect(clientIp(headers({ "x-orchados-proxy-secret": "" }), "203.0.113.9", "")).toBeNull();
  });
});

const NOW = Date.parse("2026-10-27T12:00:00Z");
const OLD = "2026-10-27T11:00:00Z";
const RECENT = "2026-10-27T11:50:00Z";

const match = (m: Partial<AccountMatch> & Pick<AccountMatch, "user_id" | "matched_by">) => ({
  self_signup: false,
  phone_confirmed: false,
  signup_completed: false,
  started_at: OLD,
  ...m,
});

describe("decideMatches", () => {
  it("creates the account when nothing matches", () => {
    expect(decideMatches([], NOW)).toEqual({ staleUserIds: [], outcome: "create" });
  });

  it("deletes stale self sign-ups and goes on", () => {
    const stale = match({ user_id: "a", matched_by: "email", self_signup: true });
    const stalePhone = { ...stale, matched_by: "phone" as const };
    expect(decideMatches([stale, stalePhone], NOW)).toEqual({
      staleUserIds: ["a"],
      outcome: "create",
    });
  });

  it("keeps a stale sign-up inside the grace period: the same e-mail or phone is refused", () => {
    const recent = match({
      user_id: "a",
      matched_by: "email",
      self_signup: true,
      started_at: RECENT,
    });
    expect(decideMatches([recent], NOW)).toEqual({ staleUserIds: [], outcome: "email_taken" });
    expect(decideMatches([{ ...recent, matched_by: "phone" }], NOW)).toEqual({
      staleUserIds: [],
      outcome: "phone_registered",
    });
    // Past the grace period it goes.
    const old = { ...recent, started_at: OLD };
    expect(decideMatches([old], NOW)).toEqual({ staleUserIds: ["a"], outcome: "create" });
    expect(decideMatches([{ ...recent, started_at: "not a date" }], NOW).staleUserIds).toEqual([]);
  });

  it("sends the verified owner of the phone to the code step", () => {
    const owner = match({ user_id: "a", matched_by: "phone", phone_confirmed: true });
    expect(decideMatches([owner], NOW).outcome).toBe("existing_account");
    expect(decideMatches([owner, { ...owner, matched_by: "email" }], NOW).outcome).toBe(
      "existing_account",
    );
  });

  it("refuses a verified phone whose e-mail is someone else's", () => {
    const owner = match({ user_id: "a", matched_by: "phone", phone_confirmed: true });
    const other = match({ user_id: "b", matched_by: "email" });
    expect(decideMatches([owner, other], NOW).outcome).toBe("email_taken");
  });

  it("refuses another customer's profile phone, a taken e-mail and an unverified phone", () => {
    expect(decideMatches([match({ user_id: "a", matched_by: "profile_phone" })], NOW).outcome).toBe(
      "phone_registered",
    );
    expect(decideMatches([match({ user_id: "a", matched_by: "email" })], NOW).outcome).toBe(
      "email_taken",
    );
    expect(decideMatches([match({ user_id: "a", matched_by: "phone" })], NOW).outcome).toBe(
      "phone_registered",
    );
    // A completed self sign-up is not stale even with an unconfirmed phone.
    expect(
      decideMatches(
        [match({ user_id: "a", matched_by: "email", self_signup: true, signup_completed: true })],
        NOW,
      ),
    ).toEqual({ staleUserIds: [], outcome: "email_taken" });
  });
});

function token(claims: unknown): string {
  const part = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `x.${part}.y`;
}

describe("complete: phone code check", () => {
  const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  it("gives the latest otp or sms login", () => {
    const claims = jwtClaims(
      token({
        amr: [
          { method: "otp", timestamp: at("2026-10-27T10:01:00Z") },
          { method: "sms", timestamp: at("2026-10-27T10:03:00Z") },
          { method: "password", timestamp: at("2026-10-27T10:05:00Z") },
        ],
      }),
    );
    expect(latestPhoneCodeAt(claims)).toBe(at("2026-10-27T10:03:00Z"));
  });

  it("gives null for a password login or no claims", () => {
    expect(
      latestPhoneCodeAt({ amr: [{ method: "password", timestamp: at("2026-10-27T10:05:00Z") }] }),
    ).toBeNull();
    expect(latestPhoneCodeAt({ amr: [{ method: "otp" }] })).toBeNull();
    expect(latestPhoneCodeAt(null)).toBeNull();
    expect(jwtClaims("not-a-token")).toBeNull();
  });
});

describe("cleanup", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  it("picks self sign-ups unverified for more than a day", () => {
    const old = {
      app_metadata: { signup: "self" },
      phone_confirmed_at: null,
      created_at: "2026-10-27T11:00:00Z",
    };
    expect(isExpiredUnverified(old, now)).toBe(true);
    expect(isExpiredUnverified({ ...old, created_at: "2026-10-27T13:00:00Z" }, now)).toBe(false);
    expect(isExpiredUnverified({ ...old, phone_confirmed_at: "2026-10-27T11:01:00Z" }, now)).toBe(
      false,
    );
    expect(isExpiredUnverified({ ...old, app_metadata: {} }, now)).toBe(false);
  });
});

describe("captcha mode", () => {
  it("verifies whenever the Turnstile secret is set", () => {
    expect(captchaMode("secret", undefined)).toBe("verify");
    expect(captchaMode("secret", "1")).toBe("verify");
  });

  it("fails closed without the secret unless the local switch is on", () => {
    expect(captchaMode("", undefined)).toBe("unconfigured");
    expect(captchaMode("", "")).toBe("unconfigured");
    expect(captchaMode("", "true")).toBe("unconfigured");
    expect(captchaMode("", "1")).toBe("skip");
  });
});
