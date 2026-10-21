import { describe, expect, it } from "vitest";
import { LOGIN_METHODS, phoneCodeError, resendWaitSeconds, safeNextPath } from "./login-methods";

describe("login", () => {
  it("offers password and phone sign-in", () => {
    expect(LOGIN_METHODS.filter((m) => m.enabled).map((m) => m.id)).toEqual(["password", "phone"]);
  });

  it.each([
    ["/portal/parsel/x", "/portal/parsel/x"],
    ["/", "/"],
    [undefined, "/"],
    [["/a"], "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
  ])("next=%j -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("phone code", () => {
  it.each([
    [null, null],
    [{ code: "otp_disabled", message: "Signups not allowed for otp" }, "not_registered"],
    [{ code: "unknown", message: "phone_locked" }, "locked"],
    [{ code: "unknown", message: "too_many_codes" }, "tooManyCodes"],
    [{ code: "over_sms_send_rate_limit", message: "after 59 seconds" }, "tooSoon"],
    [{ code: "unknown", message: "sms_not_sent" }, "sendFailed"],
  ])("%j -> %s", (error, expected) => {
    expect(phoneCodeError(error)).toBe(expected);
  });

  it("counts down 60 seconds before a resend", () => {
    const sentAt = 1_000_000;
    expect(resendWaitSeconds(null, sentAt)).toBe(0);
    expect(resendWaitSeconds(sentAt, sentAt)).toBe(60);
    expect(resendWaitSeconds(sentAt, sentAt + 59_001)).toBe(1);
    expect(resendWaitSeconds(sentAt, sentAt + 60_000)).toBe(0);
  });
});
