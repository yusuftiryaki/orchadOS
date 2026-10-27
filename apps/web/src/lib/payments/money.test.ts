import { describe, expect, it } from "vitest";
import {
  kurusToPrice,
  normalizePriceForSignature,
  priceToKurus,
} from "../../../../../supabase/functions/_shared/payments/money.ts";

describe("priceToKurus", () => {
  it.each([
    ["10.5100", 1051],
    ["12000", 1200000],
    ["12000.00", 1200000],
    ["0.01", 1],
    ["0.1", 10],
    ["7.5000", 750],
  ])("%s -> %d", (input, expected) => {
    expect(priceToKurus(input)).toBe(expected);
  });

  it.each(["0.285", "1e3", "-1", "1.", ".5", "1,5", " 1", "1.00001", "", "abc", "10.5101"])(
    "%j -> null",
    (input) => {
      expect(priceToKurus(input)).toBeNull();
    },
  );

  it("accepts JSON numbers as their shortest form and rejects float noise", () => {
    expect(priceToKurus(120.5)).toBe(12050);
    expect(priceToKurus(0.1 + 0.2)).toBeNull();
    expect(priceToKurus(1e21)).toBeNull();
    expect(priceToKurus(null)).toBeNull();
  });
});

describe("kurusToPrice", () => {
  it("formats with two decimals", () => {
    expect(kurusToPrice(1200000)).toBe("12000.00");
    expect(kurusToPrice(1051)).toBe("10.51");
    expect(kurusToPrice(5)).toBe("0.05");
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => kurusToPrice(-1)).toThrow();
    expect(() => kurusToPrice(1.5)).toThrow();
  });
});

describe("normalizePriceForSignature", () => {
  it.each([
    ["10.50", "10.5"],
    ["10.0", "10"],
    ["10", "10"],
    ["100", "100"],
    ["0.10", "0.1"],
    [10.5, "10.5"],
  ])("%j -> %s", (input, expected) => {
    expect(normalizePriceForSignature(input)).toBe(expected);
  });
});
