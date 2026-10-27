import { describe, expect, it } from "vitest";
import { formatTry, formatVatRate } from "./format";

// Intl puts a narrow no-break space between the amount and the sign.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatTry", () => {
  it.each([
    [0, "₺0"],
    [125_000, "₺1.250"],
    [125_050, "₺1.250,50"],
    [99, "₺0,99"],
    [1_000_000_00, "₺1.000.000"],
  ])("%i kuruş -> %s", (kurus, expected) => {
    expect(plain(formatTry(kurus))).toBe(expected);
  });
});

describe("formatVatRate", () => {
  it("formats basis points", () => {
    expect(formatVatRate(2000)).toBe("20");
    expect(formatVatRate(150)).toBe("1,5");
  });
});
