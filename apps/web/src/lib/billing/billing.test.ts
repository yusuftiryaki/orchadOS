import { describe, expect, it } from "vitest";
import { BILLING_ERRORS, billingFieldOf, billingReasonOf } from "./errors";
import { donumFromM2, formatDonum, formatKurus, parseTlToKurus } from "./money";

describe("formatKurus", () => {
  it.each([
    [1_200_000, "12.000,00 ₺"],
    [0, "0,00 ₺"],
    [5, "0,05 ₺"],
    [123_456_789, "1.234.567,89 ₺"],
    [-1050, "-10,50 ₺"],
  ])("%d kuruş → %s", (kurus, text) => {
    expect(formatKurus(kurus)).toBe(text);
  });

  it("takes bigint and other currencies", () => {
    expect(formatKurus(BigInt("900719925474099100"))).toBe("9.007.199.254.740.991,00 ₺");
    expect(formatKurus(1999, "EUR")).toBe("19,99 EUR");
  });
});

describe("parseTlToKurus", () => {
  it.each([
    ["12.000,50", 1_200_050],
    ["12000,5", 1_200_050],
    ["12000", 1_200_000],
    ["12.000", 1_200_000],
    ["1.234.567,89", 123_456_789],
    [" 12.000,00 ₺ ", 1_200_000],
    ["250 TL", 25_000],
    ["0,01", 1],
    ["0", 0],
  ])("%s → %d", (input, kurus) => {
    expect(parseTlToKurus(input)).toBe(kurus);
  });

  it.each([
    "",
    "abc",
    "-5",
    "12000.50",
    "12,345",
    "12.00,5",
    "1.2345",
    "12000,",
    "1e3",
    "99999999999999999999",
  ])("rejects %j", (input) => {
    expect(parseTlToKurus(input)).toBeNull();
  });

  it("is exact where floats are not (0,29 TL)", () => {
    expect(parseTlToKurus("0,29")).toBe(29);
    expect(parseTlToKurus("1.000.000,07")).toBe(100_000_007);
  });
});

describe("dönüm", () => {
  it("converts and formats m²", () => {
    expect(donumFromM2(20_000)).toBe(20);
    expect(formatDonum(20_100)).toBe("20,1 dönüm");
    expect(formatDonum(15_000)).toBe("15 dönüm");
    expect(formatDonum(19_584)).toBe("19,6 dönüm");
  });
});

describe("billingReasonOf", () => {
  it("keeps every known reason code", () => {
    for (const code of BILLING_ERRORS) {
      expect(billingReasonOf({ code: "P0001", message: code })).toBe(code);
    }
  });

  it("maps privilege and unique errors without one of our messages", () => {
    expect(
      billingReasonOf({ code: "42501", message: "permission denied for column ops_note" }),
    ).toBe("forbidden");
    expect(billingReasonOf({ code: "23505", message: "duplicate key value" })).toBe("exists");
    expect(billingReasonOf({ code: "XX000", message: "boom" })).toBe("write_failed");
    expect(billingReasonOf(null)).toBe("write_failed");
  });

  it("reads a plain field name from the detail only", () => {
    expect(billingFieldOf({ details: "identity_number" })).toBe("identity_number");
    expect(billingFieldOf({ details: "Failing row contains (x)" })).toBeUndefined();
    expect(billingFieldOf(null)).toBeUndefined();
  });
});
