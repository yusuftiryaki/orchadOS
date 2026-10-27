import { describe, expect, it } from "vitest";
import { annualPerDonumKurus } from "./packages";

// Review of PR #53, finding 5: the unit price is per dönüm and per visit
// (design §6.6), so the annual price of a dönüm multiplies by the visits.
describe("annualPerDonumKurus", () => {
  it("multiplies the unit price by the visits per year", () => {
    // Seed v1 "standart": 12500 kuruş, 4 visits.
    expect(annualPerDonumKurus({ unitPriceKurus: 12_500, periodicVisitsPerYear: 4 })).toBe(50_000);
  });

  it("matches the quote's visit amount for whole dönüm", () => {
    // §6.6: visit_amount = visits × tenths × unit / 10; 20 dönüm = 200 tenths.
    const visitAmount = (4 * 200 * 12_500) / 10;
    expect(20 * annualPerDonumKurus({ unitPriceKurus: 12_500, periodicVisitsPerYear: 4 })).toBe(
      visitAmount,
    );
  });
});
