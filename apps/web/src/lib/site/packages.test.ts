import { describe, expect, it } from "vitest";
import { annualPerDonumKurus, withVatKurus } from "./packages";

// Review of PR #53, finding 5: the unit price is per dönüm and per visit
// (design §6.6), so the annual price of a dönüm multiplies by the visits.
describe("annualPerDonumKurus", () => {
  it("multiplies the unit price by the visits per year", () => {
    // Launch list (docs/fiyatlandirma.md) "standart": 18000 kuruş, 4 visits.
    expect(annualPerDonumKurus({ unitPriceKurus: 18_000, periodicVisitsPerYear: 4 })).toBe(72_000);
  });

  it("matches the quote's visit amount for whole dönüm", () => {
    // §6.6: visit_amount = visits × tenths × unit / 10; 20 dönüm = 200 tenths.
    const visitAmount = (4 * 200 * 18_000) / 10;
    expect(20 * annualPerDonumKurus({ unitPriceKurus: 18_000, periodicVisitsPerYear: 4 })).toBe(
      visitAmount,
    );
  });
});

describe("withVatKurus", () => {
  it("adds the VAT, half up to the kuruş", () => {
    expect(withVatKurus(72_000, 2000)).toBe(86_400);
    expect(withVatKurus(1_120_000, 2000)).toBe(1_344_000);
    expect(withVatKurus(5, 1000)).toBe(6);
  });
});
