import { describe, expect, it } from "vitest";
import { failWith, maskedFromLast2, parseInvite } from "./viewers";

describe("viewer invitations", () => {
  it("normalises the name and a Turkish phone number", () => {
    expect(parseInvite("  Ayşe   Yılmaz ", "0532 123 45 67")).toEqual({
      ok: true,
      name: "Ayşe Yılmaz",
      phone: "+905321234567",
    });
    expect(parseInvite("Ali Veli", "+90 532 123 45 67")).toMatchObject({ phone: "+905321234567" });
  });

  it("refuses a missing name or a bad phone", () => {
    expect(parseInvite(" ", "05321234567")).toEqual({ ok: false, error: "invalid_name" });
    expect(parseInvite("Ali", "")).toEqual({ ok: false, error: "invalid_phone" });
    expect(parseInvite("Ali", "abc")).toEqual({ ok: false, error: "invalid_phone" });
    expect(parseInvite("x".repeat(121), "05321234567")).toEqual({
      ok: false,
      error: "invalid_name",
    });
  });

  it("shows only the last two digits", () => {
    expect(maskedFromLast2("67")).toBe("••• ••• •• 67");
    expect(maskedFromLast2(null)).toBe("");
    expect(maskedFromLast2("6a")).toBe("");
  });

  it("maps the read-only guard of a removed garden (IP14)", () => {
    expect(failWith({ code: "P0001", message: "parcel_read_only" })).toEqual({
      ok: false,
      error: "parcel_read_only",
    });
    expect(failWith({ code: "P0001", message: "something" })).toEqual({
      ok: false,
      error: "write_failed",
    });
  });
});
