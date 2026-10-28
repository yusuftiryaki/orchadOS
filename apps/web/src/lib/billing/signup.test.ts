import { describe, expect, it } from "vitest";
import {
  type AccountMatch,
  clientIp,
  completeTicket,
  decideMatches,
  hasPasswordAmr,
  hmacHex,
  isExpiredUnverified,
  jwtClaims,
  latestPhoneCodeAt,
  parseRegister,
  REGISTER_MIN_MS,
  registerDelayMs,
  newTicket,
  TICKET_RE,
  ticketHash,
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
        // T27: neither explicit consent is asked; both are forced to false.
        consents: { explicit_service_improvement: false, explicit_marketing: false },
      },
    });
  });

  it("forces both explicit consents to false (T27: a direct POST grants nothing)", () => {
    const parsed = parseRegister({
      ...valid,
      consents: { ...valid.consents, explicit_service_improvement: true, explicit_marketing: true },
    });
    expect(parsed.ok && parsed.value.consents).toEqual({
      kvkk_notice_version: "kvkk-v1-taslak",
      explicit_text_version: "riza-v1-taslak",
      explicit_service_improvement: false,
      explicit_marketing: false,
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

  it("keeps a stale sign-up inside the grace period: nothing replaces it", () => {
    const recent = match({
      user_id: "a",
      matched_by: "email",
      self_signup: true,
      started_at: RECENT,
    });
    expect(decideMatches([recent], NOW)).toEqual({ staleUserIds: [], outcome: "conflict" });
    // Its phone: the code goes to that phone, nothing is created.
    expect(decideMatches([{ ...recent, matched_by: "phone" }], NOW)).toEqual({
      staleUserIds: [],
      outcome: "send_code",
    });
    // Past the grace period it goes.
    const old = { ...recent, started_at: OLD };
    expect(decideMatches([old], NOW)).toEqual({ staleUserIds: ["a"], outcome: "create" });
    expect(decideMatches([{ ...recent, started_at: "not a date" }], NOW).staleUserIds).toEqual([]);
  });

  // Review of PR #93, finding 1: the registrant's own sign-up in progress
  // (their ticket) is replaced; anyone else's stays, by e-mail or phone.
  it("replaces only the registrant's own sign-up inside the grace period", () => {
    const recent = match({
      user_id: "a",
      matched_by: "phone",
      self_signup: true,
      started_at: RECENT,
    });
    expect(decideMatches([{ ...recent, ticket_match: true }], NOW)).toEqual({
      staleUserIds: ["a"],
      outcome: "create",
    });
    expect(decideMatches([{ ...recent, matched_by: "email", ticket_match: true }], NOW)).toEqual({
      staleUserIds: ["a"],
      outcome: "create",
    });
    expect(decideMatches([{ ...recent, ticket_match: false }], NOW)).toEqual({
      staleUserIds: [],
      outcome: "send_code",
    });
    // A verified or completed account is never replaced, ticket or not.
    for (const kept of [
      { ...recent, ticket_match: true, phone_confirmed: true },
      { ...recent, ticket_match: true, signup_completed: true },
    ]) {
      expect(decideMatches([kept], NOW)).toEqual({ staleUserIds: [], outcome: "send_code" });
    }
  });

  // H33: a registered phone answers like a new sign-up; only the phone's
  // owner gets the code.
  it("sends any registered phone to the code step, whoever holds the e-mail", () => {
    const owner = match({ user_id: "a", matched_by: "phone", phone_confirmed: true });
    const other = match({ user_id: "b", matched_by: "email" });
    for (const matches of [
      [owner],
      [owner, { ...owner, matched_by: "email" as const }],
      [owner, other],
      [match({ user_id: "a", matched_by: "phone" })],
      [match({ user_id: "a", matched_by: "profile_phone" })],
      [match({ user_id: "a", matched_by: "profile_phone" }), other],
    ]) {
      expect(decideMatches(matches, NOW)).toEqual({ staleUserIds: [], outcome: "send_code" });
    }
  });

  it("answers a taken e-mail with a free phone as a conflict", () => {
    expect(decideMatches([match({ user_id: "a", matched_by: "email" })], NOW).outcome).toBe(
      "conflict",
    );
    // A completed self sign-up is not stale even with an unconfirmed phone.
    expect(
      decideMatches(
        [match({ user_id: "a", matched_by: "email", self_signup: true, signup_completed: true })],
        NOW,
      ),
    ).toEqual({ staleUserIds: [], outcome: "conflict" });
  });

  it("has only three outcomes, none naming what is registered", () => {
    const outcomes = new Set<string>();
    const kinds = ["email", "phone", "profile_phone"] as const;
    for (const a of kinds) {
      for (const b of kinds) {
        for (const confirmed of [false, true]) {
          outcomes.add(
            decideMatches(
              [
                match({ user_id: "a", matched_by: a, phone_confirmed: confirmed }),
                match({ user_id: "b", matched_by: b }),
              ],
              NOW,
            ).outcome,
          );
        }
      }
    }
    expect([...outcomes].sort()).toEqual(["conflict", "send_code"]);
  });
});

describe("register timing", () => {
  it("pads every answer to the same minimum", () => {
    expect(REGISTER_MIN_MS).toBeGreaterThanOrEqual(1000);
    expect(registerDelayMs(1000, 1000)).toBe(REGISTER_MIN_MS);
    expect(registerDelayMs(1000, 1000 + 400)).toBe(REGISTER_MIN_MS - 400);
    expect(registerDelayMs(1000, 1000 + REGISTER_MIN_MS + 5)).toBe(0);
    expect(registerDelayMs(0, 50, 200)).toBe(150);
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

describe("sign-up ticket", () => {
  it("is 32 random bytes in base64url", () => {
    const a = newTicket();
    const b = newTicket();
    expect(a).toMatch(TICKET_RE);
    expect(b).toMatch(TICKET_RE);
    expect(a).not.toBe(b);
  });

  it("is stored as its SHA-256 in hex (the database's digest)", async () => {
    expect(await ticketHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("rides in register's body; a malformed one counts as none", () => {
    const ticket = newTicket();
    const parsed = parseRegister({ ...valid, ticket });
    expect(parsed.ok && parsed.value.ticket).toBe(ticket);
    for (const bad of ["short", 42, "x".repeat(43) + "!"]) {
      const p = parseRegister({ ...valid, ticket: bad });
      expect(p.ok && p.value.ticket).toBeNull();
    }
    const none = parseRegister(valid);
    expect(none.ok && none.value.ticket).toBeNull();
  });

  it("a complete's ticket is the well-formed one or null; null never skips the check", () => {
    const ticket = newTicket();
    expect(completeTicket({ action: "complete", ticket })).toBe(ticket);
    for (const bad of [undefined, null, "", "abc", 42, `${ticket}x`]) {
      expect(completeTicket({ action: "complete", ticket: bad })).toBeNull();
    }
    expect(completeTicket({ action: "complete" })).toBeNull();
  });

  it("a password session is told by its amr", () => {
    expect(hasPasswordAmr({ amr: [{ method: "password", timestamp: 1 }] })).toBe(true);
    expect(hasPasswordAmr({ amr: [{ method: "otp", timestamp: 1 }] })).toBe(false);
    expect(hasPasswordAmr({ amr: ["password"] })).toBe(false);
    expect(hasPasswordAmr({})).toBe(false);
    expect(hasPasswordAmr(null)).toBe(false);
  });
});
