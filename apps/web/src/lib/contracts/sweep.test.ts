import { describe, expect, it } from "vitest";
import { cronSecretMatches, parseTicket } from "./sweep";

describe("contract document sweep (T04)", () => {
  it("compares the cron secret exactly and refuses when none is set", () => {
    expect(cronSecretMatches("s3cret", "s3cret")).toBe(true);
    expect(cronSecretMatches("s3cret ", "s3cret")).toBe(false);
    expect(cronSecretMatches("S3cret", "s3cret")).toBe(false);
    expect(cronSecretMatches(null, "s3cret")).toBe(false);
    expect(cronSecretMatches("", "")).toBe(false);
    expect(cronSecretMatches("x", undefined)).toBe(false);
  });

  it("accepts a 64-character hex ticket only", () => {
    expect(parseTicket({ ticket: "a".repeat(64) })).toBe("a".repeat(64));
    for (const body of [{ ticket: "A".repeat(64) }, { ticket: "a".repeat(63) }, { ticket: 1 }, null, "x"]) {
      expect(parseTicket(body)).toBeNull();
    }
  });
});
